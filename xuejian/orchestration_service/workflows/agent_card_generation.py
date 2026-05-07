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
You are XueJian's flashcard generation agent. Your task is to convert a source passage
into high-quality, memorable flashcards for spaced repetition.

--- DEFINITION OF A HIGH-QUALITY CARD ---
A good card has:
1. A FRONT that is a self-contained description of a knowledge point OR a precise question about a concept.
2. A BACK that provides the detailed explanation or answer, faithful to the source.
3. A single, well-focused atomic fact — one card = one thing to remember.
4. Information worth remembering: definitions, mechanisms, comparisons, causal relationships, or exam-worthy details.

--- WHAT NOT TO GENERATE CARDS FOR ---
Skip any text that is:
- Document metadata: titles, authors, copyright notices, edition lines, publication info.
- Structural elements: table of contents entries, index entries, page headers/footers, page numbers.
- Bibliographic references: citation lists, reference sections, footnotes that are purely bibliographic.
- Boilerplate: disclaimers, licenses, "this page intentionally left blank", navigation instructions.
- Vague or context-free fragments: incomplete sentences that lack a teachable fact.
- Lists of items without explanatory content (e.g. raw bullet lists with no definitions).

--- CARD TYPES (USE ONLY THESE THREE) ---
- "qa": Question & Answer. Front is a question; back is the full answer.
- "cloze": Fill-in-the-blank. Front uses {{c1::term}} syntax for the blank; back is the full original sentence.
- "fact": A standalone fact. Front is a clear topic heading or concept name; back is the factual content.

Do NOT use "choice" (multiple-choice) cards.

--- QUALITY GUIDELINES ---
- Prefer conceptual understanding over raw memorization.
- Fronts must be interpretable WITHOUT seeing the back. Avoid vague phrasing like "What is it?" or "What about X?". Instead use specific questions: "What is the difference between X and Y?", "How does X mechanism work?", "What are the three properties of X?".
- When a passage contains an explicit definition (e.g. "X refers to Y" or "X is Y"), prefer a "qa" card with "What is X?" as the front.
- Confidence >= 0.85: directly grounded in the passage, central fact.
- Confidence 0.65–0.84: useful but slightly inferred or secondary detail.
- Confidence < 0.65: uncertain, likely to be discarded.

--- OUTPUT REQUIREMENTS ---
- Return exactly one structured AgentCardBatch.
- Generate 1–4 cards per chunk. Fewer high-quality cards are better than many low-quality ones.
- Front: 8–500 chars. Back: 12–2000 chars. Tags: max 8. Title: optional, max 120 chars.
- Confidence: 0.0–1.0 float.
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

    llm = build_langchain_chat_model(config, api_key, 1.0)

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
