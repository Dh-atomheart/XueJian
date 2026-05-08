"""Grounded RAG workflow for Knowledge Q&A."""
from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

from ..providers.embedding_runtime import (
    QueryEmbeddingRuntimeError,
    embed_query_with_resilience,
    embed_texts,
)
from ..providers.runtime import build_langchain_chat_model, estimate_workflow_cost

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)

RETRIEVAL_CANDIDATE_LIMIT = 24
MAX_PASSAGES = 8
MAX_PASSAGE_CHARS = 800
MAX_TOTAL_CONTEXT_CHARS = 5_000
MAX_CITATION_CHARS = 160
MODEL_TIMEOUT_SECONDS = 45
MODEL_MAX_TOKENS = 900


class WorkflowCancelled(Exception):
    """Raised when the host marks a Knowledge Q&A run as cancelled."""


class KnowledgeQaJsonError(ValueError):
    """Raised when the model does not return the required JSON object."""


def _check_cancelled(host: HostGatewayClient, run_id: str) -> None:
    if run_id and host.is_run_cancelled(run_id):
        raise WorkflowCancelled("knowledge Q&A workflow cancelled")


KNOWLEDGE_QA_SYSTEM_PROMPT = """\
You are the RAG knowledge Q&A engine for a learning app.

You must answer in valid JSON only. Use this exact JSON object contract:
{"answer":"...","answerMode":"grounded","citations":[{"chunkId":"...","snippet":"..."}]}

Rules:
- Base the answer only on the retrieved passages.
- Do not use general knowledge to fill gaps in the documents.
- For synthesis, comparison, ranking, table, summary, or "steps" questions, organize the relevant passage evidence into the requested format even when the passages do not literally contain that exact format or count.
- Evidence is sufficient when the passages contain relevant ideas, facts, examples, or recommendations that can be directly grouped, summarized, or compared for the question.
- If the user asks for a fixed number of items, choose the strongest supported items from the passages and cite the passage evidence for each item.
- Return answerMode "no_relevant_content" only when the retrieved passages are empty or unrelated to the question's topic.
- For grounded answers, citations must reference only passage chunk ids.
- The answer should be Chinese, structured, concise, and useful for understanding the material.
- The answer string may use Markdown for lists, tables, code, and math when it improves readability.
- Do not output Markdown outside the JSON object, code fences around the JSON, explanations outside JSON, or a top-level array.
"""

KNOWLEDGE_QA_USER_TEMPLATE = """\
Question:
{question}

Retrieved passages:
{passages}

First decide whether the passages contain enough evidence. Then output JSON only.
Markdown is allowed only inside the "answer" string.
If the question asks you to create a table, steps, or a structured synthesis, infer the structure from the retrieved passages and cite the supporting passages. Do not refuse only because the exact table or step count is not explicitly written.
If evidence is sufficient:
{{"answer":"直接答案。\\n\\n要点解释：...","answerMode":"grounded","citations":[{{"chunkId":"chunk-id-from-passage","snippet":"short exact excerpt"}}]}}
If evidence is insufficient:
{{"answer":"当前资料中没有足够证据回答这个问题。","answerMode":"no_relevant_content","citations":[]}}
"""

JSON_REPAIR_PROMPT = """\
Repair the previous response into valid JSON only.
Required JSON object format:
{"answer":"...","answerMode":"grounded","citations":[{"chunkId":"...","snippet":"..."}]}
No Markdown outside the JSON object, no code fence, no top-level array.
"""


def _status_answer(answer: str, status: str) -> dict[str, Any]:
    return {
        "status": "completed",
        "answer": {
            "answer": answer,
            "answerMode": "no_relevant_content",
            "retrievalMode": "hybrid",
            "retrievalStatus": status,
            "citations": [],
        },
    }


def _excerpt_fallback_answer(
    chunks: list[dict[str, Any]],
    reason: str,
    *,
    retrieval_status: str = "ready",
    retrieval_mode: str = "hybrid",
) -> dict[str, Any]:
    query_embedding_meta: dict[str, Any] = {}
    citations = [_citation_from_chunk(chunk) for chunk in chunks[:3]]
    citations = [citation for citation in citations if citation.get("quote")]
    if not citations:
        result = _status_answer("当前资料中没有足够证据回答这个问题。", "no_hits")
        result["answer"].update(query_embedding_meta)
        result["answer"]["retrievalMode"] = retrieval_mode
        return result

    if not citations:
        return _status_answer("未能在资料中整理出可引用的片段。请稍后重试。", "no_hits")

    bullets = "\n".join(
        f"- P.{citation.get('page') or '?'}：{citation['snippet']}" for citation in citations
    )
    return {
        "status": "completed",
        "answer": {
            "answer": f"模型响应较慢，先基于检索到的原文摘录给出可核查答案。\n\n{bullets}",
            "answerMode": "excerpt_fallback",
            "retrievalMode": retrieval_mode,
            "retrievalStatus": retrieval_status,
            "fallbackReason": reason,
            "citations": citations,
        },
    }


def _embedding_error_status(exc: Exception) -> tuple[str, str]:
    original = exc.original if isinstance(exc, QueryEmbeddingRuntimeError) else exc
    raw = str(original).strip()
    lower = raw.casefold()
    if "dimension mismatch" in lower:
        return "embedding_dimension_mismatch", "问题向量维度与当前 embedding 配置不一致。请确认当前 embedding 模型与文档向量使用同一配置。"
    if "timeout" in lower or "timed out" in lower:
        return "embedding_timeout", "向量检索响应较慢，已先基于原文摘录回答。"
    if "rate limit" in lower or "429" in lower or "too many requests" in lower:
        return "embedding_rate_limited", "embedding 服务触发限流。请稍后重试，或切换到可用额度更充足的 embedding 配置。"
    if "unauthorized" in lower or "forbidden" in lower or "401" in lower or "403" in lower or "invalid api key" in lower:
        return "embedding_auth_error", "embedding 配置鉴权失败。请检查 API Key、Base URL 和模型权限。"
    if "no enabled api config" in lower or "api config" in lower or "api key" in lower:
        return "embedding_config_error", "当前 embedding 配置不可用。请在设置中检查启用状态、API Key 和工作流绑定。"
    if "connection" in lower or "network" in lower or "dns" in lower or "connection refused" in lower:
        return "embedding_network_error", "无法连接 embedding 服务。请检查网络、代理或自定义 Base URL。"
    return "query_embedding_failed", f"问题向量生成失败。{raw}" if raw else "问题向量生成失败。"
    if "dimension mismatch" in lower:
        return "embedding_dimension_mismatch", "问题向量维度与当前 embedding 配置不一致。请确认当前 embedding 模型与文档向量使用同一配置。"
    if "timeout" in lower or "timed out" in lower:
        return "embedding_timeout", "问题向量生成超时。请检查 embedding 服务是否响应过慢，或稍后重试。"
    if "rate limit" in lower or "429" in lower or "too many requests" in lower:
        return "embedding_rate_limited", "embedding 服务触发限流。请稍后重试，或切换到可用额度更充足的 embedding 配置。"
    if "unauthorized" in lower or "forbidden" in lower or "401" in lower or "403" in lower or "invalid api key" in lower:
        return "embedding_auth_error", "embedding 配置鉴权失败。请检查 API Key、Base URL 和模型权限。"
    if "no enabled api config" in lower or "api config" in lower or "api key" in lower:
        return "embedding_config_error", "当前 embedding 配置不可用。请在设置中检查启用状态、API Key 和工作流绑定。"
    if "connection" in lower or "network" in lower or "dns" in lower or "connection refused" in lower:
        return "embedding_network_error", "无法连接 embedding 服务。请检查网络、代理或自定义 Base URL。"
    return "query_embedding_failed", f"问题向量生成失败。{raw}" if raw else "问题向量生成失败。"


def _extract_text(response_content: Any) -> str:
    if isinstance(response_content, str):
        return response_content
    if isinstance(response_content, list):
        parts: list[str] = []
        for item in response_content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                value = item.get("text") or item.get("content")
                if isinstance(value, str):
                    parts.append(value)
        return "".join(parts)
    return "" if response_content is None else str(response_content)


def _strip_code_fence(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        return "\n".join(lines).strip()
    return stripped


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


def _extract_answer_object(text: str) -> dict[str, Any]:
    value = _decode_first_json_value(text)
    if isinstance(value, list):
        raise KnowledgeQaJsonError("top-level JSON array is not allowed")
    if not isinstance(value, dict):
        raise KnowledgeQaJsonError("top-level JSON value must be an object")
    answer = value.get("answer")
    citations = value.get("citations")
    if not isinstance(answer, str) or not answer.strip():
        raise KnowledgeQaJsonError("JSON object is missing a non-empty answer")
    if not isinstance(citations, list):
        raise KnowledgeQaJsonError("JSON object is missing citations array")
    answer_mode = value.get("answerMode")
    if answer_mode not in ("grounded", "no_relevant_content"):
        value["answerMode"] = "grounded" if citations else "no_relevant_content"
    value["answer"] = answer.strip()
    return value


def _chunk_id(chunk: dict[str, Any]) -> str | None:
    value = chunk.get("chunkId") or chunk.get("id")
    return value if isinstance(value, str) and value else None


def _chunk_page(chunk: dict[str, Any]) -> Any:
    return chunk.get("page") if chunk.get("page") is not None else chunk.get("pageStart")


def _chunk_score(chunk: dict[str, Any]) -> float:
    for key in ("score", "relevanceScore", "rrfScore"):
        value = chunk.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return 0.0


def _chunk_content(chunk: dict[str, Any]) -> str:
    return str(chunk.get("content") or chunk.get("snippet") or "").strip()


def _short_quote(text: str, max_chars: int = MAX_CITATION_CHARS) -> str:
    return " ".join(text.split())[:max_chars].strip()


def _citation_from_chunk(chunk: dict[str, Any], snippet: str | None = None) -> dict[str, Any]:
    content = _chunk_content(chunk)
    quote = _short_quote(snippet if snippet else content)
    if not quote:
        quote = _short_quote(content)
    return {
        "chunkId": _chunk_id(chunk),
        "documentId": chunk.get("documentId"),
        "sectionId": chunk.get("sectionId"),
        "anchorId": chunk.get("anchorId"),
        "page": _chunk_page(chunk),
        "quote": quote,
        "snippet": quote,
        "relevanceScore": _chunk_score(chunk) or None,
    }


def _normalize_citations(raw_citations: object, chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    chunk_by_id = {_chunk_id(chunk): chunk for chunk in chunks if _chunk_id(chunk)}
    if not isinstance(raw_citations, list):
        return []

    citations: list[dict[str, Any]] = []
    seen_chunk_ids: set[str] = set()
    for raw in raw_citations:
        if not isinstance(raw, dict):
            continue
        chunk_id = raw.get("chunkId")
        if not isinstance(chunk_id, str) or chunk_id not in chunk_by_id or chunk_id in seen_chunk_ids:
            continue
        chunk = chunk_by_id[chunk_id]
        content = _chunk_content(chunk)
        raw_snippet = raw.get("snippet") if isinstance(raw.get("snippet"), str) else raw.get("quote")
        snippet = raw_snippet.strip() if isinstance(raw_snippet, str) else ""
        if not snippet or snippet not in content:
            snippet = _short_quote(content)
        citation = _citation_from_chunk(chunk, snippet)
        if citation["quote"]:
            citations.append(citation)
            seen_chunk_ids.add(chunk_id)
    return citations


def _vector_backed_chunks(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    filtered: list[dict[str, Any]] = []
    for chunk in chunks:
        if (
            chunk.get("vectorBacked") is True
            or chunk.get("vectorRank") is not None
            or chunk.get("distance") is not None
        ):
            filtered.append(chunk)
    return filtered


def _overlap_ratio(left: str, right: str) -> float:
    left = left.strip()
    right = right.strip()
    if not left or not right:
        return 0.0
    shorter, longer = (left, right) if len(left) <= len(right) else (right, left)
    if shorter in longer:
        return len(shorter) / max(1, len(longer))
    left_tokens = set(left.split())
    right_tokens = set(right.split())
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def _dedupe_and_pack_chunks(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped_by_id: dict[str, dict[str, Any]] = {}
    for chunk in chunks:
        chunk_id = _chunk_id(chunk)
        content = _chunk_content(chunk)
        if not chunk_id or not content:
            continue
        existing = deduped_by_id.get(chunk_id)
        if existing is None or _chunk_score(chunk) > _chunk_score(existing):
            deduped_by_id[chunk_id] = chunk

    ranked = sorted(deduped_by_id.values(), key=_chunk_score, reverse=True)
    packed: list[dict[str, Any]] = []
    total_chars = 0
    for chunk in ranked:
        content = _chunk_content(chunk)
        document_id = chunk.get("documentId")
        chunk_index = chunk.get("chunkIndex")
        is_near_duplicate = False
        for existing in packed:
            if document_id != existing.get("documentId"):
                continue
            existing_index = existing.get("chunkIndex")
            if isinstance(chunk_index, int) and isinstance(existing_index, int):
                if abs(chunk_index - existing_index) > 1:
                    continue
            if _overlap_ratio(content, _chunk_content(existing)) >= 0.82:
                is_near_duplicate = True
                break
        if is_near_duplicate:
            continue

        remaining = MAX_TOTAL_CONTEXT_CHARS - total_chars
        if remaining <= 0:
            break
        clipped_content = content[: min(MAX_PASSAGE_CHARS, remaining)]
        packed_chunk = dict(chunk)
        packed_chunk["content"] = clipped_content
        packed.append(packed_chunk)
        total_chars += len(clipped_content)
        if len(packed) >= MAX_PASSAGES:
            break
    return packed


def _build_passages(chunks: list[dict[str, Any]]) -> str:
    passages: list[str] = []
    for index, chunk in enumerate(chunks, start=1):
        passages.append(
            "\n".join(
                [
                    f"[Passage {index}]",
                    f"chunkId: {_chunk_id(chunk)}",
                    f"documentId: {chunk.get('documentId')}",
                    f"page: {_chunk_page(chunk)}",
                    f"score: {_chunk_score(chunk):.6f}",
                    f"content: {_chunk_content(chunk)}",
                ]
            )
        )
    return "\n\n".join(passages)


def _embedding_readiness_status(
    host: HostGatewayClient,
    active_profile: dict[str, Any],
    document_ids: list[str],
) -> str:
    checker = getattr(host, "get_document_embedding_readiness", None)
    if not callable(checker):
        return "ready"

    profile_id = active_profile.get("id")
    if not isinstance(profile_id, str) or not profile_id:
        return "embedding_missing"

    readiness = checker(profile_id, document_ids if document_ids else None)
    status = readiness.get("status") if isinstance(readiness, dict) else None
    if status in ("ready", "embedding_missing", "embedding_stale"):
        return status
    return "embedding_missing"


def _invoke_model(config: dict[str, Any], api_key: str, messages: list[Any]) -> str:
    llm = build_langchain_chat_model(
        config,
        api_key,
        0.2,
        timeout=MODEL_TIMEOUT_SECONDS,
        max_tokens=MODEL_MAX_TOKENS,
    )
    response = llm.invoke(messages)
    return _extract_text(getattr(response, "content", response))


def _try_langchain_qa(
    config: dict[str, Any],
    api_key: str,
    question: str,
    passages_text: str,
) -> dict[str, Any]:
    from langchain_core.messages import HumanMessage, SystemMessage

    messages: list[Any] = [
        SystemMessage(content=KNOWLEDGE_QA_SYSTEM_PROMPT),
        HumanMessage(content=KNOWLEDGE_QA_USER_TEMPLATE.format(question=question, passages=passages_text)),
    ]
    raw = _invoke_model(config, api_key, messages)
    try:
        return _extract_answer_object(raw)
    except KnowledgeQaJsonError:
        repaired_raw = _invoke_model(
            config,
            api_key,
            [
                *messages,
                HumanMessage(content=f"{JSON_REPAIR_PROMPT}\nPrevious response:\n{raw[:2000]}"),
            ],
        )
        return _extract_answer_object(repaired_raw)


def run_knowledge_qa_workflow(
    run_id: str,
    question: str,
    document_ids: list[str],
    host: HostGatewayClient,
) -> dict[str, Any]:
    """Execute a grounded knowledge_qa workflow using vector-backed retrieval."""
    _check_cancelled(host, run_id)

    active_profile = host.get_active_embedding_profile()
    if active_profile is None:
        return _status_answer(
            "当前没有可用的 embedding 配置。请先配置 embedding，并为文档生成向量后再提问。",
            "embedding_missing",
        )

    readiness_status = _embedding_readiness_status(host, active_profile, document_ids)
    if readiness_status == "embedding_missing":
        return _status_answer(
            "所选资料尚未完成当前 embedding 配置的向量化。请先生成文档向量后再提问。",
            "embedding_missing",
        )
    if readiness_status == "embedding_stale":
        return _status_answer(
            "所选资料的向量已过期。请重新生成文档向量后再提问。",
            "embedding_stale",
        )

    query_embedding_meta: dict[str, Any] = {
        "queryEmbeddingStatus": "ready",
        "cacheHit": False,
        "attempts": 0,
        "latencyMs": None,
    }

    try:
        query_embedding_result = embed_query_with_resilience(
            host,
            active_profile,
            question,
            task_type="RETRIEVAL_QUERY",
        )
        query_embedding = query_embedding_result.vector
        query_embedding_meta = {
            "queryEmbeddingStatus": query_embedding_result.status,
            "cacheHit": query_embedding_result.cache_hit,
            "attempts": query_embedding_result.attempts,
            "latencyMs": round(query_embedding_result.latency_ms, 2),
        }
    except Exception as exc:
        if isinstance(exc, WorkflowCancelled):
            raise
        status, message = _embedding_error_status(exc)
        attempts = exc.attempts if isinstance(exc, QueryEmbeddingRuntimeError) else 0
        latency_ms = exc.latency_ms if isinstance(exc, QueryEmbeddingRuntimeError) else None
        logger.warning(
            "Query embedding failed for knowledge QA: status=%s attempts=%s latency_ms=%s error=%s",
            status,
            attempts,
            round(latency_ms, 2) if isinstance(latency_ms, (int, float)) else None,
            exc,
        )
        failure_meta = {
            "queryEmbeddingStatus": status,
            "cacheHit": False,
            "attempts": attempts,
            "latencyMs": round(latency_ms, 2) if isinstance(latency_ms, (int, float)) else None,
            "fallbackReason": status,
        }
        try:
            lexical_chunks = host.search_hybrid(
                question,
                query_embedding=None,
                document_ids=document_ids if document_ids else None,
                limit=RETRIEVAL_CANDIDATE_LIMIT,
            )
            packed_lexical_chunks = _dedupe_and_pack_chunks(lexical_chunks)
        except Exception as lexical_exc:
            logger.warning("Lexical fallback failed for knowledge QA: %s", lexical_exc)
            packed_lexical_chunks = []
        if packed_lexical_chunks:
            result = _excerpt_fallback_answer(
                packed_lexical_chunks,
                f"{status}: {message}",
                retrieval_status=status,
                retrieval_mode="fts5",
            )
            result["answer"].update(failure_meta)
            return result
        result = _status_answer(message, status)
        result["answer"].update(failure_meta)
        return result

    _check_cancelled(host, run_id)
    chunks = host.search_hybrid(
        question,
        query_embedding=query_embedding,
        document_ids=document_ids if document_ids else None,
        limit=RETRIEVAL_CANDIDATE_LIMIT,
    )
    retrieval_mode = "hybrid"
    packed_chunks = _dedupe_and_pack_chunks(_vector_backed_chunks(chunks))
    if not packed_chunks:
        lexical_packed_chunks = _dedupe_and_pack_chunks(chunks)
        if lexical_packed_chunks:
            packed_chunks = lexical_packed_chunks
            retrieval_mode = "fts5"
    if not packed_chunks:
        result = _status_answer(
            "当前资料中没有检索到足够相关的内容，无法基于文档回答。",
            "no_hits",
        )
        result["answer"].update(query_embedding_meta)
        return result

    config_with_key = host.get_config_for_workflow("knowledge_qa")
    if not config_with_key:
        if retrieval_mode == "fts5":
            result = _status_answer("当前资料中没有足够证据回答这个问题。", "no_hits")
            result["answer"].update(query_embedding_meta)
            return result
        raise RuntimeError("Knowledge Q&A model is not configured")

    passages_text = _build_passages(packed_chunks)
    config, api_key = config_with_key
    _check_cancelled(host, run_id)
    try:
        answer_data = _try_langchain_qa(config, api_key, question, passages_text)
    except Exception as exc:
        if isinstance(exc, WorkflowCancelled):
            raise
        logger.warning("Knowledge QA model answer failed, using excerpt fallback: %s", exc)
        result = _excerpt_fallback_answer(packed_chunks, f"model_error: {exc}", retrieval_mode=retrieval_mode)
        result["answer"].update(query_embedding_meta)
        return result
    _check_cancelled(host, run_id)

    answer_mode = answer_data.get("answerMode")
    citations = _normalize_citations(answer_data.get("citations", []), packed_chunks)
    if answer_mode == "no_relevant_content":
        return {
            "status": "completed",
            "answer": {
                "answer": str(answer_data.get("answer") or "当前资料中没有足够证据回答这个问题。").strip(),
                "answerMode": "no_relevant_content",
                "retrievalMode": retrieval_mode,
                "retrievalStatus": "no_hits",
                "citations": [],
                **query_embedding_meta,
            },
        }

    if not citations:
        result = _status_answer("当前资料中没有足够证据回答这个问题。", "no_hits")
        result["answer"].update(query_embedding_meta)
        return result

    if config.get("id"):
        try:
            host.record_workflow_cost(config["id"], estimate_workflow_cost(config))
        except Exception as exc:
            logger.warning("Failed to record knowledge QA cost: %s", exc)

    return {
        "status": "completed",
        "answer": {
            "answer": str(answer_data.get("answer") or "").strip(),
            "answerMode": "grounded",
            "retrievalMode": retrieval_mode,
            "retrievalStatus": "ready",
            "citations": citations,
            **query_embedding_meta,
        },
    }
