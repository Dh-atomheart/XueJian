"""Card generation workflow — LLM-based and rule-based flashcard extraction."""
from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import TYPE_CHECKING

from ..providers.runtime import build_langchain_chat_model

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)

CARD_GENERATION_SYSTEM_PROMPT = """\
You are a flashcard generation assistant for a spaced-repetition learning app.
Given a text passage from a document, generate flashcard candidates.

Rules:
- Each card must have a concise "front" (question or prompt) and a substantive "back" (answer).
- Front should be 8-120 characters. Back should be 12-300 characters.
- Generate 1-3 cards per passage, depending on content density.
- Assign a confidence score between 0.0 and 1.0.
- Tag each card with relevant topic tags.
- Output valid JSON only: an array of objects with keys "front", "back", "confidence", "tags".
"""

CARD_GENERATION_USER_TEMPLATE = """\
Document: {title}
Page range: {page_range}
Source quote: {quote}

Generate flashcard candidates from this passage. Output a JSON array only.
"""


def _compute_dedupe_key(document_id: str, anchor_id: str | None, front: str, back: str) -> str:
    payload = f"{document_id}::{anchor_id or 'doc'}::{front.strip().lower()}::{back.strip().lower()}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def _extract_flashcard(text: str, anchor: dict) -> tuple[str, str, float]:
    """Rule-based flashcard extraction (mirrors Rust build_flashcard_from_anchor)."""
    for marker in ["是指", "指的是", "叫做", "意味着", "是"]:
        if marker in text:
            parts = text.split(marker, 1)
            term = parts[0].strip()
            definition = parts[1].strip()
            if 2 <= len(term) <= 32 and len(definition) >= 12:
                return f"What is {term}?", _truncate(definition, 220), 0.82

    if " is " in text:
        parts = text.split(" is ", 1)
        term = parts[0].strip()
        definition = parts[1].strip()
        if 2 <= len(term) <= 32 and len(definition) >= 12:
            return f"What is {term}?", _truncate(definition, 220), 0.82

    if "contains" in text or "包括" in text or "包含" in text:
        topic = text.split("。")[0].split(".")[0].strip()[:18] or "this passage"
        return f"What are the key points about {topic}?", _truncate(text, 220), 0.71

    page = anchor.get("page", "?")
    paragraph = anchor.get("paragraph")
    location = f"Page {page}" + (f", paragraph {paragraph}" if paragraph else "")
    focus = text.split("。")[0].split(".")[0].strip()[:18] or "this passage"
    return f"{location}: what is the key idea about {focus}?", _truncate(text, 220), 0.64


def _try_langchain_generation(
    config: dict, api_key: str, chunks: list[dict], anchors: list[dict],
    document: dict, run_id: str, max_candidates: int, host: HostGatewayClient,
) -> int:
    """Attempt LangChain-based generation. Returns number of candidates persisted."""
    try:
        from langchain_core.messages import HumanMessage, SystemMessage
    except ImportError:
        logger.warning("LangChain not installed, falling back to rule-based generation")
        return 0

    llm = build_langchain_chat_model(config, api_key, 0.4)

    anchor_by_hash = {a.get("hash", ""): a for a in anchors if a.get("hash")}
    total_persisted = 0

    for chunk in chunks:
        if total_persisted >= max_candidates:
            break

        anchor = None
        metadata = chunk.get("metadata") or {}
        anchor_hashes = metadata.get("anchorHashes", []) if isinstance(metadata, dict) else []
        for h in anchor_hashes:
            if h in anchor_by_hash:
                anchor = anchor_by_hash[h]
                break

        quote = anchor.get("textQuote", chunk.get("content", ""))[:500] if anchor else chunk.get("content", "")[:500]
        page_range = f"{chunk.get('pageStart', '?')}-{chunk.get('pageEnd', '?')}"

        prompt = CARD_GENERATION_USER_TEMPLATE.format(
            title=document.get("title", "Untitled"),
            page_range=page_range,
            quote=quote,
        )

        try:
            response = llm.invoke([
                SystemMessage(content=CARD_GENERATION_SYSTEM_PROMPT),
                HumanMessage(content=prompt),
            ])
            raw = response.content
            match = re.search(r"\[.*\]", raw, re.DOTALL)
            if not match:
                logger.warning("No JSON array found in LLM response for chunk %s", chunk.get("chunkIndex"))
                continue
            items = json.loads(match.group())
        except Exception as exc:
            logger.error("LLM invocation failed for chunk %s: %s", chunk.get("chunkIndex"), exc)
            continue

        candidates = []
        for item in items[:max_candidates - total_persisted]:
            front = str(item.get("front", "")).strip()
            back = str(item.get("back", "")).strip()
            if len(front) < 8 or len(back) < 12:
                continue
            confidence = float(item.get("confidence", 0.7))
            confidence = max(0.0, min(1.0, confidence))
            tags = item.get("tags", [])
            if isinstance(tags, str):
                tags = [t.strip() for t in tags.split(",") if t.strip()]
            tags = [str(t) for t in tags][:8]
            if anchor:
                tags.append(f"page-{anchor.get('page', '?')}")

            dedupe_key = _compute_dedupe_key(
                document["id"], anchor.get("id") if anchor else None, front, back,
            )
            candidates.append({
                "anchorId": anchor.get("id") if anchor else None,
                "front": front,
                "back": back,
                "confidence": round(confidence, 3),
                "tags": tags,
                "dedupeKey": dedupe_key,
            })

        if candidates:
            result = host.persist_candidates(run_id, document["id"], candidates)
            total_persisted += result.get("insertedCount", 0)
            logger.info(
                "Persisted %d candidates for chunk %s (%d duplicates skipped)",
                result.get("insertedCount", 0),
                chunk.get("chunkIndex"),
                result.get("duplicateCount", 0),
            )

    return total_persisted


def _rule_based_generation(
    chunks: list[dict], anchors: list[dict], document: dict,
    run_id: str, max_candidates: int, host: HostGatewayClient,
) -> int:
    """Fallback: rule-based candidate generation (mirrors Rust local rules)."""
    anchor_by_hash = {a.get("hash", ""): a for a in anchors if a.get("hash")}
    total_persisted = 0

    for chunk in chunks:
        if total_persisted >= max_candidates:
            break

        metadata = chunk.get("metadata") or {}
        anchor_hashes = metadata.get("anchorHashes", []) if isinstance(metadata, dict) else []

        chunk_anchors = [anchor_by_hash[h] for h in anchor_hashes if h in anchor_by_hash]
        if not chunk_anchors:
            page_start = chunk.get("pageStart")
            page_end = chunk.get("pageEnd")
            for a in anchors:
                if page_start and a.get("page", 0) < page_start:
                    continue
                if page_end and a.get("page", 0) > page_end:
                    continue
                chunk_anchors.append(a)
            chunk_anchors.sort(key=lambda a: (a.get("page", 0), a.get("paragraph") or 0))

        candidates = []
        for anchor in chunk_anchors[:max_candidates - total_persisted]:
            text = (anchor.get("textQuote") or "").strip()
            if len(text) < 18:
                continue
            front, back, confidence = _extract_flashcard(text, anchor)
            if not front:
                continue
            dedupe_key = _compute_dedupe_key(
                document["id"], anchor.get("id"), front, back,
            )
            tags = [f"page-{anchor.get('page', '?')}"]
            if anchor.get("paragraph"):
                tags.append(f"paragraph-{anchor['paragraph']}")
            candidates.append({
                "anchorId": anchor.get("id"),
                "front": front,
                "back": back,
                "confidence": round(confidence, 3),
                "tags": tags,
                "dedupeKey": dedupe_key,
            })

        if candidates:
            result = host.persist_candidates(run_id, document["id"], candidates)
            total_persisted += result.get("insertedCount", 0)

    return total_persisted


def run_card_generation_workflow(
    run_id: str, document_id: str, max_candidates: int, host: HostGatewayClient,
) -> dict:
    """Execute the card_generation preset workflow."""
    document = host.get_document(document_id)
    if not document:
        return {"status": "failed", "error": f"Document {document_id} not found"}

    chunks = host.list_chunks(document_id)
    anchors = host.list_anchors(document_id)
    if not chunks:
        return {"status": "failed", "error": "Document has no parsed chunks"}

    config_with_key = host.get_default_config_with_key()
    ai_count = 0
    if config_with_key:
        config, api_key = config_with_key
        logger.info(
            "Using AI model %s (%s) for card generation",
            config.get("model", "default"),
            config.get("provider", "openai"),
        )
        try:
            ai_count = _try_langchain_generation(
                config, api_key, chunks, anchors, document, run_id, max_candidates, host,
            )
        except Exception as exc:
            logger.error("AI generation failed, falling back to rules: %s", exc)

    if ai_count == 0:
        logger.info("Using rule-based generation (AI unavailable or produced 0 candidates)")
        ai_count = _rule_based_generation(chunks, anchors, document, run_id, max_candidates, host)

    counts = host.count_candidates(run_id)
    return {
        "status": "completed",
        "generatedCount": ai_count,
        "totalCandidates": counts.get("total", 0),
        "pendingCount": counts.get("pending", 0),
    }
