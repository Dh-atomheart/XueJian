from __future__ import annotations

from typing import Any

from .supervisor_state import GRAPH_VERSION, RUNTIME


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
        emit(run_id, event_type, message=message, progress=progress, payload=_sanitize_payload(payload or {}))
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
                "checkpointRef": "supervisor_graph",
                "stepKey": step_key,
                "payload": _sanitize_payload(payload),
            },
        )
    except Exception:
        return


def _truncate_text(value: str, limit: int = 240) -> str:
    text = value.strip()
    return text if len(text) <= limit else text[: limit - 1] + "..."


def _sanitize_payload(value: Any) -> Any:
    if isinstance(value, str):
        return _truncate_text(value)
    if isinstance(value, list):
        return [_sanitize_payload(item) for item in value[:20]]
    if not isinstance(value, dict):
        return value

    blocked_keys = {"prompt", "messages", "chainOfThought", "chain_of_thought", "apiKey", "api_key"}
    sanitized: dict[str, Any] = {}
    for key, item in value.items():
        if key in blocked_keys:
            continue
        sanitized[key] = _sanitize_payload(item)
    return sanitized


def build_quality_envelope(
    *,
    error_category: str | None,
    subgraph_results: list[dict[str, Any]],
    policy_blocked: bool = False,
) -> dict[str, Any]:
    blocking_reasons: list[str] = []
    risk_level = "low"
    confidence = 0.78
    review_required = False

    for result in subgraph_results:
        envelope = result.get("qualityEnvelope") if isinstance(result, dict) else None
        if not isinstance(envelope, dict):
            blocking_reasons.append("quality_envelope_invalid")
            risk_level = "high"
            confidence = min(confidence, 0.2)
            review_required = True
            continue
        if envelope.get("riskLevel") == "high":
            blocking_reasons.extend(envelope.get("blockingReasons") or ["quality_gate_failed"])
            risk_level = "high"
            confidence = min(confidence, float(envelope.get("confidence") or 0.2))
            review_required = True
        elif envelope.get("riskLevel") == "medium" and risk_level == "low":
            risk_level = "medium"
            confidence = min(confidence, float(envelope.get("confidence") or 0.55))
            review_required = bool(envelope.get("reviewRequired", True))

    if error_category:
        blocking_reasons.append(error_category)
        if error_category in {"not_compound_task", "blocked_by_policy", "budget_exceeded"}:
            risk_level = "high"
        elif risk_level == "low":
            risk_level = "medium"
        confidence = min(confidence, 0.35)
        review_required = True
    if policy_blocked:
        blocking_reasons.append("blocked_by_policy")
        risk_level = "high"
        confidence = min(confidence, 0.25)
        review_required = True

    return {
        "groundingStatus": "not_applicable",
        "auditStatus": "not_applicable",
        "confidence": round(confidence, 3),
        "riskLevel": risk_level,
        "reviewRequired": review_required,
        "blockingReasons": list(dict.fromkeys(reason for reason in blocking_reasons if reason)),
    }


def build_trace_artifact(
    run_id: str,
    decision_records: list[dict[str, Any]],
    quality_envelope: dict[str, Any],
    *,
    error_category: str | None,
) -> dict[str, Any]:
    ref = f"supervisor://runs/{run_id}/trace"
    return {
        ref: {
            "artifactId": ref,
            "artifactType": "trace",
            "schemaVersion": 1,
            "summary": f"{len(decision_records)} supervisor decisions",
            "sourceRefs": [],
            "qualityEnvelope": dict(quality_envelope),
            "errorCategory": error_category,
            "createdBy": RUNTIME,
            "runtime": RUNTIME,
            "graphVersion": GRAPH_VERSION,
            "decisionRecords": decision_records,
        }
    }
