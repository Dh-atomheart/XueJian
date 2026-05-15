from __future__ import annotations

from typing import Any, TypedDict


class KnowledgeQaGraphState(TypedDict, total=False):
    run_id: str
    question: str
    document_ids: list[str]
    conversation_id: str | None
    result: dict[str, Any] | None