"""Card generation workflow — LLM-based and rule-based flashcard extraction."""
from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import TYPE_CHECKING

from ..providers.runtime import build_langchain_chat_model, estimate_workflow_cost
from ..schemas.card_draft import CardDraftBatch
from .agent_card_generation import generate_cards_with_agent

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)

CARD_GENERATION_SYSTEM_PROMPT = """\
You are a flashcard generation assistant for a spaced-repetition learning app.
Given a text passage from a document, generate flashcard candidates.

--- HIGH-QUALITY CARD DEFINITION ---
A good card has a front that is a clear description of a knowledge point or a precise question,
and a back that gives the detailed explanation or answer. One card = one atomic fact worth remembering.

--- WHAT TO SKIP ---
Do NOT generate cards from:
- Document metadata (titles, authors, copyright, edition, publication info)
- Table of contents entries, page headers/footers, page numbers
- Bibliographic references, citation lists
- Boilerplate text (disclaimers, licenses, navigation instructions)
- Generic location references ("on page X, the key idea is...")

--- ALLOWED CARD TYPES ---
- "qa": Question & Answer. Front is a question; back is the answer.
- "cloze": Fill-in-the-blank. Front uses {{c1::term}} syntax; back is the full sentence.
- "fact": A key fact. Front is a topic/heading; back is the fact content.

Do NOT use "choice" cards.

--- QUALITY RULES ---
- Fronts must be self-contained and specific. Avoid vague fronts like "What is this about?".
  Instead use "What is X?", "How does X work?", "What are the characteristics of X?".
- Definitions (e.g. "X is Y" or "X refers to Y") should become "qa" cards with "What is X?" as the front.
- Confidence >= 0.85: directly grounded in the passage, central fact.
- Confidence 0.65–0.84: useful but slightly inferred or secondary detail.
- Confidence < 0.65: uncertain, likely to be discarded.
- Generate 1–4 cards per passage. Quality over quantity.

--- OUTPUT FORMAT ---
Output valid JSON only: an array of objects with keys "front", "back", "cardType", "confidence", "tags".
Front: 8–500 chars. Back: 12–2000 chars.
"""

CARD_GENERATION_USER_TEMPLATE = """\
Source context:
- Document: {title}
- Section: {section_heading}
- Hierarchy: {hierarchy_path}
- Page range: {page_range}

Passage to generate cards from:
{quote}

Generate flashcard candidates from the passage above. Output a JSON array only.

REMEMBER: Skip metadata, TOC entries, references, boilerplate. Use ONLY qa/cloze/fact types.
"""


class WorkflowCancelled(Exception):
    """Raised when the host signals cancellation."""


def _check_cancelled(host: HostGatewayClient, run_id: str) -> None:
    """Poll host for cancellation; raise WorkflowCancelled if so."""
    if host.is_run_cancelled(run_id):
        raise WorkflowCancelled(run_id)


RATE_LIMIT_RETRY_BACKOFF_SECONDS = [2, 4, 8, 15, 30]


def _parse_rate_limit_delay(exc: Exception) -> float | None:
    """Extract retry delay from a rate-limit error message, if applicable."""
    msg = str(exc)
    if "RESOURCE_EXHAUSTED" not in msg and "429" not in msg:
        return None
    # Try to extract retryDelay from the error JSON embedded in the message
    match = re.search(r'retryDelay["\']?\s*:\s*["\']?(\d+(?:\.\d+)?)s?', msg)
    if match:
        return float(match.group(1))
    return None


def _wait_rate_limit(exc: Exception, consecutive: int) -> bool:
    """Handle a rate-limit error: wait if delay is reasonable, else skip.

    Returns True if caller should retry the chunk (waited), False if caller should skip it.
    """
    delay = _parse_rate_limit_delay(exc)
    if delay is None:
        return False  # not a rate limit error
    if delay > 60:
        logger.warning("Rate limit delay of %.1fs exceeds max wait, skipping chunk", delay)
        return False
    wait = max(delay, RATE_LIMIT_RETRY_BACKOFF_SECONDS[min(consecutive, len(RATE_LIMIT_RETRY_BACKOFF_SECONDS) - 1)])
    logger.info("Rate limited, waiting %.1fs before next chunk (consecutive=%d)", wait, consecutive)
    import time
    time.sleep(wait)
    return True


def _compute_dedupe_key(document_id: str, anchor_id: str | None, front: str, back: str) -> str:
    payload = f"{document_id}::{anchor_id or 'doc'}::{front.strip().lower()}::{back.strip().lower()}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def _get_chunk_section(chunk: dict, section_by_id: dict[str, dict]) -> dict | None:
    section_id = chunk.get("sectionId")
    if not section_id:
        return None
    return section_by_id.get(section_id)


def _candidate_base_payload(
    chunk: dict,
    *,
    generation_mode: str,
    fallback_reason: str | None = None,
    source_quote: str | None = None,
) -> dict:
    quote = (source_quote or chunk.get("snippet") or chunk.get("content") or "").strip()
    return {
        "sectionId": chunk.get("sectionId"),
        "visibilityBucket": "default",
        "generationMode": generation_mode,
        "fallbackReason": fallback_reason,
        "sourcePage": chunk.get("pageStart"),
        "sourceQuote": _truncate(quote, 500) if quote else None,
        "sourceChunkIds": [chunk["id"]] if chunk.get("id") else None,
    }


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
    return f"{location}: what is the key idea about {focus}?", _truncate(text, 220), 0.68


def _persist_card_batch(host: HostGatewayClient, run_id: str, document_id: str, candidates: list[dict]) -> tuple[int, int]:
    if not candidates:
        return 0, 0

    result = host.persist_cards(run_id, document_id, candidates)
    created = int(result.get("createdCount", 0) or 0)
    skipped = int(result.get("skippedDuplicates", 0) or 0)
    discarded = int(result.get("discardedLowQuality", 0) or 0)
    processed = created + skipped + discarded
    return created, max(processed, len(candidates))


def _try_langchain_generation(
    config: dict, api_key: str, chunks: list[dict], anchors: list[dict],
    document: dict, run_id: str, max_candidates: int, host: HostGatewayClient,
    section_by_id: dict[str, dict],
) -> int:
    """Attempt LangChain-based generation. Returns number of candidates persisted."""
    try:
        from langchain_core.messages import HumanMessage, SystemMessage
    except ImportError:
        logger.warning("LangChain not installed, falling back to rule-based generation")
        return 0

    llm = build_langchain_chat_model(config, api_key, 1.0)

    anchor_by_hash = {a.get("hash", ""): a for a in anchors if a.get("hash")}
    total_persisted = 0
    total_processed = 0
    consecutive_rate_limits = 0

    for chunk in chunks:
        if total_persisted >= max_candidates or total_processed >= max_candidates:
            break

        _check_cancelled(host, run_id)

        anchor = None
        section = _get_chunk_section(chunk, section_by_id)
        metadata = chunk.get("metadata") or {}
        anchor_hashes = metadata.get("anchorHashes", []) if isinstance(metadata, dict) else []
        anchor_ids = metadata.get("anchorIds", []) if isinstance(metadata, dict) else []

        if chunk.get("anchorId"):
            anchor = next((item for item in anchors if item.get("id") == chunk.get("anchorId")), None)

        if anchor is None:
            for anchor_id in anchor_ids:
                anchor = next((item for item in anchors if item.get("id") == anchor_id), None)
                if anchor:
                    break

        for h in anchor_hashes:
            if h in anchor_by_hash:
                anchor = anchor_by_hash[h]
                break

        quote = anchor.get("textQuote", chunk.get("content", ""))[:500] if anchor else chunk.get("content", "")[:500]
        page_range = f"{chunk.get('pageStart', '?')}-{chunk.get('pageEnd', '?')}"
        section_heading = (section or {}).get("heading") or "Untitled section"
        hierarchy_path = " > ".join((section or {}).get("hierarchyPath") or []) or "(root)"

        remaining_budget = max_candidates - total_processed
        try:
            items = generate_cards_with_agent(
                config=config,
                api_key=api_key,
                document=document,
                chunk=chunk,
                quote=quote,
                section_heading=section_heading,
                hierarchy_path=hierarchy_path,
                page_range=page_range,
                max_cards=min(4, remaining_budget),
            )
            if items:
                logger.info(
                    "LangChain agent produced %d card drafts for chunk %s",
                    len(items),
                    chunk.get("chunkIndex"),
                )
            else:
                logger.warning("LangChain agent produced no cards for chunk %s", chunk.get("chunkIndex"))
        except Exception as exc:
            if _wait_rate_limit(exc, consecutive_rate_limits):
                consecutive_rate_limits += 1
                continue
            logger.warning(
                "LangChain agent failed for chunk %s, falling back to direct LLM: %s",
                chunk.get("chunkIndex"),
                exc,
            )
            prompt = CARD_GENERATION_USER_TEMPLATE.format(
                title=document.get("title", "Untitled"),
                section_heading=section_heading,
                hierarchy_path=hierarchy_path,
                page_range=page_range,
                quote=quote,
            )

            try:
                response = llm.invoke([
                    SystemMessage(content=CARD_GENERATION_SYSTEM_PROMPT),
                    HumanMessage(content=prompt),
                ])
                raw = response.content
                if isinstance(raw, list):
                    text_parts = [p for p in raw if isinstance(p, str)]
                    raw = "\n".join(text_parts) if text_parts else ""
                if not isinstance(raw, str):
                    logger.warning("Unexpected LLM response type for chunk %s: %s", chunk.get("chunkIndex"), type(raw).__name__)
                    continue
                match = re.search(r"\[.*\]", raw, re.DOTALL)
                if not match:
                    logger.warning("No JSON array found in LLM response for chunk %s", chunk.get("chunkIndex"))
                    continue
                items = json.loads(match.group())
            except Exception as llm_exc:
                if _wait_rate_limit(llm_exc, consecutive_rate_limits):
                    consecutive_rate_limits += 1
                else:
                    consecutive_rate_limits = 0
                logger.error("LLM invocation failed for chunk %s: %s", chunk.get("chunkIndex"), llm_exc)
                continue

        # Filter out "choice" cards — both prompt paths may still produce them
        _filtered_items = []
        for _item in (items or []):
            if isinstance(_item, dict) and str(_item.get("cardType", "qa")).lower() == "choice":
                logger.debug("Filtered out a 'choice' type card from chunk %s", chunk.get("chunkIndex"))
                continue
            _filtered_items.append(_item)
        items = _filtered_items

        batch = CardDraftBatch.from_llm_json(items, anchor.get("id") if anchor else None, document["id"])
        if batch.invalid_count:
            logger.warning(
                "Rejected %d LLM card candidates for chunk %s: %s",
                batch.invalid_count,
                chunk.get("chunkIndex"),
                "; ".join(batch.rejection_reasons[:3]),
            )
        candidates = []
        for draft in batch.drafts[:max_candidates - total_processed]:
            candidate = draft.to_persist_payload(run_id, document["id"])
            candidate.update(_candidate_base_payload(chunk, generation_mode="llm", source_quote=quote))
            candidate["evaluationSummary"] = f"LLM candidate from {section_heading}"
            candidates.append(candidate)

        if candidates:
            created_count, processed_count = _persist_card_batch(host, run_id, document["id"], candidates)
            total_persisted += created_count
            total_processed += processed_count
            logger.info(
                "Created %d cards for chunk %s (%d candidates processed)",
                created_count,
                chunk.get("chunkIndex"),
                processed_count,
            )
            consecutive_rate_limits = 0

    return total_persisted


def _rule_based_generation(
    chunks: list[dict], anchors: list[dict], document: dict,
    run_id: str, max_candidates: int, host: HostGatewayClient,
    section_by_id: dict[str, dict],
) -> int:
    """Fallback: rule-based candidate generation (mirrors Rust local rules)."""
    anchor_by_hash = {a.get("hash", ""): a for a in anchors if a.get("hash")}
    total_persisted = 0
    total_processed = 0

    for chunk in chunks:
        if total_persisted >= max_candidates or total_processed >= max_candidates:
            break

        _check_cancelled(host, run_id)

        metadata = chunk.get("metadata") or {}
        anchor_hashes = metadata.get("anchorHashes", []) if isinstance(metadata, dict) else []
        section = _get_chunk_section(chunk, section_by_id)

        chunk_anchors = [anchor_by_hash[h] for h in anchor_hashes if h in anchor_by_hash]
        if not chunk_anchors and chunk.get("anchorId"):
            anchor = next((item for item in anchors if item.get("id") == chunk.get("anchorId")), None)
            if anchor:
                chunk_anchors.append(anchor)

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
        for anchor in chunk_anchors[:max_candidates - total_processed]:
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
                **_candidate_base_payload(
                    chunk,
                    generation_mode="fallback_rule",
                    fallback_reason="rule_based_anchor_generation",
                    source_quote=text,
                ),
                "sectionId": chunk.get("sectionId"),
                "anchorId": anchor.get("id"),
                "front": front,
                "back": back,
                "confidence": round(confidence, 3),
                "tags": tags,
                "dedupeKey": dedupe_key,
                "evaluationSummary": f"Rule-based candidate from {(section or {}).get('heading') or 'untitled section'}",
            })

        if candidates:
            created_count, processed_count = _persist_card_batch(host, run_id, document["id"], candidates)
            total_persisted += created_count
            total_processed += processed_count

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
    sections = host.list_sections(document_id)
    if not chunks:
        return {"status": "failed", "error": "Document has no parsed chunks"}

    section_by_id = {section["id"]: section for section in sections if section.get("id")}
    child_chunks = [chunk for chunk in chunks if chunk.get("chunkKind") == "child"]
    generation_chunks = child_chunks or chunks

    # Try to resume from checkpoint
    checkpoint = host.load_checkpoint(run_id)
    start_chunk = 0
    if checkpoint and isinstance(checkpoint, dict):
        payload = checkpoint.get("payload")
        if isinstance(payload, dict):
            start_chunk = payload.get("chunkCursor", 0)
            logger.info("Resuming from checkpoint: chunk_cursor=%d", start_chunk)

    if start_chunk > 0 and start_chunk < len(chunks):
        generation_chunks = generation_chunks[start_chunk:]
        logger.info("Skipping %d already-processed chunks", start_chunk)

    try:
        config_with_key = host.get_config_for_workflow("card_generation")
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
                    config,
                    api_key,
                    generation_chunks,
                    anchors,
                    document,
                    run_id,
                    max_candidates,
                    host,
                    section_by_id,
                )
            except WorkflowCancelled:
                raise
            except Exception as exc:
                logger.error("AI generation failed, falling back to rules: %s", exc)
            else:
                if ai_count > 0 and config.get("id"):
                    try:
                        host.record_workflow_cost(config["id"], estimate_workflow_cost(config))
                    except Exception as exc:
                        logger.warning("Failed to record card generation cost: %s", exc)

        if ai_count == 0:
            logger.info("Using rule-based generation (AI unavailable or produced 0 candidates)")
            ai_count = _rule_based_generation(
                generation_chunks,
                anchors,
                document,
                run_id,
                max_candidates,
                host,
                section_by_id,
            )

        # Save final checkpoint
        _save_progress_checkpoint(host, run_id, document_id, len(generation_chunks), ai_count)

    except WorkflowCancelled:
        logger.info("Workflow %s cancelled by user", run_id)
        counts = host.count_candidates(run_id)
        return {
            "status": "cancelled",
            "generatedCount": counts.get("total", 0),
            "totalCandidates": counts.get("total", 0),
            "pendingCount": counts.get("pending", 0),
        }

    return {
        "status": "completed",
        "generatedCount": ai_count,
        "createdCount": ai_count,
        "pendingCount": 0,
    }


def _save_progress_checkpoint(
    host: HostGatewayClient, run_id: str, document_id: str,
    total_chunks: int, generated_count: int,
) -> None:
    """Persist a lightweight progress checkpoint to the host."""
    try:
        host.save_checkpoint(run_id, {
            "checkpointRef": "python-progress",
            "stepKey": "card-generation",
            "payload": {
                "documentId": document_id,
                "chunkCursor": total_chunks,
                "generatedCount": generated_count,
            },
        })
    except Exception as exc:
        logger.warning("Failed to save checkpoint: %s", exc)
