"""LiteLLM-based direct AI card generation workflow."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from ..providers.litellm_adapter import litellm_completion
from ..schemas.ai_card_generation import AiCardGenerationResult, AiGeneratedCard
from .card_generation import _wait_rate_limit

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)


class WorkflowError(RuntimeError):
    """Raised for user-facing workflow failures."""


class JobCancelled(RuntimeError):
    """Raised when the background job has been cancelled."""


SYSTEM_PROMPT = """\
You generate compact Chinese knowledge review cards for a spaced-repetition app.

DeepSeek JSON mode requirement: always return valid json only.

Rules:
- Output Chinese knowledge-point cards only.
- Stay strictly faithful to the source chunk. Do not add facts, examples, explanations, or context that is not in the source text.
- Prefer zero cards over weak cards. Skip metadata, references, headers, footers, navigation text, boilerplate, and vague paragraphs.
- Generate only durable knowledge points: core concepts, definitions, mechanisms, conditions, steps, distinctions, formula meanings, conclusion boundaries, or source-backed examples.
- Use two card styles: knowledge_point and concept_explanation. Do not create trivia, yes/no questions, generic recall questions, or fragmented fact cards.
- The front is a knowledge cue or concept label, not necessarily a question. Prefer forms like "间隔重复：核心机制", "过拟合与泛化：关键区别", or "贝叶斯公式：适用条件".
- Avoid generic fronts such as "是什么？", "请简述...", "如何理解...", and "有什么特点？" unless the source itself makes that wording necessary.
- The back must be 1-3 short Chinese sentences that explain the definition, mechanism, boundary, distinction, or source-backed example.
- Do not mechanically copy a whole paragraph into the back.
- Return one JSON object only, never a top-level array, Markdown, code fences, or explanatory text.
- The JSON object shape must be exactly: {"cards":[{"title":"...","front":"...","back":"...","sourcePage":1,"sourceQuote":"...","sourceChunkId":"...","tags":["..."]}]}.
- Escape all quotes and newlines inside string values.
- sourceQuote must be an exact excerpt copied from the source chunk.
"""

JSON_RETRY_PROMPT = """\
Your previous response was not valid JSON. Return only one valid JSON object using knowledge-point or concept-explanation card wording:
{"cards":[{"title":"间隔重复","front":"间隔重复：核心机制","back":"用1-3句中文说明该知识点的定义、机制或边界。","sourcePage":1,"sourceQuote":"从原文精确复制的短引文","sourceChunkId":"chunk-id","tags":["学习方法"]}]}

Do not include Markdown. Escape quotes inside strings. If there are no useful cards, return {"cards":[]}.
"""


DENSITY_TO_MAX_CARDS_PER_CHUNK = {
    "low": 1,
    "medium": 1,
    "high": 2,
}

DENSITY_TO_GLOBAL_CARD_LIMIT = {
    "low": 6,
    "medium": 12,
    "high": 20,
}

DENSITY_TO_MAX_TOKENS = {
    "low": 3000,
    "medium": 3400,
    "high": 4200,
}


def _strip_code_fence(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
        stripped = re.sub(r"\s*```$", "", stripped)
    return stripped.strip()


def _decode_first_json_value(text: str) -> Any:
    stripped = _strip_code_fence(text)
    if not stripped:
        raise WorkflowError("LLM response was empty; expected a JSON object")
    try:
        return json.loads(stripped)
    except json.JSONDecodeError as first_error:
        decoder = json.JSONDecoder()
        match = re.search(r"\{", stripped)
        if match:
            try:
                value, _ = decoder.raw_decode(stripped[match.start() :])
                return value
            except json.JSONDecodeError:
                pass
        raise WorkflowError(
            f"LLM response was not valid JSON: {first_error.msg} "
            f"at line {first_error.lineno} column {first_error.colno}"
        ) from first_error


def _extract_json_array(text: str) -> list[Any]:
    value = _decode_first_json_value(text)
    if not isinstance(value, dict):
        raise WorkflowError("LLM response must be a JSON object with a cards array")
    cards = value.get("cards")
    if not isinstance(cards, list):
        raise WorkflowError("LLM response JSON did not contain a cards array")
    return cards


def _should_propagate_json_mode_error(error: Exception) -> bool:
    message = str(error).casefold()
    return "response_format" not in message and "json" not in message


def _completion_with_json_mode(
    *,
    config: dict,
    api_key: str,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
) -> str:
    try:
        return litellm_completion(
            config=config,
            api_key=api_key,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
    except TypeError:
        raise
    except Exception as exc:
        if _should_propagate_json_mode_error(exc):
            raise
        logger.info("Provider rejected JSON response_format; retrying without JSON mode")
        return litellm_completion(
            config=config,
            api_key=api_key,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )


def _chunk_page_start(chunk: dict[str, Any]) -> int | None:
    value = chunk.get("pageStart") or chunk.get("page_start")
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _chunk_page_end(chunk: dict[str, Any]) -> int | None:
    value = chunk.get("pageEnd") or chunk.get("page_end") or _chunk_page_start(chunk)
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _chunk_content(chunk: dict[str, Any]) -> str:
    return str(chunk.get("content") or chunk.get("text") or chunk.get("snippet") or "").strip()


def _filter_chunks(
    chunks: list[dict[str, Any]],
    page_start: int | None,
    page_end: int | None,
) -> list[dict[str, Any]]:
    filtered = []
    for chunk in chunks:
        content = _chunk_content(chunk)
        if not content:
            continue
        start = _chunk_page_start(chunk)
        end = _chunk_page_end(chunk)
        if page_start is not None and end is not None and end < page_start:
            continue
        if page_end is not None and start is not None and start > page_end:
            continue
        filtered.append(chunk)
    return filtered


def _build_user_prompt(chunk: dict[str, Any], max_cards: int) -> str:
    page_start = _chunk_page_start(chunk)
    page_end = _chunk_page_end(chunk)
    page_label = f"{page_start}-{page_end}" if page_start and page_end and page_start != page_end else str(page_start or "?")
    source_chunk = _chunk_content(chunk)
    return f"""\
Generate up to {max_cards} compact Chinese knowledge review cards from this source chunk.
First identify the core knowledge points in this chunk, then decide whether any card is worth generating.
Return {{"cards":[]}} if the source chunk does not contain durable review-worthy knowledge.

Allowed card styles:
- knowledge_point: front is a knowledge cue; back explains the key definition, mechanism, condition, distinction, step, or boundary.
- concept_explanation: front is a concept label; back explains its meaning, features, boundary, or source-backed example.

Field guidance:
- title: a stable concept name, not a generic question.
- front: a concise knowledge cue or concept label. Avoid generic question wording.
- back: 1-3 short Chinese sentences faithful to the source.
- tags: concept/domain tags, not "问题" or "问答".

Source metadata:
- sourceChunkId: {chunk.get("id")}
- pageRange: {page_label}

Source chunk:
{source_chunk}

Return one valid json object only:
{{"cards":[{{"title":"间隔重复","front":"间隔重复：核心机制","back":"间隔重复通过拉开复习间隔来强化长期记忆。关键在于根据遗忘趋势安排下一次复习，而不是集中重复。","sourcePage":{page_start or 1},"sourceQuote":"从原文精确复制的短引文","sourceChunkId":"{chunk.get("id")}","tags":["学习方法"]}}]}}
"""
    return f"""\
Generate up to {max_cards} compact flashcards from this source chunk.
Return {{"cards":[]}} if the source chunk does not contain durable review-worthy knowledge.

Source metadata:
- sourceChunkId: {chunk.get("id")}
- pageRange: {page_label}

Source chunk:
{_chunk_content(chunk)}

Return one valid json object only:
{{"cards":[{{"title":"短标题","front":"一个具体问题？","back":"1-3句中文答案。","sourcePage":{page_start or 1},"sourceQuote":"从原文精确复制的短引文","sourceChunkId":"{chunk.get("id")}","tags":["主题"]}}]}}
"""


def _completion_settings_for_density(density: str) -> tuple[int, int]:
    density_key = density.strip().lower()
    return (
        DENSITY_TO_MAX_CARDS_PER_CHUNK.get(density_key, 1),
        DENSITY_TO_MAX_TOKENS.get(density_key, 3400),
    )


def generate_chunk_cards(
    *,
    job_id: str,
    document_id: str,
    group_id: str,
    density: str,
    provider_config_id: str,
    chunk: dict[str, Any],
    host: "HostGatewayClient",
) -> dict[str, Any]:
    """Generate cards for one selected chunk.

    Rust owns job-level iteration, checkpointing, timeout policy, and final persistence.
    """
    _ = document_id, group_id
    density_key = density.strip().lower()
    if density_key not in DENSITY_TO_MAX_CARDS_PER_CHUNK:
        raise WorkflowError(f"Unsupported density: {density}")
    if not _chunk_content(chunk):
        return {"status": "ok", "cards": [], "discardedCount": 0, "retryCount": 0}

    config = host.get_config(provider_config_id)
    if not config:
        raise WorkflowError("Model config does not exist")
    api_key = "" if config.get("authMode") == "adc" else host.get_api_key(provider_config_id)
    max_cards_per_chunk, max_tokens = _completion_settings_for_density(density_key)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _build_user_prompt(chunk, max_cards_per_chunk)},
    ]

    consecutive_rate_limits = 0
    retry_count = 0
    items: list[Any] | None = None
    json_error: WorkflowError | None = None
    for parse_attempt in range(2):
        while True:
            _raise_if_cancelled(job_id, host)
            try:
                raw = _completion_with_json_mode(
                    config=config,
                    api_key=api_key,
                    messages=messages,
                    temperature=0.1,
                    max_tokens=max_tokens,
                )
                consecutive_rate_limits = 0
                break
            except Exception as exc:
                if _wait_rate_limit(exc, consecutive_rate_limits):
                    consecutive_rate_limits += 1
                    _raise_if_cancelled(job_id, host)
                    continue
                raise
            finally:
                _raise_if_cancelled(job_id, host)

        try:
            items = _extract_json_array(raw)
            break
        except WorkflowError as exc:
            json_error = exc
            logger.warning("Invalid AI card JSON for chunk %s: %s", chunk.get("id"), exc)
            if parse_attempt == 0:
                retry_count += 1
                messages.append({"role": "assistant", "content": raw[:2000]})
                messages.append({"role": "user", "content": JSON_RETRY_PROMPT})

    if items is None:
        raise json_error or WorkflowError("LLM response was not valid JSON")

    chunk_id = str(chunk.get("id") or "")
    batch = AiCardGenerationResult.parse_llm_json(items, {chunk_id: chunk})
    return {
        "status": "ok",
        "cards": [card.model_dump(by_alias=True) for card in batch.cards],
        "discardedCount": batch.discarded_count,
        "retryCount": retry_count,
    }


def _raise_if_cancelled(job_id: str, host: "HostGatewayClient") -> None:
    if host.is_job_cancelled(job_id):
        raise JobCancelled(job_id)


def _update_progress(
    host: "HostGatewayClient",
    job_id: str,
    current: int,
    total: int,
    message: str,
) -> None:
    try:
        host.update_background_job_progress(
            job_id,
            progress_current=current,
            progress_total=total,
            progress_message=message,
        )
    except Exception as exc:
        logger.warning("Failed to update AI card generation progress: %s", exc)


def _load_checkpoint(host: "HostGatewayClient", job_id: str, checkpoint: dict | None) -> dict:
    if checkpoint is not None:
        return checkpoint
    try:
        return host.get_background_job_checkpoint(job_id) or {}
    except Exception as exc:
        logger.warning("Failed to load AI card generation checkpoint: %s", exc)
        return {}


def _checkpoint_cards(raw_cards: Any) -> list[AiGeneratedCard]:
    if not isinstance(raw_cards, list):
        return []
    cards: list[AiGeneratedCard] = []
    for raw_card in raw_cards:
        try:
            cards.append(AiGeneratedCard.model_validate(raw_card))
        except Exception:
            continue
    return cards


def _checkpoint_next_chunk_index(checkpoint: dict, total_chunks: int) -> int:
    try:
        value = int(checkpoint.get("nextChunkIndex") or 0)
    except (TypeError, ValueError):
        return 0
    return max(0, min(value, total_chunks))


def _checkpoint_discarded_count(checkpoint: dict) -> int:
    try:
        return max(0, int(checkpoint.get("discardedCount") or 0))
    except (TypeError, ValueError):
        return 0


def _update_checkpoint(
    host: "HostGatewayClient",
    job_id: str,
    *,
    document_id: str,
    group_id: str,
    page_start: int | None,
    page_end: int | None,
    density: str,
    provider_config_id: str,
    next_chunk_index: int,
    total_chunks: int,
    cards: list[AiGeneratedCard],
    discarded_count: int,
    phase: str,
    message: str,
) -> None:
    checkpoint = {
        "documentId": document_id,
        "groupId": group_id,
        "pageStart": page_start,
        "pageEnd": page_end,
        "density": density,
        "providerConfigId": provider_config_id,
        "nextChunkIndex": next_chunk_index,
        "totalChunks": total_chunks,
        "cards": [card.model_dump(by_alias=True) for card in cards],
        "discardedCount": discarded_count,
        "phase": phase,
        "message": message,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    try:
        host.update_background_job_checkpoint(job_id, checkpoint)
    except Exception as exc:
        logger.warning("Failed to update AI card generation checkpoint: %s", exc)


def run_litellm_card_generation(
    job_id: str,
    document_id: str,
    group_id: str,
    page_start: int | None,
    page_end: int | None,
    density: str,
    provider_config_id: str,
    host: "HostGatewayClient",
    checkpoint: dict | None = None,
) -> AiCardGenerationResult:
    density_key = density.strip().lower()
    if density_key not in DENSITY_TO_MAX_CARDS_PER_CHUNK:
        raise WorkflowError(f"Unsupported density: {density}")

    config = host.get_config(provider_config_id)
    if not config:
        raise WorkflowError("模型配置不存在")
    api_key = "" if config.get("authMode") == "adc" else host.get_api_key(provider_config_id)

    chunks = _filter_chunks(host.list_chunks(document_id), page_start, page_end)
    if not chunks:
        raise WorkflowError("页码范围无文本")
    chunks = chunks[: DENSITY_TO_GLOBAL_CARD_LIMIT[density_key]]

    checkpoint_payload = _load_checkpoint(host, job_id, checkpoint)
    result_cards = _checkpoint_cards(checkpoint_payload.get("cards"))
    discarded_count = _checkpoint_discarded_count(checkpoint_payload)
    total_chunks = len(chunks)
    start_index = _checkpoint_next_chunk_index(checkpoint_payload, total_chunks)
    _update_progress(
        host,
        job_id,
        start_index,
        total_chunks,
        f"AI card generation resumed from chunk {start_index}/{total_chunks}"
        if start_index > 0
        else "AI card generation started",
    )

    for index, chunk in enumerate(chunks[start_index:], start=start_index + 1):
        _raise_if_cancelled(job_id, host)
        _update_progress(
            host,
            job_id,
            index - 1,
            total_chunks,
            f"Generating cards from chunk {index}/{total_chunks}",
        )

        result = generate_chunk_cards(
            job_id=job_id,
            document_id=document_id,
            group_id=group_id,
            density=density,
            provider_config_id=provider_config_id,
            chunk=chunk,
            host=host,
        )
        result_cards.extend(AiGeneratedCard.model_validate(card) for card in result["cards"])
        discarded_count += int(result.get("discardedCount") or 0)
        if len(result_cards) >= DENSITY_TO_GLOBAL_CARD_LIMIT[density_key]:
            result_cards = result_cards[: DENSITY_TO_GLOBAL_CARD_LIMIT[density_key]]
            break
        _raise_if_cancelled(job_id, host)
        progress_message = (
            f"Generated {len(result_cards)} card candidates from {index}/{total_chunks} chunks"
        )
        _update_checkpoint(
            host,
            job_id,
            document_id=document_id,
            group_id=group_id,
            page_start=page_start,
            page_end=page_end,
            density=density,
            provider_config_id=provider_config_id,
            next_chunk_index=index,
            total_chunks=total_chunks,
            cards=result_cards,
            discarded_count=discarded_count,
            phase="generating",
            message=progress_message,
        )
        _update_progress(
            host,
            job_id,
            index,
            total_chunks,
            progress_message,
        )

    _update_checkpoint(
        host,
        job_id,
        document_id=document_id,
        group_id=group_id,
        page_start=page_start,
        page_end=page_end,
        density=density,
        provider_config_id=provider_config_id,
        next_chunk_index=total_chunks,
        total_chunks=total_chunks,
        cards=result_cards,
        discarded_count=discarded_count,
        phase="completed",
        message=f"Generated {len(result_cards)} card candidates from {total_chunks}/{total_chunks} chunks",
    )
    return AiCardGenerationResult(cards=result_cards, discardedCount=discarded_count)
