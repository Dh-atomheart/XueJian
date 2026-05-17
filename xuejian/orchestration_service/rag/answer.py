"""Answer generation — structured output, JSON repair fallback, excerpt fallback."""
from __future__ import annotations

import json
import logging
from typing import Any

from .audit import _chunk_content, _chunk_id, _chunk_page, _chunk_score, _citation_from_chunk, _strip_code_fence, _truncate_text
from .exceptions import KnowledgeQaJsonError
from .prompts import JSON_REPAIR_PROMPT, KNOWLEDGE_QA_SYSTEM_PROMPT, KNOWLEDGE_QA_USER_TEMPLATE

logger = logging.getLogger(__name__)


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
    return _extract_text(getattr(response, "content", response))


def try_langchain_qa(
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


def status_answer(
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


def excerpt_fallback_answer(
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
        result = status_answer(
            "当前资料中没有足够证据回答这个问题。",
            "no_hits",
            retrieval_mode=retrieval_mode,
            rag_trace=rag_trace,
        )
        result["answer"].update(query_embedding_meta)
        return result

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


def embedding_error_status(exc: Exception) -> tuple[str, str]:
    from ..providers.embedding_runtime import QueryEmbeddingRuntimeError

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
