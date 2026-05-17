"""Query rewrite and second retrieval query generation."""
from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any

from .audit import _extract_query_text, _strip_code_fence, _truncate_text
from .constants import (
    RECENT_MESSAGES_LIMIT,
    REWRITE_QUERY_MAX_CHARS,
    REWRITE_SHORT_QUERY_CHARS,
    SECOND_RETRIEVAL_QUERY_MAX_CHARS,
    SHORT_FOLLOW_UP_TERMS,
    REWRITE_REFERENTIAL_TERMS,
)
from .prompts import (
    QUERY_REWRITE_SYSTEM_PROMPT,
    QUERY_REWRITE_USER_TEMPLATE,
    SECOND_RETRIEVAL_SYSTEM_PROMPT,
    SECOND_RETRIEVAL_USER_TEMPLATE,
)

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)


def recent_messages_for_rewrite(
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


def rewrite_trigger_reason(
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


def should_rewrite_query(
    question: str,
    recent_messages: list[dict[str, str]] | None = None,
) -> bool:
    return rewrite_trigger_reason(question, recent_messages) is not None


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


def rewrite_query(
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


def build_second_retrieval_query(
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
