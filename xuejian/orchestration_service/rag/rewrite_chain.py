"""Rewrite Chain — LangChain Runnable for query rewriting and second retrieval."""
from __future__ import annotations

import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableSerializable
from pydantic import Field

from .audit import _extract_query_text, _truncate_text
from .constants import RECENT_MESSAGES_LIMIT, REWRITE_QUERY_MAX_CHARS, SECOND_RETRIEVAL_QUERY_MAX_CHARS
from .prompts import (
    QUERY_REWRITE_SYSTEM_PROMPT,
    QUERY_REWRITE_USER_TEMPLATE,
    SECOND_RETRIEVAL_SYSTEM_PROMPT,
    SECOND_RETRIEVAL_USER_TEMPLATE,
)

logger = logging.getLogger(__name__)


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


class RewriteChain(RunnableSerializable):
    """LangChain Runnable that rewrites a user question into a standalone retrieval query."""

    llm: BaseChatModel = Field(description="Chat model for rewriting")

    class Config:
        arbitrary_types_allowed = True

    def invoke(
        self,
        input: dict[str, Any],
        config: Any = None,
        **kwargs: Any,
    ) -> str:
        question = input.get("question", "")
        recent_messages = input.get("recent_messages") or []
        raw = self.llm.invoke(
            [
                SystemMessage(content=QUERY_REWRITE_SYSTEM_PROMPT),
                HumanMessage(
                    content=QUERY_REWRITE_USER_TEMPLATE.format(
                        question=question,
                        recent_messages=_format_recent_messages(recent_messages),
                    )
                ),
            ]
        )
        text = raw.content if isinstance(raw.content, str) else str(raw.content)
        return _extract_query_text(text, question, REWRITE_QUERY_MAX_CHARS)


class SecondRetrievalChain(RunnableSerializable):
    """LangChain Runnable that generates a broader retrieval query for second-pass retrieval."""

    llm: BaseChatModel | None = Field(default=None, description="Chat model for second retrieval query")

    class Config:
        arbitrary_types_allowed = True

    def invoke(
        self,
        input: dict[str, Any],
        config: Any = None,
        **kwargs: Any,
    ) -> str:
        question = input.get("question", "")
        rewritten_query = input.get("rewritten_query")
        recent_messages = input.get("recent_messages") or []
        fallback = rewritten_query or question

        if self.llm is None:
            for message in reversed(recent_messages):
                content = message.get("content", "")
                if content and content != question:
                    return _truncate_text(f"{content} {question}", SECOND_RETRIEVAL_QUERY_MAX_CHARS)
            return _truncate_text(fallback, SECOND_RETRIEVAL_QUERY_MAX_CHARS)

        raw = self.llm.invoke(
            [
                SystemMessage(content=SECOND_RETRIEVAL_SYSTEM_PROMPT),
                HumanMessage(
                    content=SECOND_RETRIEVAL_USER_TEMPLATE.format(
                        question=question,
                        rewritten_query=rewritten_query or question,
                        recent_messages=_format_recent_messages(recent_messages),
                    )
                ),
            ]
        )
        text = raw.content if isinstance(raw.content, str) else str(raw.content)
        return _extract_query_text(text, fallback, SECOND_RETRIEVAL_QUERY_MAX_CHARS)
