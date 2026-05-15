from __future__ import annotations

import hashlib
from typing import Any

from .qa_tools import TOOL_REGISTRY
from .registry import ToolDefinition
from .schemas import (
    AuditCardSourceQuotesInput,
    AuditCardSourceQuotesOutput,
    ContentMapInput,
    ContentMapOutput,
    CritiqueCardCandidatesInput,
    CritiqueCardCandidatesOutput,
    DedupeCardCandidatesInput,
    DedupeCardCandidatesOutput,
    GenerateCardCandidatesInput,
    GenerateCardCandidatesOutput,
    SubmitCardCandidatesInput,
    SubmitCardCandidatesOutput,
)
from ..workflows.litellm_card_generation import generate_chunk_cards

CARD_ALLOWED_CALLERS = ("langgraph_card",)


def _chunk_content(chunk: dict[str, Any]) -> str:
    return str(chunk.get("content") or chunk.get("text") or chunk.get("snippet") or "").strip()


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(str(value).split()).strip().casefold()


def _compute_dedupe_key(document_id: str, chunk: dict[str, Any], front: str, back: str) -> str:
    anchor_id = chunk.get("anchorId") or "doc"
    payload = f"{document_id}::{anchor_id}::{front.strip().lower()}::{back.strip().lower()}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _candidate_from_generated_card(
    document_id: str,
    chunk_by_id: dict[str, dict[str, Any]],
    card: dict[str, Any],
) -> dict[str, Any]:
    source_chunk_id = str(card.get("sourceChunkId") or "").strip()
    source_chunk = chunk_by_id.get(source_chunk_id) or {}
    front = str(card.get("front") or "").strip()
    back = str(card.get("back") or "").strip()
    source_quote = str(card.get("sourceQuote") or "").strip()
    confidence = 0.84 if source_quote else 0.72
    return {
        "title": str(card.get("title") or "").strip() or None,
        "cardType": "qa",
        "front": front,
        "back": back,
        "sourcePage": card.get("sourcePage"),
        "sourceQuote": source_quote or None,
        "sourceChunkIds": [source_chunk_id] if source_chunk_id else [],
        "tags": list(card.get("tags") or []),
        "confidence": round(confidence, 3),
        "dedupeKey": _compute_dedupe_key(document_id, source_chunk, front, back),
        "sectionId": source_chunk.get("sectionId"),
        "anchorId": source_chunk.get("anchorId"),
        "visibilityBucket": "default",
        "generationMode": "agent_card_tool",
        "fallbackReason": None,
        "evaluationSummary": "generated_from_child_evidence",
        "scoreOverall": round(confidence, 3),
        "scoreDetails": {
            "sourceGrounded": bool(source_quote and source_chunk_id),
            "quoteExactMatchPlanned": True,
        },
    }


class _RunScopedCardHost:
    def __init__(self, host: Any, run_id: str) -> None:
        self._host = host
        self._run_id = run_id

    def is_job_cancelled(self, job_id: str) -> bool:
        _ = job_id
        is_run_cancelled = getattr(self._host, "is_run_cancelled", None)
        if callable(is_run_cancelled):
            return bool(is_run_cancelled(self._run_id))
        return False

    def __getattr__(self, name: str) -> Any:
        return getattr(self._host, name)


def content_map(tool_input: ContentMapInput) -> ContentMapOutput:
    concepts: list[dict[str, Any]] = []
    for chunk in tool_input.chunks:
        chunk_id = str(chunk.get("id") or chunk.get("chunkId") or "").strip()
        content = _chunk_content(chunk)
        if not chunk_id or not content:
            continue
        if chunk.get("chunkKind") not in {None, "child"}:
            continue
        lines = [segment.strip() for segment in content.replace("\n", "。").split("。") if segment.strip()]
        name = (lines[0] if lines else content)[:48]
        concepts.append(
            {
                "name": name,
                "type": "concept",
                "chunkIds": [chunk_id],
                "description": content[:160],
            }
        )
    return ContentMapOutput(concepts=concepts)


def generate_card_candidates(tool_input: GenerateCardCandidatesInput) -> GenerateCardCandidatesOutput:
    chunk_by_id = {
        str(chunk.get("id") or chunk.get("chunkId") or "").strip(): chunk
        for chunk in tool_input.chunks
        if str(chunk.get("id") or chunk.get("chunkId") or "").strip()
    }
    concept_chunk_ids = [
        chunk_id
        for concept in tool_input.concepts
        for chunk_id in concept.get("chunkIds") or []
        if isinstance(chunk_id, str) and chunk_id in chunk_by_id
    ]
    ordered_chunk_ids = list(dict.fromkeys(concept_chunk_ids or list(chunk_by_id.keys())))
    host = _RunScopedCardHost(tool_input.host_ref, tool_input.run_id)
    candidates: list[dict[str, Any]] = []
    discarded_count = 0
    for chunk_id in ordered_chunk_ids:
        chunk = chunk_by_id.get(chunk_id)
        if not isinstance(chunk, dict):
            continue
        result = generate_chunk_cards(
            job_id=tool_input.run_id,
            document_id=tool_input.document_id,
            group_id="agent-card-candidates",
            density=tool_input.density,
            provider_config_id=tool_input.provider_config_id,
            chunk=chunk,
            host=host,
        )
        discarded_count += int(result.get("discardedCount") or 0)
        for card in result.get("cards") or []:
            if isinstance(card, dict):
                candidates.append(_candidate_from_generated_card(tool_input.document_id, chunk_by_id, card))
    return GenerateCardCandidatesOutput(candidates=candidates, discarded_count=discarded_count)


def critique_card_candidates(tool_input: CritiqueCardCandidatesInput) -> CritiqueCardCandidatesOutput:
    critiqued: list[dict[str, Any]] = []
    for candidate in tool_input.candidates:
        item = dict(candidate)
        front = str(item.get("front") or "").strip()
        back = str(item.get("back") or "").strip()
        source_quote = str(item.get("sourceQuote") or "").strip()
        score = 0.9
        details = {
            "hasSourceQuote": bool(source_quote),
            "frontSpecific": len(front) >= 8 and front not in {"什么是", "这个概念", "这个问题"},
            "backHasContent": len(back) >= 12,
            "notCopyFront": _normalize_text(front) != _normalize_text(back),
        }
        if not details["hasSourceQuote"]:
            score -= 0.25
        if not details["frontSpecific"]:
            score -= 0.15
        if not details["backHasContent"]:
            score -= 0.25
        if not details["notCopyFront"]:
            score -= 0.15
        score = round(max(0.0, min(1.0, score)), 3)
        item["scoreOverall"] = score
        item["scoreDetails"] = details
        item["evaluationSummary"] = (
            "source_quote_bound" if details["hasSourceQuote"] else "missing_source_quote"
        )
        item["confidence"] = round(max(float(item.get("confidence") or 0.0), score), 3)
        critiqued.append(item)
    return CritiqueCardCandidatesOutput(critiqued_candidates=critiqued)


def dedupe_card_candidates(tool_input: DedupeCardCandidatesInput) -> DedupeCardCandidatesOutput:
    kept: dict[str, dict[str, Any]] = {}
    discarded: list[dict[str, Any]] = []
    for candidate in tool_input.candidates:
        item = dict(candidate)
        dedupe_key = str(item.get("dedupeKey") or "").strip()
        if not dedupe_key:
            discarded.append({**item, "discardReason": "missing_dedupe_key"})
            continue
        current_score = float(item.get("scoreOverall") or item.get("confidence") or 0.0)
        previous = kept.get(dedupe_key)
        previous_score = float((previous or {}).get("scoreOverall") or (previous or {}).get("confidence") or 0.0)
        if previous is None or current_score > previous_score:
            if previous is not None:
                discarded.append({**previous, "discardReason": "duplicate_lower_score"})
            kept[dedupe_key] = item
        else:
            discarded.append({**item, "discardReason": "duplicate_lower_score"})
    return DedupeCardCandidatesOutput(
        deduplicated_candidates=list(kept.values()),
        discarded_candidates=discarded,
        dedupe_summary={
            "inputCount": len(tool_input.candidates),
            "keptCount": len(kept),
            "discardedCount": len(discarded),
        },
    )


def audit_card_source_quotes(tool_input: AuditCardSourceQuotesInput) -> AuditCardSourceQuotesOutput:
    chunk_by_id = {
        str(chunk.get("id") or chunk.get("chunkId") or "").strip(): chunk
        for chunk in tool_input.chunks
        if str(chunk.get("id") or chunk.get("chunkId") or "").strip()
    }
    passed: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    for candidate in tool_input.candidates:
        item = dict(candidate)
        source_quote = str(item.get("sourceQuote") or "").strip()
        source_chunk_ids = [chunk_id for chunk_id in item.get("sourceChunkIds") or [] if isinstance(chunk_id, str)]
        matched = False
        if source_quote and source_chunk_ids:
            normalized_quote = _normalize_text(source_quote)
            for chunk_id in source_chunk_ids:
                chunk = chunk_by_id.get(chunk_id)
                if normalized_quote and normalized_quote in _normalize_text(_chunk_content(chunk or {})):
                    matched = True
                    break
        if matched:
            passed.append(item)
        else:
            failed.append({**item, "errorCategory": "citation_invalid", "failureReason": "source_quote_not_found"})
    return AuditCardSourceQuotesOutput(
        passed_candidates=passed,
        failed_candidates=failed,
        audit_summary={
            "totalCandidates": len(tool_input.candidates),
            "validCandidates": len(passed),
            "rejectedCandidates": len(failed),
            "auditStatus": "clean" if not failed else "filtered",
        },
    )


def submit_card_candidates(tool_input: SubmitCardCandidatesInput) -> SubmitCardCandidatesOutput:
    response = tool_input.host_ref.persist_candidates(
        tool_input.run_id,
        tool_input.document_id,
        tool_input.candidates,
    )
    submitted_count = int(response.get("insertedCount") or response.get("createdCount") or len(tool_input.candidates))
    return SubmitCardCandidatesOutput(submitted_count=submitted_count, response=response)


TOOL_REGISTRY.register(
    ToolDefinition(
        tool_key="content_map",
        description="Map retrieved child chunks into card-worthy concepts.",
        input_schema=ContentMapInput,
        output_schema=ContentMapOutput,
        handler=content_map,
        allowed_callers=CARD_ALLOWED_CALLERS,
    )
)
TOOL_REGISTRY.register(
    ToolDefinition(
        tool_key="generate_card_candidates",
        description="Generate grounded card candidates from child evidence chunks.",
        input_schema=GenerateCardCandidatesInput,
        output_schema=GenerateCardCandidatesOutput,
        handler=generate_card_candidates,
        error_categories=("invalid_json", "provider_timeout", "provider_rate_limited"),
        retryable=True,
        allowed_callers=CARD_ALLOWED_CALLERS,
    )
)
TOOL_REGISTRY.register(
    ToolDefinition(
        tool_key="critique_card_candidates",
        description="Score candidate cards for grounding and study quality.",
        input_schema=CritiqueCardCandidatesInput,
        output_schema=CritiqueCardCandidatesOutput,
        handler=critique_card_candidates,
        allowed_callers=CARD_ALLOWED_CALLERS,
    )
)
TOOL_REGISTRY.register(
    ToolDefinition(
        tool_key="dedupe_card_candidates",
        description="Remove duplicate card candidates while preserving the strongest version.",
        input_schema=DedupeCardCandidatesInput,
        output_schema=DedupeCardCandidatesOutput,
        handler=dedupe_card_candidates,
        allowed_callers=CARD_ALLOWED_CALLERS,
    )
)
TOOL_REGISTRY.register(
    ToolDefinition(
        tool_key="audit_card_source_quotes",
        description="Validate each card source quote against the retrieved child evidence chunks.",
        input_schema=AuditCardSourceQuotesInput,
        output_schema=AuditCardSourceQuotesOutput,
        handler=audit_card_source_quotes,
        error_categories=("citation_invalid",),
        allowed_callers=CARD_ALLOWED_CALLERS,
    )
)
TOOL_REGISTRY.register(
    ToolDefinition(
        tool_key="submit_card_candidates",
        description="Submit validated card candidates through the host gateway.",
        input_schema=SubmitCardCandidatesInput,
        output_schema=SubmitCardCandidatesOutput,
        handler=submit_card_candidates,
        side_effect="candidate_only",
        allowed_callers=CARD_ALLOWED_CALLERS,
    )
)
