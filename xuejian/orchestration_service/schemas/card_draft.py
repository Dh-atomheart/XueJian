"""Card draft schemas for the orchestration service.

These Pydantic models represent the intermediate representation used when
assembling card candidates during AI generation workflows, before persisting
to the Rust host via the HostGatewayClient.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


CardType = Literal["qa", "cloze", "fact", "choice"]


class CardDraft(BaseModel):
    """A generated flashcard candidate before deduplication / persistence."""

    front: str = Field(..., min_length=8, max_length=500)
    back: str = Field(..., min_length=12, max_length=2000)
    title: str | None = Field(default=None, max_length=120)
    card_type: CardType = Field(default="qa")
    confidence: float = Field(default=0.7, ge=0.0, le=1.0)
    tags: list[str] = Field(default_factory=list)
    anchor_id: str | None = None
    dedupe_key: str = Field(...)

    @field_validator("tags")
    @classmethod
    def _truncate_tags(cls, v: list[str]) -> list[str]:
        return v[:8]

    @field_validator("confidence")
    @classmethod
    def _round_confidence(cls, v: float) -> float:
        return round(v, 3)

    def to_persist_payload(self, run_id: str, document_id: str) -> dict:
        """Serialise to the JSON shape expected by HostGatewayClient.persist_candidates."""
        return {
            "workflowRunId": run_id,
            "documentId": document_id,
            "anchorId": self.anchor_id,
            "title": self.title,
            "cardType": self.card_type,
            "front": self.front,
            "back": self.back,
            "confidence": self.confidence,
            "tags": self.tags,
            "dedupeKey": self.dedupe_key,
        }


class CardDraftBatch(BaseModel):
    """A batch of card drafts, typically from a single LLM response."""

    drafts: list[CardDraft] = Field(default_factory=list)

    @classmethod
    def from_llm_json(cls, items: list[dict], anchor_id: str | None, document_id: str) -> "CardDraftBatch":
        """Parse a raw list of LLM-generated card objects into validated CardDraft instances.

        Silently skips items that fail validation.
        """
        import hashlib

        drafts: list[CardDraft] = []
        for item in items:
            front = str(item.get("front", "")).strip()
            back = str(item.get("back", "")).strip()
            if len(front) < 8 or len(back) < 12:
                continue

            confidence = float(item.get("confidence", 0.7))
            confidence = max(0.0, min(1.0, confidence))

            tags = item.get("tags", [])
            if isinstance(tags, str):
                tags = [t.strip() for t in tags.split(",") if t.strip()]
            tags = [str(t) for t in tags]

            card_type: CardType = "qa"
            raw_ct = str(item.get("cardType") or item.get("card_type") or "qa").lower()
            if raw_ct in {"cloze", "fact", "choice"}:
                card_type = raw_ct  # type: ignore[assignment]

            title = str(item.get("title", "")).strip() or None
            if title and len(title) > 120:
                title = title[:120]

            payload = f"{document_id}::{anchor_id or 'doc'}::{front.strip().lower()}::{back.strip().lower()}"
            dedupe_key = hashlib.sha256(payload.encode("utf-8")).hexdigest()

            try:
                drafts.append(
                    CardDraft(
                        front=front,
                        back=back,
                        title=title,
                        card_type=card_type,
                        confidence=confidence,
                        tags=tags,
                        anchor_id=anchor_id,
                        dedupe_key=dedupe_key,
                    )
                )
            except Exception:  # noqa: BLE001
                continue

        return cls(drafts=drafts)
