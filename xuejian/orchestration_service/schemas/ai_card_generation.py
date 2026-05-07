"""Schemas for the direct AI card generation background-job workflow."""
from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field, ValidationError, field_validator


def _normalize_quote_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


class AiGeneratedCardSource(BaseModel):
    chunk_id: str | None = Field(default=None, alias="chunkId")
    page: int = Field(..., ge=1)
    quote: str = Field(..., min_length=5, max_length=1000)

    model_config = {"populate_by_name": True}


class AiGeneratedCard(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    front: str = Field(..., min_length=5, max_length=1000)
    back: str = Field(..., min_length=5, max_length=2000)
    source: AiGeneratedCardSource
    tags: list[str] = Field(default_factory=list)

    @field_validator("title", "front", "back")
    @classmethod
    def _strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("tags", mode="before")
    @classmethod
    def _normalize_tags(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            value = [item.strip() for item in value.split(",")]
        if not isinstance(value, list):
            return []
        tags = []
        for item in value:
            tag = str(item).strip()
            if tag and tag not in tags:
                tags.append(tag)
        return tags[:8]


class AiCardGenerationResult(BaseModel):
    cards: list[AiGeneratedCard] = Field(default_factory=list)
    discarded_count: int = Field(default=0, alias="discardedCount")

    model_config = {"populate_by_name": True}

    @classmethod
    def parse_llm_json(
        cls,
        items: list[Any],
        chunks_by_id: dict[str, dict[str, Any]],
    ) -> "AiCardGenerationResult":
        cards: list[AiGeneratedCard] = []
        discarded_count = 0
        fallback_chunk_id = next(iter(chunks_by_id.keys())) if len(chunks_by_id) == 1 else None

        for item in items:
            if not isinstance(item, dict):
                discarded_count += 1
                continue

            source_chunk_id = (
                item.get("sourceChunkId")
                or item.get("source_chunk_id")
                or (item.get("source") or {}).get("chunkId")
                or (item.get("source") or {}).get("chunk_id")
                or fallback_chunk_id
            )
            source_chunk_id = str(source_chunk_id).strip() if source_chunk_id else None
            source_chunk = chunks_by_id.get(source_chunk_id or "")
            source_page = item.get("sourcePage") or item.get("source_page")
            source_quote = item.get("sourceQuote") or item.get("source_quote")
            if isinstance(item.get("source"), dict):
                source_page = source_page or item["source"].get("page")
                source_quote = source_quote or item["source"].get("quote")
            if source_page is None and source_chunk:
                source_page = source_chunk.get("pageStart") or source_chunk.get("page_start") or source_chunk.get("page")

            payload = {
                "title": item.get("title"),
                "front": item.get("front"),
                "back": item.get("back"),
                "source": {
                    "chunkId": source_chunk_id,
                    "page": source_page,
                    "quote": source_quote,
                },
                "tags": item.get("tags", []),
            }

            try:
                card = AiGeneratedCard.model_validate(payload)
            except ValidationError:
                discarded_count += 1
                continue

            chunk_id = card.source.chunk_id
            chunk_text = str(
                (source_chunk or {}).get("content")
                or (source_chunk or {}).get("text")
                or (source_chunk or {}).get("snippet")
                or ""
            )
            if not chunk_id or not source_chunk or _normalize_quote_text(card.source.quote) not in _normalize_quote_text(chunk_text):
                discarded_count += 1
                continue

            cards.append(card)

        return cls(cards=cards, discardedCount=discarded_count)
