"""Grounded RAG workflow for Knowledge Q&A."""
from __future__ import annotations

import json
import logging
import os
import re
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
MAX_PARENT_CONTEXT_CHARS = 3_000
MAX_EXPANDED_CONTEXT_CHARS = 500
MAX_SECTION_HEADING_CHARS = 160
MODEL_TIMEOUT_SECONDS = 45
MODEL_MAX_TOKENS = 900
RECENT_MESSAGES_LIMIT = 4
REWRITE_SHORT_QUERY_CHARS = 10
REWRITE_QUERY_MAX_CHARS = 120
SECOND_RETRIEVAL_QUERY_MAX_CHARS = 120
RERANK_LLM_MAX_CHUNKS = 6
RELEVANCE_GATE_MIN_SCORE = 0.25
RELEVANCE_GATE_FALLBACK_SCORE = 0.016
RERANK_MODE_ENV = "XUEJIAN_KNOWLEDGE_QA_RERANK_MODE"
ALLOWED_RERANK_MODES = {"disabled", "local_rule", "llm_provider"}
REWRITE_REFERENTIAL_TERMS = ("它", "这个", "那个", "上面", "以上", "之前", "其", "该")
SHORT_FOLLOW_UP_TERMS = ("优缺点", "区别", "总结", "步骤", "方法", "原理", "怎么做", "是什么")


class WorkflowCancelled(Exception):
    """Raised when the host marks a Knowledge Q&A run as cancelled."""


class KnowledgeQaJsonError(ValueError):
    """Raised when the model does not return the required JSON object."""


def _check_cancelled(host: HostGatewayClient, run_id: str) -> None:
    if run_id and host.is_run_cancelled(run_id):
        raise WorkflowCancelled("knowledge Q&A workflow cancelled")


def _emit_rag_progress(
    host: HostGatewayClient,
    run_id: str,
    step_key: str,
    status: str,
    *,
    title: str,
    detail: str | None = None,
    progress: float | None = None,
    metrics: dict[str, Any] | None = None,
) -> None:
    emit = getattr(host, "emit_workflow_event", None)
    if not callable(emit) or not run_id:
        return

    payload = {
        "stepKey": step_key,
        "status": status,
        "title": title,
        "detail": detail,
        "progress": progress,
        "metrics": metrics or {},
    }
    try:
        emit(run_id, "progress", detail or title, progress, payload)
    except Exception as exc:
        logger.warning("Failed to emit knowledge QA progress event: %s", exc)


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
- Each passage may contain expandedContext and citationEvidence. Use expandedContext only as answer background.
- For grounded answers, citations must reference only passage chunk ids and must be supported by that passage's citationEvidence.
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
Each passage may include expandedContext (background only) and citationEvidence (the child evidence you may cite).
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

QUERY_REWRITE_SYSTEM_PROMPT = """\
Rewrite the user question into one standalone retrieval query for RAG.

Rules:
- Keep the original intent, technical terms, and named entities.
- Use recent conversation only to resolve references like it/that/above.
- Do not answer the question.
- Return only the rewritten query text.
- If the question is already standalone, return the original question.
"""

QUERY_REWRITE_USER_TEMPLATE = """\
Current question:
{question}

Recent conversation:
{recent_messages}
"""

SECOND_RETRIEVAL_SYSTEM_PROMPT = """\
The first retrieval pass found weak evidence.

Generate one broader retrieval query that keeps the topic but expands recall.

Rules:
- Stay grounded in the same topic.
- Prefer a more explicit or step-back query.
- Do not answer the question.
- Return only the broader query text.
"""

SECOND_RETRIEVAL_USER_TEMPLATE = """\
Current question:
{question}

Standalone retrieval query from first pass:
{rewritten_query}

Recent conversation:
{recent_messages}
"""

RERANK_SYSTEM_PROMPT = """\
You are reranking RAG evidence chunks for relevance.

Return valid JSON only:
{"rankings":[{"chunkId":"...","score":0.0}]}

Rules:
- Score each chunk from 0 to 1.
- Use the question and chunk snippet only.
- Prefer chunks that directly help answer the question.
- Do not invent chunk ids.
"""


def _status_answer(
    answer: str,
    status: str,
    *,
    retrieval_mode: str = "hybrid",
    rag_trace: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "status": "completed",
        "answer": {
            "answer": answer,
            "answerMode": "no_relevant_content",
            "retrievalMode": retrieval_mode,
            "retrievalStatus": status,
            "citations": [],
        },
    }
    if rag_trace is not None:
        payload["answer"]["ragTrace"] = rag_trace
    return payload


def _excerpt_fallback_answer(
    chunks: list[dict[str, Any]],
    reason: str,
    *,
    retrieval_status: str = "ready",
    retrieval_mode: str = "hybrid",
    rag_trace: dict[str, Any] | None = None,
) -> dict[str, Any]:
    query_embedding_meta: dict[str, Any] = {}
    citations = [_citation_from_chunk(chunk) for chunk in chunks[:3]]
    citations = [citation for citation in citations if citation.get("quote")]
    if not citations:
        result = _status_answer(
            "当前资料中没有足够证据回答这个问题。",
            "no_hits",
            retrieval_mode=retrieval_mode,
            rag_trace=rag_trace,
        )
        result["answer"].update(query_embedding_meta)
        return result

    if not citations:
        return _status_answer(
            "未能在资料中整理出可引用的片段。请稍后重试。",
            "no_hits",
            retrieval_mode=retrieval_mode,
            rag_trace=rag_trace,
        )

    bullets = "\n".join(
        f"- P.{citation.get('page') or '?'}：{citation['snippet']}" for citation in citations
    )
    intro = "当前回答降级为原文摘录，以下内容直接来自检索到的资料。"
    normalized_reason = reason.strip().lower()
    if normalized_reason == "contains_only_fallback":
        intro = "当前回答降级为原文摘录：词法检索处于降级模式，以下内容直接来自检索到的资料。"
    elif normalized_reason.startswith("model_error"):
        intro = "当前回答降级为原文摘录：模型生成失败，以下内容直接来自检索到的资料。"
    elif normalized_reason.startswith("embedding_") or normalized_reason.startswith("query_embedding"):
        intro = "当前回答降级为原文摘录：向量检索暂不可用，以下内容直接来自检索到的资料。"

    payload = {
        "status": "completed",
        "answer": {
            "answer": f"{intro}\n\n{bullets}",
            "answerMode": "excerpt_fallback",
            "retrievalMode": retrieval_mode,
            "retrievalStatus": retrieval_status,
            "fallbackReason": reason,
            "citations": citations,
        },
    }
    if rag_trace is not None:
        payload["answer"]["ragTrace"] = rag_trace
    return payload


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


def _chunk_kind(chunk: dict[str, Any]) -> str | None:
    value = chunk.get("chunkKind")
    return value if isinstance(value, str) and value else None


def _chunk_index(chunk: dict[str, Any]) -> int:
    value = chunk.get("chunkIndex")
    return value if isinstance(value, int) else -1


def _truncate_text(text: str, max_chars: int) -> str:
    if max_chars <= 0:
        return ""
    return " ".join(text.split())[:max_chars].strip()


def _section_heading(section: dict[str, Any] | None) -> str:
    if not isinstance(section, dict):
        return ""

    parts: list[str] = []
    hierarchy = section.get("hierarchyPath")
    if isinstance(hierarchy, list):
        for item in hierarchy:
            text = str(item).strip()
            if text:
                parts.append(text)

    heading = section.get("heading")
    if isinstance(heading, str) and heading.strip():
        heading_text = heading.strip()
        if not parts or parts[-1] != heading_text:
            parts.append(heading_text)

    return _truncate_text(" > ".join(parts), MAX_SECTION_HEADING_CHARS)


def _default_merge_summary(status: str = "not_run") -> dict[str, Any]:
    return {
        "status": status,
        "childChunksExpanded": 0,
        "parentContextsAdded": 0,
        "sectionContextsAdded": 0,
        "charsAdded": 0,
    }


def _default_packing_summary() -> dict[str, Any]:
    return {
        "passageCount": 0,
        "totalChars": 0,
        "budgetChars": MAX_TOTAL_CONTEXT_CHARS + MAX_PARENT_CONTEXT_CHARS,
    }


def _default_audit_summary(
    audit_status: str = "not_run",
    total_citations: int = 0,
    valid_citations: int = 0,
    rejected_citations: int = 0,
) -> dict[str, Any]:
    return {
        "totalCitations": total_citations,
        "validCitations": valid_citations,
        "rejectedCitations": rejected_citations,
        "auditStatus": audit_status,
    }


def _default_rewrite_summary(
    status: str = "not_triggered",
    *,
    trigger_reason: str | None = None,
    original_query: str = "",
    rewritten_query: str | None = None,
    recent_message_count: int = 0,
) -> dict[str, Any]:
    return {
        "status": status,
        "triggerReason": trigger_reason,
        "recentMessageCount": recent_message_count,
        "originalQueryPreview": _truncate_text(original_query, 80),
        "rewrittenQueryPreview": _truncate_text(rewritten_query or "", 80),
    }


def _default_rerank_summary(status: str = "not_enabled") -> dict[str, Any]:
    return {
        "status": status,
        "provider": status,
        "topScore": None,
        "averageScore": None,
        "chunkCount": 0,
    }


def _default_gate_summary(decision: str = "not_enabled") -> dict[str, Any]:
    return {
        "decision": decision,
        "topScore": None,
        "threshold": RELEVANCE_GATE_MIN_SCORE,
        "chunkCount": 0,
        "reason": decision,
    }


def _default_second_retrieval_summary(status: str = "not_used") -> dict[str, Any]:
    return {
        "status": status,
        "used": False,
        "queryPreview": "",
        "additionalChunkCount": 0,
        "reason": None,
    }


def _lexical_status(chunks: list[dict[str, Any]]) -> str:
    for chunk in chunks:
        value = chunk.get("lexicalSource")
        if isinstance(value, str) and value:
            return value
    return "not_used"


def _uses_degraded_lexical_fallback(retrieval_mode: str, chunks: list[dict[str, Any]]) -> bool:
    return retrieval_mode == "fts5" and _lexical_status(chunks) == "fallback"


def _build_rag_trace(
    *,
    readiness_status: str,
    retrieval_mode: str,
    chunks: list[dict[str, Any]] | None = None,
    query_rewrite_used: bool = False,
    rewrite_summary: dict[str, Any] | None = None,
    merge_summary: dict[str, Any] | None = None,
    packing_summary: dict[str, Any] | None = None,
    rerank_summary: dict[str, Any] | None = None,
    gate_summary: dict[str, Any] | None = None,
    second_retrieval_summary: dict[str, Any] | None = None,
    audit_summary: dict[str, Any] | None = None,
    failure_reason: str | None = None,
) -> dict[str, Any]:
    chunks = chunks or []
    retrieved_document_count = len(
        {
            document_id
            for chunk in chunks
            for document_id in [chunk.get("documentId")]
            if isinstance(document_id, str) and document_id
        }
    )

    merge_summary = merge_summary or _default_merge_summary()
    packing_summary = packing_summary or _default_packing_summary()
    rewrite_summary = rewrite_summary or _default_rewrite_summary()
    rerank_summary = rerank_summary or _default_rerank_summary()
    gate_summary = gate_summary or _default_gate_summary()
    second_retrieval_summary = second_retrieval_summary or _default_second_retrieval_summary()
    audit_summary = audit_summary or _default_audit_summary()

    return {
        "embeddingReadiness": readiness_status,
        "retrievalMode": retrieval_mode,
        "queryRewriteUsed": query_rewrite_used,
        "secondRetrievalUsed": bool(second_retrieval_summary.get("used")),
        "retrievedDocumentCount": retrieved_document_count,
        "parentMergeStatus": merge_summary.get("status"),
        "rerankStatus": rerank_summary.get("status"),
        "relevanceGateDecision": gate_summary.get("decision"),
        "citationAuditStatus": audit_summary.get("auditStatus"),
        "failureReason": failure_reason,
        "retrievalSummary": {
            "chunkCount": len(chunks),
            "retrievedDocumentCount": retrieved_document_count,
            "lexicalStatus": _lexical_status(chunks),
            "retrievalMode": retrieval_mode,
        },
        "rewriteSummary": rewrite_summary,
        "mergeSummary": merge_summary,
        "packingSummary": packing_summary,
        "rerankSummary": rerank_summary,
        "relevanceGateSummary": gate_summary,
        "secondRetrievalSummary": second_retrieval_summary,
        "auditSummary": audit_summary,
    }


def _recent_messages_for_rewrite(
    host: HostGatewayClient,
    conversation_id: str | None,
    limit: int = RECENT_MESSAGES_LIMIT,
) -> list[dict[str, str]]:
    if not conversation_id:
        return []

    list_recent_messages = getattr(host, "list_recent_qa_messages", None)
    if not callable(list_recent_messages):
        return []

    try:
        raw_messages = list_recent_messages(conversation_id, limit=limit) or []
    except Exception as exc:
        logger.warning("Knowledge QA rewrite failed to load recent messages: %s", exc)
        return []

    messages: list[dict[str, str]] = []
    for raw_message in raw_messages:
        if not isinstance(raw_message, dict):
            continue
        role = raw_message.get("role")
        content = raw_message.get("content")
        if role not in {"user", "assistant"} or not isinstance(content, str):
            continue
        normalized = _truncate_text(content, 160)
        if not normalized:
            continue
        messages.append({"role": role, "content": normalized})
    return messages


def _format_recent_messages(messages: list[dict[str, str]]) -> str:
    if not messages:
        return "None"

    lines: list[str] = []
    for message in messages[-RECENT_MESSAGES_LIMIT:]:
        role = "用户" if message.get("role") == "user" else "助手"
        content = _truncate_text(message.get("content", ""), 120)
        if content:
            lines.append(f"{role}: {content}")
    return "\n".join(lines) if lines else "None"


def _rewrite_trigger_reason(
    question: str,
    recent_messages: list[dict[str, str]] | None = None,
) -> str | None:
    normalized = "".join(question.split())
    if not normalized:
        return None
    if len(normalized) <= REWRITE_SHORT_QUERY_CHARS:
        return "short_query"
    if any(term in normalized for term in REWRITE_REFERENTIAL_TERMS):
        return "referential"
    if recent_messages and any(term in normalized for term in SHORT_FOLLOW_UP_TERMS) and len(normalized) <= 16:
        return "follow_up"
    if recent_messages and re.search(r"[A-Za-z]", normalized) and re.search(r"[\u4e00-\u9fff]", normalized):
        return "mixed_language"
    return None


def _should_rewrite_query(
    question: str,
    recent_messages: list[dict[str, str]] | None = None,
) -> bool:
    return _rewrite_trigger_reason(question, recent_messages) is not None


def _extract_query_text(text: str, fallback: str, max_chars: int) -> str:
    stripped = _strip_code_fence(text)
    lines = [line.strip() for line in stripped.splitlines() if line.strip()]
    candidate = lines[0] if lines else stripped.strip()
    candidate = re.sub(r"^(query|rewritten query|broader query)\s*[:：]\s*", "", candidate, flags=re.IGNORECASE)
    candidate = _truncate_text(candidate, max_chars)
    return candidate or _truncate_text(fallback, max_chars)


def _rewrite_query(
    config: dict[str, Any],
    api_key: str,
    question: str,
    recent_messages: list[dict[str, str]],
) -> str:
    from langchain_core.messages import HumanMessage, SystemMessage

    raw = _invoke_model(
        config,
        api_key,
        [
            SystemMessage(content=QUERY_REWRITE_SYSTEM_PROMPT),
            HumanMessage(
                content=QUERY_REWRITE_USER_TEMPLATE.format(
                    question=question,
                    recent_messages=_format_recent_messages(recent_messages),
                )
            ),
        ],
    )
    return _extract_query_text(raw, question, REWRITE_QUERY_MAX_CHARS)


def _build_second_retrieval_query(
    config: dict[str, Any] | None,
    api_key: str,
    question: str,
    rewritten_query: str | None,
    recent_messages: list[dict[str, str]],
) -> str:
    fallback = rewritten_query or question
    if not config:
        for message in reversed(recent_messages):
            content = message.get("content", "")
            if content and content != question:
                return _truncate_text(f"{content} {question}", SECOND_RETRIEVAL_QUERY_MAX_CHARS)
        return _truncate_text(fallback, SECOND_RETRIEVAL_QUERY_MAX_CHARS)

    from langchain_core.messages import HumanMessage, SystemMessage

    raw = _invoke_model(
        config,
        api_key,
        [
            SystemMessage(content=SECOND_RETRIEVAL_SYSTEM_PROMPT),
            HumanMessage(
                content=SECOND_RETRIEVAL_USER_TEMPLATE.format(
                    question=question,
                    rewritten_query=rewritten_query or question,
                    recent_messages=_format_recent_messages(recent_messages),
                )
            ),
        ],
    )
    return _extract_query_text(raw, fallback, SECOND_RETRIEVAL_QUERY_MAX_CHARS)


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


def _resolve_rerank_mode(config: dict[str, Any] | None = None) -> str:
    config = config or {}
    configured_mode = config.get("rerankMode")
    if isinstance(configured_mode, str):
        normalized = configured_mode.strip().lower()
        if normalized in ALLOWED_RERANK_MODES:
            return normalized

    env_value = os.environ.get(RERANK_MODE_ENV, "local_rule").strip().lower()
    return env_value if env_value in ALLOWED_RERANK_MODES else "local_rule"


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


def _rerank_evidence(
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

    mode = _resolve_rerank_mode(config)
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


def _relevance_gate(
    chunks: list[dict[str, Any]],
    *,
    is_second_retrieval: bool = False,
) -> tuple[str, dict[str, Any]]:
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


def _dedupe_chunks(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped_by_id: dict[str, dict[str, Any]] = {}
    for chunk in chunks:
        chunk_id = _chunk_id(chunk)
        content = _chunk_content(chunk)
        if not chunk_id or not content:
            continue
        existing = deduped_by_id.get(chunk_id)
        if existing is None or _chunk_score(chunk) > _chunk_score(existing):
            deduped_by_id[chunk_id] = dict(chunk)
    return sorted(deduped_by_id.values(), key=_chunk_score, reverse=True)


def _pack_chunks(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    packed: list[dict[str, Any]] = []
    total_chars = 0
    for chunk in chunks:
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


def _build_document_structure_cache(
    host: HostGatewayClient,
    chunks: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    list_chunks = getattr(host, "list_chunks", None)
    if not callable(list_chunks):
        return {}

    list_sections = getattr(host, "list_sections", None)
    cache: dict[str, dict[str, Any]] = {}
    document_ids = sorted(
        {
            document_id
            for chunk in chunks
            for document_id in [chunk.get("documentId")]
            if isinstance(document_id, str) and document_id
        }
    )

    for document_id in document_ids:
        try:
            structured_chunks = list_chunks(document_id) or []
        except Exception as exc:
            logger.warning("Knowledge QA parent merge failed to list chunks for %s: %s", document_id, exc)
            structured_chunks = []

        try:
            sections = list_sections(document_id) or [] if callable(list_sections) else []
        except Exception as exc:
            logger.warning("Knowledge QA parent merge failed to list sections for %s: %s", document_id, exc)
            sections = []

        chunk_by_id: dict[str, dict[str, Any]] = {}
        section_chunks: dict[str, list[dict[str, Any]]] = {}
        for structured_chunk in structured_chunks:
            if not isinstance(structured_chunk, dict):
                continue
            chunk_id = _chunk_id(structured_chunk)
            if chunk_id:
                chunk_by_id[chunk_id] = structured_chunk
            section_id = structured_chunk.get("sectionId")
            if isinstance(section_id, str) and section_id:
                section_chunks.setdefault(section_id, []).append(structured_chunk)

        for values in section_chunks.values():
            values.sort(key=lambda value: (_chunk_index(value), _chunk_id(value) or ""))

        sections_by_id: dict[str, dict[str, Any]] = {}
        for section in sections:
            if not isinstance(section, dict):
                continue
            section_id = section.get("id")
            if isinstance(section_id, str) and section_id:
                sections_by_id[section_id] = section

        cache[document_id] = {
            "chunkById": chunk_by_id,
            "sectionChunks": section_chunks,
            "sectionsById": sections_by_id,
        }

    return cache


def _hydrate_chunks_from_structure(
    chunks: list[dict[str, Any]],
    document_structure: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    hydrated: list[dict[str, Any]] = []
    for chunk in chunks:
        document_id = chunk.get("documentId")
        chunk_id = _chunk_id(chunk)
        structured_chunk = None
        if isinstance(document_id, str) and document_id and chunk_id:
            structured_chunk = document_structure.get(document_id, {}).get("chunkById", {}).get(chunk_id)
        if isinstance(structured_chunk, dict):
            merged = dict(structured_chunk)
            merged.update(chunk)
            hydrated.append(merged)
        else:
            hydrated.append(chunk)
    return hydrated


def _merge_parent_context(
    chunks: list[dict[str, Any]],
    host: HostGatewayClient,
    *,
    document_structure: dict[str, dict[str, Any]] | None = None,
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    document_structure = document_structure or _build_document_structure_cache(host, chunks)
    if not document_structure:
        return {}, _default_merge_summary("unavailable")

    remaining_chars = MAX_PARENT_CONTEXT_CHARS
    seen_merge_keys: set[str] = set()
    expanded_contexts: dict[str, dict[str, Any]] = {}
    merge_summary = _default_merge_summary("none")

    for chunk in chunks:
        chunk_id = _chunk_id(chunk)
        document_id = chunk.get("documentId")
        section_id = chunk.get("sectionId")
        if not chunk_id or not isinstance(document_id, str) or not document_id:
            continue

        context_entry = document_structure.get(document_id)
        if not isinstance(context_entry, dict):
            continue

        payload: dict[str, Any] = {}
        section = None
        if isinstance(section_id, str) and section_id:
            section = context_entry.get("sectionsById", {}).get(section_id)
        heading = _section_heading(section)
        if heading:
            payload["sectionHeading"] = heading

        if not isinstance(section_id, str) or not section_id or remaining_chars <= 0:
            if payload:
                expanded_contexts[chunk_id] = payload
            continue

        section_chunks = context_entry.get("sectionChunks", {}).get(section_id, [])
        child_index = _chunk_index(chunk)
        parent_chunk: dict[str, Any] | None = None
        for section_chunk in section_chunks:
            if _chunk_kind(section_chunk) != "parent":
                continue
            if child_index >= 0 and _chunk_index(section_chunk) > child_index:
                continue
            parent_chunk = section_chunk

        source_kind = "parent"
        source_chunk = parent_chunk
        if source_chunk is None and isinstance(section, dict):
            source_kind = "section"
            source_chunk = section

        if isinstance(source_chunk, dict):
            merge_key = ":".join(
                [
                    document_id,
                    section_id,
                    _chunk_id(source_chunk) or source_kind,
                ]
            )
            if merge_key not in seen_merge_keys:
                context_text = _truncate_text(
                    _chunk_content(source_chunk),
                    min(MAX_EXPANDED_CONTEXT_CHARS, remaining_chars),
                )
                if context_text:
                    payload["context"] = context_text
                    payload["sourceKind"] = source_kind
                    payload["mergeKey"] = merge_key
                    seen_merge_keys.add(merge_key)
                    merge_summary["status"] = "merged"
                    merge_summary["childChunksExpanded"] += 1
                    merge_summary["charsAdded"] += len(context_text)
                    remaining_chars -= len(context_text)
                    if source_kind == "parent":
                        merge_summary["parentContextsAdded"] += 1
                    else:
                        merge_summary["sectionContextsAdded"] += 1

        if payload:
            expanded_contexts[chunk_id] = payload

    return expanded_contexts, merge_summary


def _packing_summary(
    chunks: list[dict[str, Any]],
    expanded_contexts: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    expanded_contexts = expanded_contexts or {}
    total_chars = 0
    for chunk in chunks:
        total_chars += len(_chunk_content(chunk))
        context = expanded_contexts.get(_chunk_id(chunk) or "", {})
        total_chars += len(str(context.get("sectionHeading") or ""))
        total_chars += len(str(context.get("context") or ""))

    return {
        "passageCount": len(chunks),
        "totalChars": total_chars,
        "budgetChars": MAX_TOTAL_CONTEXT_CHARS + MAX_PARENT_CONTEXT_CHARS,
    }


def _audit_citations(
    raw_citations: object,
    chunks: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[str], str]:
    if not isinstance(raw_citations, list):
        return [], [], "clean"

    allowed_chunk_ids = {_chunk_id(chunk) for chunk in chunks if _chunk_id(chunk)}
    filtered_raw: list[dict[str, Any]] = []
    rejected_chunk_ids: list[str] = []
    for raw in raw_citations:
        if not isinstance(raw, dict):
            continue
        chunk_id = raw.get("chunkId")
        if not isinstance(chunk_id, str) or chunk_id not in allowed_chunk_ids:
            if isinstance(chunk_id, str) and chunk_id:
                rejected_chunk_ids.append(chunk_id)
            continue
        filtered_raw.append(raw)

    citations = _normalize_citations(filtered_raw, chunks)
    if rejected_chunk_ids and not citations:
        audit_status = "all_rejected"
    elif rejected_chunk_ids:
        audit_status = "filtered"
    else:
        audit_status = "clean"
    return citations, rejected_chunk_ids, audit_status


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
    return _pack_chunks(_dedupe_chunks(chunks))


def _build_passages(
    chunks: list[dict[str, Any]],
    expanded_contexts: dict[str, dict[str, Any]] | None = None,
    episodic_memory: str | None = None,
) -> str:
    expanded_contexts = expanded_contexts or {}
    passages: list[str] = []
    if isinstance(episodic_memory, str) and episodic_memory.strip():
        passages.append(
            "[Session Memory]\n"
            "type: non_citable_context\n"
            "instruction: use only for intent resolution and pronoun disambiguation; do not cite this block\n"
            f"content: {episodic_memory.strip()}"
        )
    for index, chunk in enumerate(chunks, start=1):
        context = expanded_contexts.get(_chunk_id(chunk) or "", {})
        section_heading = context.get("sectionHeading") if isinstance(context, dict) else None
        expanded_text = context.get("context") if isinstance(context, dict) else None
        lines = [
            f"[Passage {index}]",
            f"chunkId: {_chunk_id(chunk)}",
            f"documentId: {chunk.get('documentId')}",
            f"page: {_chunk_page(chunk)}",
            f"score: {_chunk_score(chunk):.6f}",
        ]
        if isinstance(section_heading, str) and section_heading:
            lines.append(f"sectionHeading: {section_heading}")
        if isinstance(expanded_text, str) and expanded_text:
            lines.append(f"expandedContext: {expanded_text}")
        lines.append(f"citationEvidence: {_chunk_content(chunk)}")
        passages.append(
            "\n".join(lines)
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


def _embed_optional_query(
    host: HostGatewayClient,
    active_profile: dict[str, Any],
    query: str,
) -> list[float] | None:
    try:
        result = embed_query_with_resilience(
            host,
            active_profile,
            query,
            task_type="RETRIEVAL_QUERY",
        )
        return result.vector
    except Exception as exc:
        if isinstance(exc, WorkflowCancelled):
            raise
        logger.warning("Knowledge QA optional query embedding failed: %s", exc)
        return None


def _search_candidates_for_queries(
    host: HostGatewayClient,
    query_specs: list[dict[str, Any]],
    document_ids: list[str],
) -> tuple[list[dict[str, Any]], str]:
    raw_hits: list[dict[str, Any]] = []
    for query_spec in query_specs:
        query = query_spec.get("query")
        if not isinstance(query, str) or not query.strip():
            continue

        try:
            hits = host.search_hybrid(
                query,
                query_embedding=query_spec.get("embedding"),
                document_ids=document_ids if document_ids else None,
                limit=RETRIEVAL_CANDIDATE_LIMIT,
            )
        except Exception as exc:
            if query_spec.get("required"):
                raise
            logger.warning("Knowledge QA optional retrieval query failed: %s", exc)
            continue

        label = query_spec.get("label") if isinstance(query_spec.get("label"), str) else "query"
        for hit in hits:
            if not isinstance(hit, dict):
                continue
            tagged_hit = dict(hit)
            tagged_hit["retrievalQueryLabel"] = label
            raw_hits.append(tagged_hit)

    vector_candidates = _dedupe_chunks(_vector_backed_chunks(raw_hits))
    if vector_candidates:
        return vector_candidates, "hybrid"

    lexical_candidates = _dedupe_chunks(raw_hits)
    if lexical_candidates:
        return lexical_candidates, "fts5"

    return [], "hybrid"


def _merge_candidate_chunks(
    primary: list[dict[str, Any]],
    secondary: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged_by_id: dict[str, dict[str, Any]] = {}
    for chunk in [*primary, *secondary]:
        chunk_id = _chunk_id(chunk)
        if not chunk_id:
            continue
        existing = merged_by_id.get(chunk_id)
        if existing is None or _chunk_score(chunk) > _chunk_score(existing):
            merged_by_id[chunk_id] = dict(chunk)
    return sorted(merged_by_id.values(), key=_chunk_score, reverse=True)


def _combine_retrieval_modes(*modes: str) -> str:
    if any(mode == "hybrid" for mode in modes):
        return "hybrid"
    if any(mode == "fts5" for mode in modes):
        return "fts5"
    return "hybrid"


def _prepare_retrieval_state(
    host: HostGatewayClient,
    candidate_chunks: list[dict[str, Any]],
    question: str,
    *,
    rewritten_query: str | None = None,
    config: dict[str, Any] | None = None,
    api_key: str = "",
    is_second_retrieval: bool = False,
) -> dict[str, Any]:
    if not candidate_chunks:
        decision, gate_summary = _relevance_gate([], is_second_retrieval=is_second_retrieval)
        return {
            "candidateChunks": [],
            "packedChunks": [],
            "expandedContexts": {},
            "mergeSummary": _default_merge_summary(),
            "packingSummary": _default_packing_summary(),
            "rerankSummary": _default_rerank_summary(),
            "gateSummary": gate_summary,
            "gateDecision": decision,
        }

    document_structure = _build_document_structure_cache(host, candidate_chunks)
    hydrated_chunks = _hydrate_chunks_from_structure(candidate_chunks, document_structure)
    expanded_contexts, merge_summary = _merge_parent_context(
        hydrated_chunks,
        host,
        document_structure=document_structure,
    )
    reranked_chunks, rerank_summary = _rerank_evidence(
        hydrated_chunks,
        question,
        expanded_contexts,
        rewritten_query=rewritten_query,
        config=config,
        api_key=api_key,
    )
    packed_chunks = _pack_chunks(reranked_chunks)
    packing_summary = _packing_summary(packed_chunks, expanded_contexts)
    decision, gate_summary = _relevance_gate(
        reranked_chunks,
        is_second_retrieval=is_second_retrieval,
    )
    return {
        "candidateChunks": reranked_chunks,
        "packedChunks": packed_chunks,
        "expandedContexts": expanded_contexts,
        "mergeSummary": merge_summary,
        "packingSummary": packing_summary,
        "rerankSummary": rerank_summary,
        "gateSummary": gate_summary,
        "gateDecision": decision,
    }


def run_knowledge_qa_workflow(
    run_id: str,
    question: str,
    document_ids: list[str],
    host: HostGatewayClient,
    conversation_id: str | None = None,
    episodic_memory: str | None = None,
) -> dict[str, Any]:
    """Execute a grounded knowledge_qa workflow using vector-backed retrieval."""
    _check_cancelled(host, run_id)
    _emit_rag_progress(
        host,
        run_id,
        "query_embedding",
        "running",
        title="Understanding question",
        detail="Checking embedding readiness",
        progress=0.08,
        metrics={"documentCount": len(document_ids)},
    )

    active_profile = host.get_active_embedding_profile()
    if active_profile is None:
        _emit_rag_progress(
            host,
            run_id,
            "query_embedding",
            "failed",
            title="Understanding question",
            detail="No active embedding profile is configured",
            progress=0.08,
        )
        return _status_answer(
            "当前没有可用的 embedding 配置。请先配置 embedding，并为文档生成向量后再提问。",
            "embedding_missing",
            rag_trace=_build_rag_trace(
                readiness_status="embedding_missing",
                retrieval_mode="hybrid",
                failure_reason="embedding_missing",
            ),
        )

    readiness_status = _embedding_readiness_status(host, active_profile, document_ids)
    if readiness_status == "embedding_missing":
        _emit_rag_progress(
            host,
            run_id,
            "query_embedding",
            "failed",
            title="Understanding question",
            detail="Selected documents are not embedded",
            progress=0.08,
            metrics={"readiness": readiness_status},
        )
        return _status_answer(
            "所选资料尚未完成当前 embedding 配置的向量化。请先生成文档向量后再提问。",
            "embedding_missing",
            rag_trace=_build_rag_trace(
                readiness_status=readiness_status,
                retrieval_mode="hybrid",
                failure_reason=readiness_status,
            ),
        )
    if readiness_status == "embedding_stale":
        _emit_rag_progress(
            host,
            run_id,
            "query_embedding",
            "failed",
            title="Understanding question",
            detail="Selected documents have stale embeddings",
            progress=0.08,
            metrics={"readiness": readiness_status},
        )
        return _status_answer(
            "所选资料的向量已过期。请重新生成文档向量后再提问。",
            "embedding_stale",
            rag_trace=_build_rag_trace(
                readiness_status=readiness_status,
                retrieval_mode="hybrid",
                failure_reason=readiness_status,
            ),
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
        _emit_rag_progress(
            host,
            run_id,
            "query_embedding",
            "completed",
            title="Understanding question",
            detail="Query embedding is ready",
            progress=0.18,
            metrics={
                "cacheHit": query_embedding_result.cache_hit,
                "attempts": query_embedding_result.attempts,
                "latencyMs": round(query_embedding_result.latency_ms, 2),
            },
        )
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
        _emit_rag_progress(
            host,
            run_id,
            "query_embedding",
            "failed",
            title="Understanding question",
            detail=status,
            progress=0.18,
            metrics={"attempts": attempts},
        )
        try:
            _emit_rag_progress(
                host,
                run_id,
                "retrieve",
                "running",
                title="Retrieving documents",
                detail="Falling back to lexical retrieval",
                progress=0.24,
            )
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
            _emit_rag_progress(
                host,
                run_id,
                "retrieve",
                "failed",
                title="Retrieving documents",
                detail="Lexical fallback failed",
                progress=0.24,
            )
        if packed_lexical_chunks:
            _emit_rag_progress(
                host,
                run_id,
                "retrieve",
                "completed",
                title="Retrieving documents",
                detail="Lexical fallback found candidate chunks",
                progress=0.32,
                metrics={"chunkCount": len(packed_lexical_chunks)},
            )
            lexical_structure = _build_document_structure_cache(host, packed_lexical_chunks)
            packed_lexical_chunks = _hydrate_chunks_from_structure(packed_lexical_chunks, lexical_structure)
            lexical_expanded_contexts, lexical_merge_summary = _merge_parent_context(
                packed_lexical_chunks,
                host,
                document_structure=lexical_structure,
            )
            lexical_packing_summary = _packing_summary(packed_lexical_chunks, lexical_expanded_contexts)
            result = _excerpt_fallback_answer(
                packed_lexical_chunks,
                f"{status}: {message}",
                retrieval_status=status,
                retrieval_mode="fts5",
                rag_trace=_build_rag_trace(
                    readiness_status=readiness_status,
                    retrieval_mode="fts5",
                    chunks=packed_lexical_chunks,
                    merge_summary=lexical_merge_summary,
                    packing_summary=lexical_packing_summary,
                    audit_summary=_default_audit_summary("clean"),
                    failure_reason=status,
                ),
            )
            result["answer"].update(failure_meta)
            return result
        result = _status_answer(
            message,
            status,
            rag_trace=_build_rag_trace(
                readiness_status=readiness_status,
                retrieval_mode="hybrid",
                failure_reason=status,
            ),
        )
        result["answer"].update(failure_meta)
        return result

    _check_cancelled(host, run_id)
    config_with_key = host.get_config_for_workflow("knowledge_qa")
    config: dict[str, Any] = {}
    api_key = ""
    if config_with_key:
        config, api_key = config_with_key

    recent_messages = _recent_messages_for_rewrite(host, conversation_id)
    rewrite_reason = _rewrite_trigger_reason(question, recent_messages)
    rewritten_query: str | None = None
    rewrite_summary = _default_rewrite_summary(
        trigger_reason=rewrite_reason,
        original_query=question,
        recent_message_count=len(recent_messages),
    )
    if rewrite_reason:
        _emit_rag_progress(
            host,
            run_id,
            "rewrite",
            "running",
            title="Rewriting query",
            detail="Resolving the question against recent context",
            progress=0.22,
            metrics={"recentMessageCount": len(recent_messages)},
        )
        if config_with_key:
            try:
                rewrite_candidate = _rewrite_query(config, api_key, question, recent_messages)
                if rewrite_candidate.strip() != question.strip():
                    rewritten_query = rewrite_candidate
                    rewrite_summary = _default_rewrite_summary(
                        "applied",
                        trigger_reason=rewrite_reason,
                        original_query=question,
                        rewritten_query=rewritten_query,
                        recent_message_count=len(recent_messages),
                    )
                else:
                    rewrite_summary = _default_rewrite_summary(
                        "same_as_original",
                        trigger_reason=rewrite_reason,
                        original_query=question,
                        rewritten_query=rewrite_candidate,
                        recent_message_count=len(recent_messages),
                    )
            except Exception as exc:
                if isinstance(exc, WorkflowCancelled):
                    raise
                logger.warning("Knowledge QA rewrite failed: %s", exc)
                rewrite_summary = _default_rewrite_summary(
                    "failed",
                    trigger_reason=rewrite_reason,
                    original_query=question,
                    recent_message_count=len(recent_messages),
                )
        else:
            rewrite_summary = _default_rewrite_summary(
                "skipped_no_model",
                trigger_reason=rewrite_reason,
                original_query=question,
                recent_message_count=len(recent_messages),
            )
        _emit_rag_progress(
            host,
            run_id,
            "rewrite",
            "completed" if rewrite_summary.get("status") == "applied" else "skipped",
            title="Rewriting query",
            detail=str(rewrite_summary.get("status") or "not_run"),
            progress=0.28,
            metrics={"status": rewrite_summary.get("status")},
        )
    else:
        _emit_rag_progress(
            host,
            run_id,
            "rewrite",
            "skipped",
            title="Rewriting query",
            detail="Question is already standalone",
            progress=0.28,
        )

    first_query_specs: list[dict[str, Any]] = [
        {
            "label": "original",
            "query": question,
            "embedding": query_embedding,
            "required": True,
        }
    ]
    if rewritten_query:
        first_query_specs.append(
            {
                "label": "rewrite",
                "query": rewritten_query,
                "embedding": _embed_optional_query(host, active_profile, rewritten_query),
                "required": False,
            }
        )

    _emit_rag_progress(
        host,
        run_id,
        "retrieve",
        "running",
        title="Retrieving documents",
        detail="Searching document chunks",
        progress=0.34,
        metrics={"queryCount": len(first_query_specs)},
    )
    candidate_chunks, retrieval_mode = _search_candidates_for_queries(host, first_query_specs, document_ids)
    _emit_rag_progress(
        host,
        run_id,
        "retrieve",
        "completed" if candidate_chunks else "failed",
        title="Retrieving documents",
        detail="Candidate retrieval finished",
        progress=0.42,
        metrics={"chunkCount": len(candidate_chunks), "mode": retrieval_mode},
    )
    retrieval_state = _prepare_retrieval_state(
        host,
        candidate_chunks,
        question,
        rewritten_query=rewritten_query,
        config=config if config_with_key else None,
        api_key=api_key,
    )
    _emit_rag_progress(
        host,
        run_id,
        "rerank",
        "completed",
        title="Reranking evidence",
        detail=str(retrieval_state["rerankSummary"].get("status") or "not_run"),
        progress=0.52,
        metrics={
            "chunkCount": retrieval_state["rerankSummary"].get("chunkCount", 0),
            "topScore": retrieval_state["rerankSummary"].get("topScore"),
        },
    )
    _emit_rag_progress(
        host,
        run_id,
        "gate",
        "completed",
        title="Checking relevance",
        detail=str(retrieval_state["gateSummary"].get("decision") or "not_run"),
        progress=0.58,
        metrics={
            "decision": retrieval_state["gateSummary"].get("decision"),
            "topScore": retrieval_state["gateSummary"].get("topScore"),
        },
    )

    second_retrieval_summary = _default_second_retrieval_summary()
    if retrieval_state["gateDecision"] == "second_retrieval":
        _emit_rag_progress(
            host,
            run_id,
            "second_retrieval",
            "running",
            title="Running second retrieval",
            detail="First pass evidence was weak",
            progress=0.62,
        )
        second_query_status = "fallback_original"
        second_query_reason = str(retrieval_state["gateSummary"].get("reason") or "low_relevance")
        second_query = rewritten_query or question
        if not rewritten_query or rewritten_query == question:
            try:
                second_query = _build_second_retrieval_query(
                    config if config_with_key else None,
                    api_key,
                    question,
                    rewritten_query,
                    recent_messages,
                )
                if second_query.strip() != question.strip():
                    second_query_status = "applied"
            except Exception as exc:
                if isinstance(exc, WorkflowCancelled):
                    raise
                logger.warning("Knowledge QA second retrieval rewrite failed: %s", exc)
                second_query = rewritten_query or question
                second_query_status = "failed_fallback"
        else:
            second_query_status = "reuse_rewrite"

        second_query_specs = [
            {
                "label": "second_retrieval",
                "query": second_query,
                "embedding": _embed_optional_query(host, active_profile, second_query),
                "required": False,
            }
        ]
        second_candidate_chunks, second_retrieval_mode = _search_candidates_for_queries(
            host,
            second_query_specs,
            document_ids,
        )
        first_chunk_ids = {
            _chunk_id(chunk)
            for chunk in retrieval_state["candidateChunks"]
            if _chunk_id(chunk)
        }
        additional_chunk_count = sum(
            1
            for chunk in second_candidate_chunks
            if (_chunk_id(chunk) and _chunk_id(chunk) not in first_chunk_ids)
        )
        merged_candidates = _merge_candidate_chunks(
            retrieval_state["candidateChunks"],
            second_candidate_chunks,
        )
        retrieval_mode = _combine_retrieval_modes(retrieval_mode, second_retrieval_mode)
        retrieval_state = _prepare_retrieval_state(
            host,
            merged_candidates,
            question,
            rewritten_query=rewritten_query or second_query,
            config=config if config_with_key else None,
            api_key=api_key,
            is_second_retrieval=True,
        )
        second_retrieval_summary = {
            "status": second_query_status,
            "used": True,
            "queryPreview": _truncate_text(second_query, 80),
            "additionalChunkCount": additional_chunk_count,
            "reason": second_query_reason,
        }
        _emit_rag_progress(
            host,
            run_id,
            "second_retrieval",
            "completed",
            title="Running second retrieval",
            detail=second_query_status,
            progress=0.68,
            metrics={"additionalChunkCount": additional_chunk_count},
        )
    else:
        _emit_rag_progress(
            host,
            run_id,
            "second_retrieval",
            "skipped",
            title="Running second retrieval",
            detail="First pass evidence was sufficient",
            progress=0.68,
        )

    packed_chunks = retrieval_state["packedChunks"]
    expanded_contexts = retrieval_state["expandedContexts"]
    merge_summary = retrieval_state["mergeSummary"]
    packing_summary = retrieval_state["packingSummary"]
    rerank_summary = retrieval_state["rerankSummary"]
    gate_summary = retrieval_state["gateSummary"]
    _emit_rag_progress(
        host,
        run_id,
        "pack",
        "completed",
        title="Packing context",
        detail="Evidence context is ready",
        progress=0.74,
        metrics={
            "passageCount": packing_summary.get("passageCount", 0),
            "totalChars": packing_summary.get("totalChars", 0),
        },
    )

    if retrieval_state["gateDecision"] == "no_relevant_content" or not packed_chunks:
        _emit_rag_progress(
            host,
            run_id,
            "generate",
            "skipped",
            title="Generating answer",
            detail="No relevant evidence passed the gate",
            progress=0.88,
        )
        result = _status_answer(
            "当前资料中没有足够证据回答这个问题。",
            "no_hits",
            retrieval_mode=retrieval_mode,
            rag_trace=_build_rag_trace(
                readiness_status=readiness_status,
                retrieval_mode=retrieval_mode,
                chunks=packed_chunks,
                query_rewrite_used=rewritten_query is not None,
                rewrite_summary=rewrite_summary,
                merge_summary=merge_summary,
                packing_summary=packing_summary,
                rerank_summary=rerank_summary,
                gate_summary=gate_summary,
                second_retrieval_summary=second_retrieval_summary,
                audit_summary=_default_audit_summary("not_run"),
                failure_reason="relevance_gate_rejected",
            ),
        )
        result["answer"].update(query_embedding_meta)
        return result

    if not config_with_key:
        if retrieval_mode == "fts5":
            _emit_rag_progress(
                host,
                run_id,
                "generate",
                "skipped",
                title="Generating answer",
                detail="No model is configured",
                progress=0.88,
            )
            result = _status_answer(
                "当前资料中没有足够证据回答这个问题。",
                "no_hits",
                rag_trace=_build_rag_trace(
                    readiness_status=readiness_status,
                    retrieval_mode=retrieval_mode,
                    chunks=packed_chunks,
                    query_rewrite_used=rewritten_query is not None,
                    rewrite_summary=rewrite_summary,
                    merge_summary=merge_summary,
                    packing_summary=packing_summary,
                    rerank_summary=rerank_summary,
                    gate_summary=gate_summary,
                    second_retrieval_summary=second_retrieval_summary,
                    failure_reason="model_not_configured",
                ),
            )
            result["answer"].update(query_embedding_meta)
            return result
        raise RuntimeError("Knowledge Q&A model is not configured")

    if _uses_degraded_lexical_fallback(retrieval_mode, packed_chunks):
        _emit_rag_progress(
            host,
            run_id,
            "generate",
            "skipped",
            title="Generating answer",
            detail="Using excerpt fallback",
            progress=0.88,
        )
        result = _excerpt_fallback_answer(
            packed_chunks,
            "contains_only_fallback",
            retrieval_mode=retrieval_mode,
            rag_trace=_build_rag_trace(
                readiness_status=readiness_status,
                retrieval_mode=retrieval_mode,
                chunks=packed_chunks,
                query_rewrite_used=rewritten_query is not None,
                rewrite_summary=rewrite_summary,
                merge_summary=merge_summary,
                packing_summary=packing_summary,
                rerank_summary=rerank_summary,
                gate_summary=gate_summary,
                second_retrieval_summary=second_retrieval_summary,
                audit_summary=_default_audit_summary("not_run"),
                failure_reason="contains_only_fallback",
            ),
        )
        result["answer"].update(query_embedding_meta)
        return result

    passages_text = _build_passages(
        packed_chunks,
        expanded_contexts,
        episodic_memory=episodic_memory,
    )
    _check_cancelled(host, run_id)
    _emit_rag_progress(
        host,
        run_id,
        "generate",
        "running",
        title="Generating answer",
        detail="Calling the configured model",
        progress=0.82,
    )
    try:
        answer_data = _try_langchain_qa(config, api_key, question, passages_text)
    except Exception as exc:
        if isinstance(exc, WorkflowCancelled):
            raise
        logger.warning("Knowledge QA model answer failed, using excerpt fallback: %s", exc)
        _emit_rag_progress(
            host,
            run_id,
            "generate",
            "failed",
            title="Generating answer",
            detail="Model generation failed; using excerpt fallback",
            progress=0.88,
        )
        result = _excerpt_fallback_answer(
            packed_chunks,
            f"model_error: {exc}",
            retrieval_mode=retrieval_mode,
            rag_trace=_build_rag_trace(
                readiness_status=readiness_status,
                retrieval_mode=retrieval_mode,
                chunks=packed_chunks,
                query_rewrite_used=rewritten_query is not None,
                rewrite_summary=rewrite_summary,
                merge_summary=merge_summary,
                packing_summary=packing_summary,
                rerank_summary=rerank_summary,
                gate_summary=gate_summary,
                second_retrieval_summary=second_retrieval_summary,
                audit_summary=_default_audit_summary("clean"),
                failure_reason=f"model_error: {exc}",
            ),
        )
        result["answer"].update(query_embedding_meta)
        return result
    _check_cancelled(host, run_id)
    _emit_rag_progress(
        host,
        run_id,
        "generate",
        "completed",
        title="Generating answer",
        detail="Answer text generated",
        progress=0.88,
    )

    answer_mode = answer_data.get("answerMode")
    raw_citations = answer_data.get("citations", [])
    _emit_rag_progress(
        host,
        run_id,
        "audit",
        "running",
        title="Auditing citations",
        detail="Checking cited chunks",
        progress=0.92,
        metrics={"citationCount": len(raw_citations) if isinstance(raw_citations, list) else 0},
    )
    citations, rejected_citations, audit_status = _audit_citations(raw_citations, packed_chunks)
    audit_summary = _default_audit_summary(
        audit_status,
        len(raw_citations) if isinstance(raw_citations, list) else 0,
        len(citations),
        len(rejected_citations),
    )
    rag_trace = _build_rag_trace(
        readiness_status=readiness_status,
        retrieval_mode=retrieval_mode,
        chunks=packed_chunks,
        query_rewrite_used=rewritten_query is not None,
        rewrite_summary=rewrite_summary,
        merge_summary=merge_summary,
        packing_summary=packing_summary,
        rerank_summary=rerank_summary,
        gate_summary=gate_summary,
        second_retrieval_summary=second_retrieval_summary,
        audit_summary=audit_summary,
    )
    _emit_rag_progress(
        host,
        run_id,
        "audit",
        "completed",
        title="Auditing citations",
        detail=audit_status,
        progress=0.96,
        metrics={
            "validCitations": len(citations),
            "rejectedCitations": len(rejected_citations),
        },
    )
    if answer_mode == "no_relevant_content":
        return {
            "status": "completed",
            "answer": {
                "answer": str(answer_data.get("answer") or "当前资料中没有足够证据回答这个问题。").strip(),
                "answerMode": "no_relevant_content",
                "retrievalMode": retrieval_mode,
                "retrievalStatus": "no_hits",
                "citations": [],
                "ragTrace": rag_trace,
                **query_embedding_meta,
            },
        }

    if not citations:
        result = _status_answer(
            "当前资料中没有足够证据回答这个问题。",
            "no_hits",
            rag_trace=_build_rag_trace(
                readiness_status=readiness_status,
                retrieval_mode=retrieval_mode,
                chunks=packed_chunks,
                query_rewrite_used=rewritten_query is not None,
                rewrite_summary=rewrite_summary,
                merge_summary=merge_summary,
                packing_summary=packing_summary,
                rerank_summary=rerank_summary,
                gate_summary=gate_summary,
                second_retrieval_summary=second_retrieval_summary,
                audit_summary=audit_summary,
                failure_reason="citation_audit_failed",
            ),
        )
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
            "ragTrace": rag_trace,
            **query_embedding_meta,
        },
    }
