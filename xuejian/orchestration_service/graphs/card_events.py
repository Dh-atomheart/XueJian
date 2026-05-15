from __future__ import annotations

from typing import Any

from .card_state import GRAPH_VERSION, RUNTIME


def emit_event(
    host: Any,
    run_id: str,
    event_type: str,
    message: str,
    *,
    progress: float | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    if not run_id:
        return
    emit = getattr(host, "emit_workflow_event", None)
    if not callable(emit):
        return
    try:
        emit(run_id, event_type, message=message, progress=progress, payload=payload)
    except Exception:
        return


def save_checkpoint(host: Any, run_id: str, step_key: str, payload: dict[str, Any]) -> None:
    if not run_id:
        return
    save = getattr(host, "save_checkpoint", None)
    if not callable(save):
        return
    try:
        save(
            run_id,
            {
                "checkpointRef": "card_graph",
                "stepKey": step_key,
                "payload": payload,
            },
        )
    except Exception:
        return


def build_quality_envelope(
    *,
    write_mode: str,
    evidence_trusted: bool,
    candidate_count: int,
    failed_quote_count: int,
    discarded_count: int,
    created_count: int,
    error_category: str | None,
    blocking_reasons: list[str],
) -> dict[str, Any]:
    reasons = list(dict.fromkeys([reason for reason in blocking_reasons if reason]))
    if error_category:
        reasons.append(error_category)
    reasons = list(dict.fromkeys(reasons))

    audit_status = "passed"
    if failed_quote_count:
        audit_status = "failed"
    elif not candidate_count:
        audit_status = "not_applicable"

    risk_level = "low"
    review_required = False
    grounding_status = "grounded" if candidate_count else "not_applicable"
    confidence = 0.82 if candidate_count else 0.0

    if write_mode == "formal_card" and not evidence_trusted:
        reasons.append("evidence_not_trusted")
    if discarded_count:
        reasons.append("dedupe_required")
    if reasons or audit_status != "passed":
        risk_level = "high"
        review_required = True
        confidence = min(confidence, 0.35)
    if write_mode == "formal_card" and created_count == 0:
        risk_level = "high"
        review_required = True
    if failed_quote_count:
        grounding_status = "partially_grounded" if candidate_count else "ungrounded"

    return {
        "groundingStatus": grounding_status,
        "auditStatus": audit_status,
        "confidence": round(confidence, 3),
        "riskLevel": risk_level,
        "reviewRequired": review_required,
        "blockingReasons": list(dict.fromkeys(reasons)),
    }


def build_card_artifacts(
    run_id: str,
    candidates: list[dict[str, Any]],
    created_card_ids: list[str],
    quality_envelope: dict[str, Any],
    *,
    error_category: str | None = None,
) -> tuple[list[str], dict[str, Any]]:
    refs: list[str] = []
    artifacts: dict[str, Any] = {}
    for index, candidate in enumerate(candidates):
        ref = f"card-graph://runs/{run_id}/card_candidate/{index}"
        refs.append(ref)
        artifacts[ref] = {
            "artifactId": ref,
            "artifactType": "card_candidate",
            "schemaVersion": 1,
            "summary": str(candidate.get("front") or "")[:120],
            "sourceRefs": list(candidate.get("sourceChunkIds") or []),
            "qualityEnvelope": dict(quality_envelope),
            "errorCategory": error_category,
            "createdBy": RUNTIME,
        }
    if created_card_ids:
        ref = f"card-graph://runs/{run_id}/formal_card_write"
        refs.append(ref)
        artifacts[ref] = {
            "artifactId": ref,
            "artifactType": "formal_card_write",
            "schemaVersion": 1,
            "summary": f"created {len(created_card_ids)} cards",
            "sourceRefs": refs[:-1],
            "qualityEnvelope": dict(quality_envelope),
            "errorCategory": error_category,
            "createdBy": RUNTIME,
            "createdCardIds": created_card_ids,
        }
    return refs, artifacts
