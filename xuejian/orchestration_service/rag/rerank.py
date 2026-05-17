"""Evidence reranking — local rule and LLM provider modes."""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from .audit import _chunk_content, _chunk_id, _chunk_score, _strip_code_fence, _truncate_text
from .constants import (
    ALLOWED_RERANK_MODES,
    RERANK_LLM_MAX_CHUNKS,
    RERANK_MODE_ENV,
)
from .exceptions import KnowledgeQaJsonError
from .prompts import RERANK_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


def _decode_first_json_value(text: str) -> Any:
    stripped = _strip_code_fence(text)
    if not stripped:
        raise KnowledgeQaJsonError("empty model content")
    if stripped.startswith("["):
        raise KnowledgeQaJsonError("top-level JSON array is not allowed")
    decoder = json.JSONDecoder()
    start = stripped.find("{")
    if start < 0:
        raise KnowledgeQaJsonError("model content does not contain a JSON object")
    value, _ = decoder.raw_decode(stripped[start:])
    return value


def _extract_rerank_scores(text: str) -> dict[str, float]:
    value = _decode_first_json_value(text)
    if not isinstance(value, dict):
        raise KnowledgeQaJsonError("rerank payload must be an object")
    rankings = value.get("rankings")
    if not isinstance(rankings, list):
        raise KnowledgeQaJsonError("rerank payload is missing rankings")

    scores: dict[str, float] = {}
    for item in rankings:
        if not isinstance(item, dict):
            continue
        chunk_id = item.get("chunkId")
        score = item.get("score")
        if not isinstance(chunk_id, str) or not chunk_id:
            continue
        if not isinstance(score, (int, float)):
            continue
        scores[chunk_id] = max(0.0, min(1.0, float(score)))
    return scores


def _question_terms(text: str) -> list[str]:
    normalized = _truncate_text(text, 120)
    if not normalized:
        return []

    terms: list[str] = []
    seen: set[str] = set()
    for token in re.findall(r"[A-Za-z0-9_\-]{2,}", normalized.lower()):
        if token not in seen:
            seen.add(token)
            terms.append(token)

    for token in re.findall(r"[\u4e00-\u9fff]{2,}", normalized):
        variants = [token]
        if len(token) > 2:
            variants.extend(token[index : index + 2] for index in range(len(token) - 1))
        for variant in variants:
            if variant and variant not in seen:
                seen.add(variant)
                terms.append(variant)
        if len(terms) >= 24:
            break

    return terms[:24]


def _term_overlap_score(terms: list[str], text: str) -> float:
    if not terms or not text:
        return 0.0

    lowered = text.lower()
    matched = 0
    for term in terms:
        if re.search(r"[A-Za-z0-9_]", term):
            if term.lower() in lowered:
                matched += 1
        elif term in text:
            matched += 1
    return matched / max(1, len(terms))


def resolve_rerank_mode(config: dict[str, Any] | None = None) -> str:
    config = config or {}
    configured_mode = config.get("rerankMode")
    if isinstance(configured_mode, str):
        normalized = configured_mode.strip().lower()
        if normalized in ALLOWED_RERANK_MODES:
            return normalized

    env_value = os.environ.get(RERANK_MODE_ENV, "local_rule").strip().lower()
    return env_value if env_value in ALLOWED_RERANK_MODES else "local_rule"


def _invoke_model(config: dict[str, Any], api_key: str, messages: list[Any]) -> str:
    from ..providers.runtime import build_langchain_chat_model
    from .constants import MODEL_MAX_TOKENS, MODEL_TIMEOUT_SECONDS

    llm = build_langchain_chat_model(
        config,
        api_key,
        0.2,
        timeout=MODEL_TIMEOUT_SECONDS,
        max_tokens=MODEL_MAX_TOKENS,
    )
    response = llm.invoke(messages)
    content = getattr(response, "content", response)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                value = item.get("text") or item.get("content")
                if isinstance(value, str):
                    parts.append(value)
        return "".join(parts)
    return "" if content is None else str(content)


def _rerank_with_llm_provider(
    chunks: list[dict[str, Any]],
    question: str,
    expanded_contexts: dict[str, dict[str, Any]],
    config: dict[str, Any],
    api_key: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    from langchain_core.messages import HumanMessage, SystemMessage

    top_chunks = chunks[:RERANK_LLM_MAX_CHUNKS]
    chunk_lines: list[str] = []
    for chunk in top_chunks:
        chunk_id = _chunk_id(chunk)
        if not chunk_id:
            continue
        context = expanded_contexts.get(chunk_id, {})
        section_heading = str(context.get("sectionHeading") or "")
        snippet = _truncate_text(_chunk_content(chunk), 240)
        chunk_lines.append(
            "\n".join(
                [
                    f"chunkId: {chunk_id}",
                    f"sectionHeading: {section_heading}",
                    f"snippet: {snippet}",
                ]
            )
        )

    raw = _invoke_model(
        config,
        api_key,
        [
            SystemMessage(content=RERANK_SYSTEM_PROMPT),
            HumanMessage(
                content="\n\n".join(
                    [
                        f"Question:\n{question}",
                        "Chunks:",
                        "\n\n".join(chunk_lines),
                    ]
                )
            ),
        ],
    )
    llm_scores = _extract_rerank_scores(raw)
    ranked: list[dict[str, Any]] = []
    for chunk in chunks:
        ranked_chunk = dict(chunk)
        ranked_chunk["rerankScore"] = llm_scores.get(_chunk_id(chunk) or "", 0.0)
        ranked.append(ranked_chunk)
    ranked.sort(key=lambda value: float(value.get("rerankScore") or 0.0), reverse=True)

    scores = [float(chunk.get("rerankScore") or 0.0) for chunk in ranked]
    return ranked, {
        "status": "llm_provider",
        "provider": "llm_provider",
        "topScore": scores[0] if scores else None,
        "averageScore": round(sum(scores) / len(scores), 4) if scores else None,
        "chunkCount": len(ranked),
    }


def _rerank_local_rule(
    chunks: list[dict[str, Any]],
    question: str,
    expanded_contexts: dict[str, dict[str, Any]],
    rewritten_query: str | None = None,
    *,
    status: str = "local_rule",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    terms = _question_terms(question)
    for term in _question_terms(rewritten_query or ""):
        if term not in terms:
            terms.append(term)

    base_scores = [_chunk_score(chunk) for chunk in chunks]
    max_base_score = max(base_scores, default=0.0)
    ranked: list[dict[str, Any]] = []
    for chunk in chunks:
        chunk_id = _chunk_id(chunk) or ""
        context = expanded_contexts.get(chunk_id, {})
        section_heading = str(context.get("sectionHeading") or "")
        base_score = _chunk_score(chunk)
        rrf_score_norm = base_score / max_base_score if max_base_score > 0 else 0.0
        term_overlap = _term_overlap_score(terms, _chunk_content(chunk))
        heading_match = _term_overlap_score(terms, section_heading)
        rerank_score = (0.5 * rrf_score_norm) + (0.35 * term_overlap) + (0.15 * heading_match)
        ranked_chunk = dict(chunk)
        ranked_chunk["rerankScore"] = round(rerank_score, 6)
        ranked_chunk["sectionHeading"] = section_heading or None
        ranked.append(ranked_chunk)

    ranked.sort(key=lambda value: float(value.get("rerankScore") or 0.0), reverse=True)
    scores = [float(chunk.get("rerankScore") or 0.0) for chunk in ranked]
    return ranked, {
        "status": status,
        "provider": "local_rule",
        "topScore": scores[0] if scores else None,
        "averageScore": round(sum(scores) / len(scores), 4) if scores else None,
        "chunkCount": len(ranked),
    }


def rerank_evidence(
    chunks: list[dict[str, Any]],
    question: str,
    expanded_contexts: dict[str, dict[str, Any]],
    *,
    rewritten_query: str | None = None,
    config: dict[str, Any] | None = None,
    api_key: str = "",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if len(chunks) <= 1:
        ranked = [dict(chunk, rerankScore=_chunk_score(chunk)) for chunk in chunks]
        return ranked, {
            "status": "single_chunk",
            "provider": "single_chunk",
            "topScore": _chunk_score(ranked[0]) if ranked else None,
            "averageScore": _chunk_score(ranked[0]) if ranked else None,
            "chunkCount": len(ranked),
        }

    mode = resolve_rerank_mode(config)
    if mode == "disabled":
        ranked = [dict(chunk, rerankScore=_chunk_score(chunk)) for chunk in chunks]
        scores = [float(chunk.get("rerankScore") or 0.0) for chunk in ranked]
        return ranked, {
            "status": "disabled",
            "provider": "disabled",
            "topScore": scores[0] if scores else None,
            "averageScore": round(sum(scores) / len(scores), 4) if scores else None,
            "chunkCount": len(ranked),
        }

    if mode == "llm_provider" and config:
        try:
            return _rerank_with_llm_provider(chunks, question, expanded_contexts, config, api_key)
        except Exception as exc:
            logger.warning("Knowledge QA LLM rerank failed, falling back to local rule: %s", exc)
            return _rerank_local_rule(
                chunks,
                question,
                expanded_contexts,
                rewritten_query,
                status="llm_fallback_local_rule",
            )

    return _rerank_local_rule(chunks, question, expanded_contexts, rewritten_query)


def _gate_score(chunk: dict[str, Any]) -> float:
    value = chunk.get("rerankScore")
    if isinstance(value, (int, float)):
        return float(value)
    return _chunk_score(chunk)


def relevance_gate(
    chunks: list[dict[str, Any]],
    *,
    is_second_retrieval: bool = False,
) -> tuple[str, dict[str, Any]]:
    from .constants import RELEVANCE_GATE_FALLBACK_SCORE, RELEVANCE_GATE_MIN_SCORE

    top_score = _gate_score(chunks[0]) if chunks else None
    if chunks and isinstance(chunks[0].get("rerankScore"), (int, float)):
        threshold = RELEVANCE_GATE_MIN_SCORE
    else:
        threshold = RELEVANCE_GATE_FALLBACK_SCORE

    if chunks and top_score is not None and top_score >= threshold:
        decision = "answer"
        reason = "sufficient_evidence"
    elif is_second_retrieval:
        decision = "no_relevant_content"
        reason = "second_retrieval_exhausted"
    else:
        decision = "second_retrieval"
        reason = "low_relevance"

    return decision, {
        "decision": decision,
        "topScore": top_score,
        "threshold": threshold,
        "chunkCount": len(chunks),
        "reason": reason,
    }
