from __future__ import annotations

from typing import Any

from .study_state import GRAPH_VERSION, RUNTIME


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
                "checkpointRef": "study_graph",
                "stepKey": step_key,
                "payload": payload,
            },
        )
    except Exception:
        return


def build_quality_envelope(
    *,
    total_cards: int,
    weak_topic_count: int,
    suggestion_count: int,
    error_category: str | None,
) -> dict[str, Any]:
    blocking_reasons: list[str] = []
    risk_level = "low"
    confidence = 0.78
    review_required = False

    if total_cards <= 0:
        blocking_reasons.append("insufficient_review_data")
        risk_level = "medium"
        confidence = 0.35
        review_required = True
    elif weak_topic_count == 0:
        confidence = 0.68

    if error_category:
        blocking_reasons.append(error_category)
        risk_level = "medium"
        confidence = min(confidence, 0.35)
        review_required = True

    return {
        "groundingStatus": "not_applicable",
        "auditStatus": "not_applicable",
        "confidence": round(confidence, 3),
        "riskLevel": risk_level,
        "reviewRequired": review_required,
        "blockingReasons": list(dict.fromkeys(blocking_reasons)),
    }


def build_learning_advice_artifact(
    *,
    run_id: str,
    review_summary: dict[str, Any],
    weak_topics: list[dict[str, Any]],
    card_gap_suggestions: list[dict[str, Any]],
    quality_envelope: dict[str, Any],
    error_category: str | None,
) -> tuple[str | None, dict[str, Any]]:
    if not run_id:
        return None, {}
    ref = f"study-graph://runs/{run_id}/learning_advice"
    topic_labels = [str(topic.get("topic") or "") for topic in weak_topics[:3]]
    summary = "No weak topics detected"
    if topic_labels:
        summary = "Focus on " + ", ".join(label for label in topic_labels if label)
    elif int(review_summary.get("totalCards") or 0) <= 0:
        summary = "Insufficient review data for diagnosis"

    artifact = {
        "artifactId": ref,
        "artifactType": "learning_advice",
        "schemaVersion": 1,
        "summary": summary,
        "sourceRefs": [],
        "qualityEnvelope": dict(quality_envelope),
        "errorCategory": error_category,
        "createdBy": RUNTIME,
        "runtime": RUNTIME,
        "graphVersion": GRAPH_VERSION,
        "weakTopics": weak_topics,
        "cardGapSuggestions": card_gap_suggestions,
        "basis": {
            "evidenceType": "review_summary",
            "totalCards": int(review_summary.get("totalCards") or 0),
            "recentReviewCount": int((review_summary.get("recentReviews") or {}).get("total") or 0),
        },
    }
    return ref, {ref: artifact}


def build_schedule_write_artifact(
    *,
    run_id: str,
    dry_run: bool,
    idempotency_key: str | None,
    dry_run_ref: str | None,
    candidate_count: int,
    created_review_candidate_ids: list[str],
    rollback_ref: str | None,
    quality_envelope: dict[str, Any],
    error_category: str | None,
    write_state: str,
    graph_version: str,
    response: dict[str, Any] | None = None,
) -> tuple[str | None, dict[str, Any]]:
    if not run_id:
        return None, {}
    ref = f"study-graph://runs/{run_id}/study_schedule_write"
    artifact = {
        "artifactId": ref,
        "artifactType": "study_schedule_write",
        "schemaVersion": 1,
        "dryRun": dry_run,
        "idempotencyKey": idempotency_key,
        "dryRunRef": dry_run_ref,
        "candidateCount": candidate_count,
        "createdReviewCandidateIds": created_review_candidate_ids,
        "rollbackRef": rollback_ref,
        "qualityEnvelope": dict(quality_envelope),
        "errorCategory": error_category,
        "writeState": write_state,
        "createdBy": RUNTIME,
        "runtime": RUNTIME,
        "graphVersion": graph_version,
        "response": response or {},
    }
    return ref, {ref: artifact}
