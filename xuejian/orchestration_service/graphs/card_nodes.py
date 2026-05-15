from __future__ import annotations

from typing import Any

from ..tools.card_tools import TOOL_REGISTRY
from .artifact_store import persist_graph_artifacts
from .card_events import build_card_artifacts, build_quality_envelope, emit_event, save_checkpoint
from .card_state import GRAPH_VERSION, RUNTIME, CardGraphState


def _host(state: CardGraphState) -> Any:
    return state["host_ref"]


def _run_id(state: CardGraphState) -> str:
    return str(state.get("run_id") or "")


def _document_ids(state: CardGraphState) -> list[str]:
    return [doc_id for doc_id in state.get("document_ids") or [] if isinstance(doc_id, str) and doc_id]


def _invoke_tool(tool_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    return TOOL_REGISTRY.invoke(tool_key, payload, caller=RUNTIME)


def _chunk_id(chunk: dict[str, Any]) -> str:
    return str(chunk.get("id") or chunk.get("chunkId") or "").strip()


def _quality_reasons_for_candidate(candidate: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    if not str(candidate.get("sourceQuote") or "").strip():
        reasons.append("source_quote_invalid")
    if not candidate.get("sourceChunkIds"):
        reasons.append("missing_source_refs")
    if not str(candidate.get("dedupeKey") or "").strip():
        reasons.append("idempotency_key_missing")
    score = float(candidate.get("scoreOverall") or candidate.get("confidence") or 0.0)
    if score < 0.65:
        reasons.append("quality_gate_failed")
    return reasons


def _candidate_passes_quality_gate(candidate: dict[str, Any]) -> bool:
    return not _quality_reasons_for_candidate(candidate)


def _discard_reasons_for_candidate(candidate: dict[str, Any]) -> list[str]:
    discard_reason = str(candidate.get("discardReason") or "")
    if discard_reason == "missing_dedupe_key":
        return ["idempotency_key_missing"]
    if discard_reason:
        return ["dedupe_required"]
    return []


def _evidence_is_trusted(state: CardGraphState, chunks: list[dict[str, Any]]) -> bool:
    if not chunks:
        return False
    artifacts = state.get("evidence_artifacts") or []
    if artifacts:
        for artifact in artifacts:
            if not isinstance(artifact, dict):
                return False
            if artifact.get("artifactType") != "evidence":
                return False
            envelope = artifact.get("qualityEnvelope") or {}
            if envelope.get("riskLevel") == "high":
                return False
            if not artifact.get("sourceRefs") and not artifact.get("sourceChunkIds"):
                return False
        return True
    return bool(state.get("evidence_artifact_refs") and (state.get("source_chunk_ids") or chunks))


def load_source_evidence(state: CardGraphState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    source_chunk_ids = {chunk_id for chunk_id in state.get("source_chunk_ids") or [] if isinstance(chunk_id, str)}
    chunks: list[dict[str, Any]] = []
    seen: set[str] = set()
    for document_id in _document_ids(state):
        for chunk in getattr(host, "list_chunks")(document_id) or []:
            if not isinstance(chunk, dict):
                continue
            chunk_id = _chunk_id(chunk)
            if not chunk_id or chunk_id in seen:
                continue
            if source_chunk_ids and chunk_id not in source_chunk_ids:
                continue
            if chunk.get("chunkKind") not in {None, "child"}:
                continue
            content = str(chunk.get("content") or chunk.get("text") or chunk.get("snippet") or "").strip()
            if not content:
                continue
            seen.add(chunk_id)
            chunks.append(chunk)

    evidence_trusted = _evidence_is_trusted(state, chunks)
    emit_event(
        host,
        run_id,
        "running",
        "CardGraph loaded source evidence",
        progress=0.12,
        payload={"runtime": RUNTIME, "graphVersion": GRAPH_VERSION, "chunkCount": len(chunks), "evidenceTrusted": evidence_trusted},
    )
    return {"chunks": chunks, "evidence_trusted": evidence_trusted}


def build_coverage_plan(state: CardGraphState) -> dict[str, Any]:
    document_ids = _document_ids(state)
    document_id = document_ids[0] if document_ids else ""
    result = _invoke_tool("content_map", {"document_id": document_id, "chunks": state.get("chunks") or []})
    return {"concepts": result.get("concepts") or []}


def generate_candidates(state: CardGraphState) -> dict[str, Any]:
    document_ids = _document_ids(state)
    document_id = document_ids[0] if document_ids else ""
    result = _invoke_tool(
        "generate_card_candidates",
        {
            "run_id": _run_id(state),
            "document_id": document_id,
            "concepts": state.get("concepts") or [],
            "chunks": state.get("chunks") or [],
            "density": str(state.get("difficulty") or "medium"),
            "provider_config_id": str(state.get("provider_config_id") or ""),
            "host_ref": _host(state),
        },
    )
    candidates = list(result.get("candidates") or [])
    hint = int(state.get("card_count_hint") or 0)
    if hint > 0:
        candidates = candidates[:hint]
    return {"generated_candidates": candidates}


def audit_source_quotes(state: CardGraphState) -> dict[str, Any]:
    result = _invoke_tool(
        "audit_card_source_quotes",
        {"candidates": state.get("generated_candidates") or [], "chunks": state.get("chunks") or []},
    )
    return {
        "audit_passed_candidates": result.get("passed_candidates") or [],
        "audit_failed_candidates": result.get("failed_candidates") or [],
    }


def critique_candidates(state: CardGraphState) -> dict[str, Any]:
    result = _invoke_tool("critique_card_candidates", {"candidates": state.get("audit_passed_candidates") or []})
    return {"critiqued_candidates": result.get("critiqued_candidates") or []}


def dedupe_candidates(state: CardGraphState) -> dict[str, Any]:
    result = _invoke_tool("dedupe_card_candidates", {"candidates": state.get("critiqued_candidates") or []})
    return {
        "deduplicated_candidates": result.get("deduplicated_candidates") or [],
        "discarded_candidates": result.get("discarded_candidates") or [],
    }


def submit_or_create_cards(state: CardGraphState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    document_ids = _document_ids(state)
    document_id = document_ids[0] if document_ids else ""
    write_mode = str(state.get("write_mode") or "candidate")
    candidates = [candidate for candidate in state.get("deduplicated_candidates") or [] if _candidate_passes_quality_gate(candidate)]
    blocking_reasons = [
        reason
        for candidate in state.get("deduplicated_candidates") or []
        for reason in _quality_reasons_for_candidate(candidate)
    ]

    if write_mode == "formal_card":
        if not state.get("evidence_trusted"):
            return {"write_response": {}, "created_card_ids": [], "error_category": "evidence_not_trusted"}
        discarded_reasons = [
            reason
            for discarded in state.get("discarded_candidates") or []
            for reason in _discard_reasons_for_candidate(discarded)
        ]
        if "idempotency_key_missing" in discarded_reasons:
            return {"write_response": {}, "created_card_ids": [], "error_category": "idempotency_key_missing"}
        if discarded_reasons:
            return {"write_response": {}, "created_card_ids": [], "error_category": "dedupe_required"}
        if not candidates:
            error = "source_quote_invalid" if state.get("audit_failed_candidates") else "quality_gate_failed"
            return {"write_response": {}, "created_card_ids": [], "error_category": error}
        if blocking_reasons or state.get("audit_failed_candidates"):
            return {
                "write_response": {},
                "created_card_ids": [],
                "error_category": "quality_gate_failed" if blocking_reasons else "source_quote_invalid",
            }
        try:
            response = host.persist_cards(run_id, document_id, candidates)
        except Exception:
            return {"write_response": {}, "created_card_ids": [], "error_category": "host_write_failed"}
        created_ids = [card_id for card_id in response.get("createdCardIds") or [] if isinstance(card_id, str)]
        created_count = int(response.get("createdCount") or 0)
        if int(response.get("skippedDuplicates") or 0):
            return {"write_response": response, "created_card_ids": created_ids, "error_category": "dedupe_required"}
        if int(response.get("discardedLowQuality") or 0):
            return {"write_response": response, "created_card_ids": created_ids, "error_category": "quality_gate_failed"}
        if created_count != len(created_ids):
            return {"write_response": response, "created_card_ids": created_ids, "error_category": "host_write_failed"}
        save_checkpoint(host, run_id, "formal_card_write", {"createdCardIds": created_ids, "response": response})
        return {"write_response": response, "created_card_ids": created_ids}

    result = _invoke_tool(
        "submit_card_candidates",
        {"run_id": run_id, "document_id": document_id, "candidates": candidates, "host_ref": host},
    )
    save_checkpoint(host, run_id, "candidate_write", {"submittedCount": result.get("submitted_count", 0)})
    return {"submitted_count": int(result.get("submitted_count") or 0), "write_response": result.get("response") or {}}


def finalize_result(state: CardGraphState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    write_mode = str(state.get("write_mode") or "candidate")
    candidates = state.get("deduplicated_candidates") or []
    failed_quote_count = len(state.get("audit_failed_candidates") or [])
    discarded_count = len(state.get("discarded_candidates") or [])
    created_card_ids = state.get("created_card_ids") or []
    error_category = state.get("error_category")
    blocking_reasons = [
        reason
        for candidate in candidates
        for reason in _quality_reasons_for_candidate(candidate)
    ]
    if failed_quote_count:
        blocking_reasons.append("source_quote_invalid")
    if discarded_count:
        discard_reasons = [
            reason
            for discarded in state.get("discarded_candidates") or []
            for reason in _discard_reasons_for_candidate(discarded)
        ]
        blocking_reasons.extend(discard_reasons or ["dedupe_required"])
    quality_envelope = build_quality_envelope(
        write_mode=write_mode,
        evidence_trusted=bool(state.get("evidence_trusted")),
        candidate_count=len(candidates),
        failed_quote_count=failed_quote_count,
        discarded_count=discarded_count,
        created_count=len(created_card_ids),
        error_category=error_category,
        blocking_reasons=blocking_reasons,
    )
    refs, artifacts = build_card_artifacts(run_id, candidates, created_card_ids, quality_envelope, error_category=error_category)
    status = "completed"
    if error_category:
        status = "partial" if candidates else "failed"
    result = {
        "runtime": RUNTIME,
        "graphVersion": GRAPH_VERSION,
        "fallbackUsed": False,
        "status": status,
        "submittedCount": int(state.get("submitted_count") or 0),
        "cardArtifactRefs": refs,
        "createdCardIds": created_card_ids,
        "qualityEnvelope": quality_envelope,
        "errorCategory": error_category,
        "candidates": candidates,
        "discardedCandidates": (state.get("discarded_candidates") or []) + (state.get("audit_failed_candidates") or []),
        "artifacts": artifacts,
        "writeResponse": state.get("write_response") or {},
    }
    artifact_store_ok, artifact_store_error = persist_graph_artifacts(host, run_id, artifacts)
    if not artifact_store_ok:
        error_category = str(error_category or artifact_store_error or "artifact_write_failed")
        quality_envelope["blockingReasons"] = list(
            dict.fromkeys([*(quality_envelope.get("blockingReasons") or []), "artifact_write_failed"])
        )
        result["qualityEnvelope"] = quality_envelope
        result["errorCategory"] = error_category
    emit_event(
        host,
        run_id,
        "completed",
        "CardGraph completed",
        progress=1.0,
        payload={
            "runtime": RUNTIME,
            "graphVersion": GRAPH_VERSION,
            "status": status,
            "candidateCount": len(candidates),
            "createdCardCount": len(created_card_ids),
            "errorCategory": error_category,
        },
    )
    return {"quality_envelope": quality_envelope, "card_artifact_refs": refs, "artifacts": artifacts, "result": result}
