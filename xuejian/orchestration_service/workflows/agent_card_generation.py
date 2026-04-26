"""LangChain agent workflow for autonomous flashcard generation."""
from __future__ import annotations

import logging
from typing import Any, Literal

from pydantic import BaseModel, Field

from ..providers.runtime import build_langchain_chat_model

logger = logging.getLogger(__name__)


class AgentCardDraft(BaseModel):
    """A single flashcard proposed by the card generation agent."""

    front: str = Field(..., min_length=8, max_length=500)
    back: str = Field(..., min_length=12, max_length=2000)
    cardType: Literal["qa", "cloze", "fact", "choice"] = "qa"
    confidence: float = Field(default=0.78, ge=0.0, le=1.0)
    tags: list[str] = Field(default_factory=list, max_length=8)
    title: str | None = Field(default=None, max_length=120)


class AgentCardBatch(BaseModel):
    """Structured response returned by the LangChain card generation agent."""

    cards: list[AgentCardDraft] = Field(default_factory=list, max_length=4)
    rationale: str = Field(default="", max_length=600)


AGENT_SYSTEM_PROMPT = """\
You are XueJian's autonomous flashcard generation agent.

Goal:
- Convert source passages into high-quality spaced-repetition cards.
- Prefer durable concepts, definitions, mechanisms, comparisons, and exam-worthy details.
- Avoid duplicating cards that ask the same thing.
- Ground every card in the supplied passage and context.

Output requirements:
- Return structured AgentCardBatch only.
- Generate 1-4 cards.
- Keep fronts concise and unambiguous.
- Keep backs self-contained and faithful to the source.
- Use mixed card types when useful: qa, cloze, fact, choice.
- Confidence below 0.65 means the card is unlikely to be saved.
"""


def _extract_text(result: Any) -> str:
    if result is None:
        return ""
    content = getattr(result, "content", result)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if text:
                    parts.append(str(text))
        return "\n".join(parts)
    return str(content)


def _coerce_agent_cards(result: Any) -> list[dict]:
    structured = None
    if isinstance(result, dict):
        structured = result.get("structured_response")
    if structured is None:
        structured = getattr(result, "structured_response", None)
    if isinstance(structured, AgentCardBatch):
        return [card.model_dump() for card in structured.cards]
    if isinstance(structured, dict):
        return [dict(card) for card in structured.get("cards", []) if isinstance(card, dict)]
    return []


def generate_cards_with_agent(
    *,
    config: dict,
    api_key: str,
    document: dict,
    chunk: dict,
    quote: str,
    section_heading: str,
    hierarchy_path: str,
    page_range: str,
    max_cards: int,
) -> list[dict]:
    """Run a LangChain v1 agent to produce structured flashcard candidates."""
    try:
        from langchain.agents import create_agent
        from langchain_core.tools import tool
    except ImportError as exc:
        raise RuntimeError("LangChain agent dependencies are not installed") from exc

    llm = build_langchain_chat_model(config, api_key, 0.35)

    @tool
    def inspect_source_context() -> str:
        """Return the source passage and document metadata."""
        return "\n".join(
            [
                f"Document: {document.get('title', 'Untitled')}",
                f"Section: {section_heading}",
                f"Hierarchy: {hierarchy_path}",
                f"Page range: {page_range}",
                f"Source quote: {quote}",
            ]
        )

    agent = create_agent(
        model=llm,
        tools=[inspect_source_context],
        system_prompt=AGENT_SYSTEM_PROMPT,
        response_format=AgentCardBatch,
    )

    instruction = (
        f"Generate up to {max(1, min(4, max_cards))} flashcards. "
        "First inspect the source context, then return only the structured card batch."
    )
    result = agent.invoke({"messages": [{"role": "user", "content": instruction}]})
    cards = _coerce_agent_cards(result)
    if cards:
        return cards[:max_cards]

    raw = _extract_text(result)
    logger.debug("Agent returned no structured cards. Raw result: %s", raw[:500])
    return []
