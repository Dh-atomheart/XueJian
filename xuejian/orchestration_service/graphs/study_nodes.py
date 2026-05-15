from __future__ import annotations

from typing import Any

from orchestration_service.tools import TOOL_REGISTRY

from .artifact_store import persist_graph_artifacts
from .study_events import (
    build_learning_advice_artifact,
    build_quality_envelope,
    build_schedule_write_artifact,
    emit_event,
    save_checkpoint,
)
from .study_state import GRAPH_VERSION, GRAPH_VERSION_V2, RUNTIME, StudyGraphState


def _host(state: StudyGraphState) -> Any:
    return state["host_ref"]


def _run_id(state: StudyGraphState) -> str:
    return str(state.get("run_id") or "")


def _string_list(values: object) -> list[str]:
    if not isinstance(values, list):
        return []
    return [item for item in values if isinstance(item, str) and item]


def _merge_review_summaries(summaries: list[dict[str, Any]]) -> dict[str, Any]:
    merged: dict[str, Any] = {
        "totalCards": 0,
        "stateCounts": {},
        "lowRetrievabilityCards": [],
        "highDifficultyCards": [],
        "recentReviews": {"total": 0, "ratings": {}},
        "topicSummary": [],
        "documentIds": [],
    }
    topic_by_key: dict[str, dict[str, Any]] = {}
    state_counts: dict[str, int] = {}
    ratings: dict[str, int] = {}
    document_ids: list[str] = []

    for summary in summaries:
        merged["totalCards"] += int(summary.get("totalCards") or 0)
        for key, count in (summary.get("stateCounts") or {}).items():
            state_counts[str(key)] = state_counts.get(str(key), 0) + int(count or 0)
        merged["lowRetrievabilityCards"].extend(summary.get("lowRetrievabilityCards") or [])
        merged["highDifficultyCards"].extend(summary.get("highDifficultyCards") or [])
        recent = summary.get("recentReviews") or {}
        merged["recentReviews"]["total"] += int(recent.get("total") or 0)
        for key, count in (recent.get("ratings") or {}).items():
            ratings[str(key)] = ratings.get(str(key), 0) + int(count or 0)
        for doc_id in summary.get("documentIds") or []:
            if isinstance(doc_id, str) and doc_id and doc_id not in document_ids:
                document_ids.append(doc_id)
        for topic in summary.get("topicSummary") or []:
            topic_name = str(topic.get("topic") or "untagged")
            current = topic_by_key.setdefault(
                topic_name,
                {
                    "topic": topic_name,
                    "cardCount": 0,
                    "lowRetrievabilityCount": 0,
                    "highDifficultyCount": 0,
                    "recentFailureCount": 0,
                    "documentIds": [],
                    "exampleCardIds": [],
                },
            )
            current["cardCount"] += int(topic.get("cardCount") or 0)
            current["lowRetrievabilityCount"] += int(topic.get("lowRetrievabilityCount") or 0)
            current["highDifficultyCount"] += int(topic.get("highDifficultyCount") or 0)
            current["recentFailureCount"] += int(topic.get("recentFailureCount") or 0)
            for doc_id in topic.get("documentIds") or []:
                if isinstance(doc_id, str) and doc_id and doc_id not in current["documentIds"]:
                    current["documentIds"].append(doc_id)
            for card_id in topic.get("exampleCardIds") or []:
                if isinstance(card_id, str) and card_id and card_id not in current["exampleCardIds"]:
                    current["exampleCardIds"].append(card_id)

    merged["stateCounts"] = state_counts
    merged["recentReviews"]["ratings"] = ratings
    merged["documentIds"] = document_ids
    merged["topicSummary"] = list(topic_by_key.values())
    return merged


def load_review_summary(state: StudyGraphState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    supplied_summary = state.get("review_summary")
    if isinstance(supplied_summary, dict) and supplied_summary:
        review_summary = supplied_summary
    else:
        summaries: list[dict[str, Any]] = []
        document_ids = _string_list(state.get("document_ids") or [])
        if document_ids:
            for document_id in document_ids:
                summaries.append(host.get_study_review_summary(document_id=document_id, limit=200))
        else:
            summaries.append(host.get_study_review_summary(document_id=None, limit=200))
        review_summary = _merge_review_summaries([summary for summary in summaries if isinstance(summary, dict)])

    emit_event(
        host,
        run_id,
        "running",
        "StudyGraph loaded review summary",
        progress=0.2,
        payload={
            "runtime": RUNTIME,
            "graphVersion": GRAPH_VERSION,
            "totalCards": int(review_summary.get("totalCards") or 0),
        },
    )
    return {"review_summary": review_summary}


def detect_weak_topics(state: StudyGraphState) -> dict[str, Any]:
    review_summary = state.get("review_summary") or {}
    max_topics = int(state.get("max_weak_topics") or 5)
    weak_topics: list[dict[str, Any]] = []
    for topic in review_summary.get("topicSummary") or []:
        card_count = int(topic.get("cardCount") or 0)
        low_retrievability = int(topic.get("lowRetrievabilityCount") or 0)
        high_difficulty = int(topic.get("highDifficultyCount") or 0)
        recent_failures = int(topic.get("recentFailureCount") or 0)
        weakness_score = (low_retrievability * 0.45) + (high_difficulty * 0.35) + (recent_failures * 0.2)
        if weakness_score <= 0 and card_count > 0:
            continue
        confidence = 0.45
        if card_count >= 3:
            confidence += 0.15
        if recent_failures:
            confidence += 0.15
        if low_retrievability or high_difficulty:
            confidence += 0.15
        weak_topics.append(
            {
                "topic": str(topic.get("topic") or "untagged"),
                "evidenceType": "review_summary",
                "confidence": round(min(confidence, 0.9), 3),
                "riskLevel": "medium" if recent_failures or weakness_score >= 2 else "low",
                "weaknessScore": round(weakness_score, 3),
                "cardCount": card_count,
                "lowRetrievabilityCount": low_retrievability,
                "highDifficultyCount": high_difficulty,
                "recentFailureCount": recent_failures,
                "documentIds": _string_list(topic.get("documentIds") or []),
                "exampleCardIds": _string_list(topic.get("exampleCardIds") or [])[:5],
            }
        )
    weak_topics.sort(key=lambda item: (float(item["weaknessScore"]), float(item["confidence"])), reverse=True)
    return {"weak_topics": weak_topics[:max_topics]}


def suggest_card_gaps(state: StudyGraphState) -> dict[str, Any]:
    max_suggestions = int(state.get("max_card_gap_suggestions") or 5)
    suggestions: list[dict[str, Any]] = []
    for index, topic in enumerate(state.get("weak_topics") or []):
        document_ids = topic.get("documentIds") or state.get("document_ids") or []
        confidence = float(topic.get("confidence") or 0.0)
        suggestions.append(
            {
                "suggestionId": f"card-gap-{index + 1}",
                "topic": topic.get("topic"),
                "evidenceType": "review_summary",
                "confidence": round(confidence, 3),
                "riskLevel": topic.get("riskLevel") or "low",
                "reason": "weak_topic_detected",
                "exampleCardIds": topic.get("exampleCardIds") or [],
                "cardGraphInput": {
                    "documentIds": document_ids,
                    "sourceChunkIds": [],
                    "evidenceArtifactRefs": [],
                    "cardCountHint": 2 if confidence >= 0.7 else 1,
                    "difficulty": "medium",
                    "writeMode": "candidate",
                },
            }
        )
    return {"card_gap_suggestions": suggestions[:max_suggestions]}


def build_learning_advice(state: StudyGraphState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    review_summary = state.get("review_summary") or {}
    weak_topics = state.get("weak_topics") or []
    card_gap_suggestions = state.get("card_gap_suggestions") or []
    total_cards = int(review_summary.get("totalCards") or 0)
    error_category = "insufficient_review_data" if total_cards <= 0 else None
    quality_envelope = build_quality_envelope(
        total_cards=total_cards,
        weak_topic_count=len(weak_topics),
        suggestion_count=len(card_gap_suggestions),
        error_category=error_category,
    )
    artifact_ref, artifacts = build_learning_advice_artifact(
        run_id=run_id,
        review_summary=review_summary,
        weak_topics=weak_topics,
        card_gap_suggestions=card_gap_suggestions,
        quality_envelope=quality_envelope,
        error_category=error_category,
    )
    suggested_refs = [
        f"study-graph://runs/{run_id}/card_gap/{suggestion.get('suggestionId')}"
        for suggestion in card_gap_suggestions
    ]
    status = "partial" if error_category else "completed"
    result = {
        "status": status,
        "runtime": RUNTIME,
        "graphVersion": GRAPH_VERSION,
        "fallbackUsed": False,
        "weakTopics": weak_topics,
        "cardGapSuggestions": card_gap_suggestions,
        "suggestedCardGapRefs": suggested_refs,
        "learningAdviceArtifactRef": artifact_ref,
        "qualityEnvelope": quality_envelope,
        "errorCategory": error_category,
        "artifacts": artifacts,
    }
    artifact_store_ok, artifact_store_error = persist_graph_artifacts(host, run_id, artifacts)
    if not artifact_store_ok:
        error_category = str(error_category or artifact_store_error or "artifact_write_failed")
        quality_envelope["blockingReasons"] = list(
            dict.fromkeys([*(quality_envelope.get("blockingReasons") or []), "artifact_write_failed"])
        )
        result["qualityEnvelope"] = quality_envelope
        result["errorCategory"] = error_category
    save_checkpoint(host, run_id, "learning_advice", result)
    emit_event(
        host,
        run_id,
        "completed",
        "StudyGraph completed",
        progress=1.0,
        payload={
            "runtime": RUNTIME,
            "graphVersion": GRAPH_VERSION,
            "status": status,
            "weakTopicCount": len(weak_topics),
            "cardGapSuggestionCount": len(card_gap_suggestions),
            "errorCategory": error_category,
        },
    )
    return {
        "learning_advice_artifact_ref": artifact_ref,
        "suggested_card_gap_refs": suggested_refs,
        "quality_envelope": quality_envelope,
        "artifacts": artifacts,
        "error_category": error_category,
        "result": result,
    }


def _v2_enabled(state: StudyGraphState) -> bool:
    return bool(state.get("enable_schedule_write"))


def _graph_version(state: StudyGraphState) -> str:
    return GRAPH_VERSION_V2 if _v2_enabled(state) else GRAPH_VERSION


def _default_idempotency_key(state: StudyGraphState) -> str:
    run_id = _run_id(state)
    topic_part = "-".join(
        str(topic.get("topic") or "topic").strip().lower().replace(" ", "-")
        for topic in (state.get("weak_topics") or [])[:3]
    )
    return f"study-schedule:{run_id}:{topic_part or 'review'}"


def _default_rollback_ref(state: StudyGraphState, artifact_ref: str | None = None) -> str:
    run_id = _run_id(state)
    suffix = artifact_ref or f"study-graph://runs/{run_id}/study_schedule_write"
    return f"rollback:{run_id}:{suffix}"


def _schedule_quality(
    base_envelope: dict[str, Any],
    blocking_reasons: list[str],
) -> dict[str, Any]:
    envelope = dict(base_envelope or {})
    existing = envelope.get("blockingReasons") if isinstance(envelope.get("blockingReasons"), list) else []
    reasons = list(dict.fromkeys([*existing, *blocking_reasons]))
    envelope["blockingReasons"] = reasons
    if reasons:
        envelope["reviewRequired"] = True
        if envelope.get("riskLevel") == "low":
            envelope["riskLevel"] = "medium"
        envelope["confidence"] = min(float(envelope.get("confidence") or 0.0), 0.45)
    return envelope


def plan_review_candidates(state: StudyGraphState) -> dict[str, Any]:
    max_candidates = int(state.get("max_review_candidates") or 10)
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for topic in state.get("weak_topics") or []:
        confidence = float(topic.get("confidence") or 0.5)
        if confidence >= 0.8:
            interval_days = 7
            reason = "high_confidence_grounded_candidate"
        elif confidence >= 0.5:
            interval_days = 3
            reason = "medium_confidence_candidate"
        else:
            interval_days = 1
            reason = "low_confidence_needs_fast_followup"
        for card_id in _string_list(topic.get("exampleCardIds") or []):
            if card_id in seen:
                continue
            seen.add(card_id)
            candidates.append(
                {
                    "cardId": card_id,
                    "suggestedIntervalDays": interval_days,
                    "reason": reason,
                    "topic": topic.get("topic"),
                    "confidence": round(confidence, 3),
                }
            )
            if len(candidates) >= max_candidates:
                break
        if len(candidates) >= max_candidates:
            break
    return {"review_candidates": candidates}


def quality_gate_schedule_write(state: StudyGraphState) -> dict[str, Any]:
    reasons: list[str] = []
    dry_run = bool(state.get("dry_run", True))
    write_target = str(state.get("write_target") or "review_candidates")
    quality = state.get("quality_envelope") or {}
    candidates = state.get("review_candidates") or []

    if not _v2_enabled(state):
        reasons.append("schedule_write_disabled")
    if write_target != "review_candidates":
        reasons.append("study_schedule_write_failed")
    if state.get("error_category") == "insufficient_review_data":
        reasons.append("insufficient_review_data")
    if quality.get("riskLevel") == "high" or quality.get("auditStatus") == "failed":
        reasons.append("quality_gate_failed")
    if not candidates:
        reasons.append("no_review_candidates")
    if not dry_run:
        if not str(state.get("idempotency_key") or "").strip():
            reasons.append("idempotency_key_missing")
        if not str(state.get("dry_run_ref") or "").strip():
            reasons.append("dry_run_ref_missing")
        if not str(state.get("rollback_ref") or "").strip():
            reasons.append("rollback_ref_missing")

    reasons = list(dict.fromkeys(reasons))
    write_state = "dry_run_ready" if dry_run and not reasons else "write_ready"
    if reasons:
        write_state = "write_blocked"
    return {
        "schedule_write_blocking_reasons": reasons,
        "schedule_write_state": write_state,
    }


def submit_schedule_write(state: StudyGraphState) -> dict[str, Any]:
    reasons = state.get("schedule_write_blocking_reasons") or []
    run_id = _run_id(state)
    dry_run = bool(state.get("dry_run", True))
    idempotency_key = str(state.get("idempotency_key") or "").strip() or _default_idempotency_key(state)
    rollback_ref = str(state.get("rollback_ref") or "").strip() or _default_rollback_ref(state)
    dry_run_ref = str(state.get("dry_run_ref") or "").strip() or None

    if reasons:
        return {
            "dry_run_result": {},
            "created_review_candidate_ids": [],
        }

    try:
        output = TOOL_REGISTRY.invoke(
            "submit_review_candidates",
            {
                "run_id": run_id,
                "candidates": state.get("review_candidates") or [],
                "host_ref": _host(state),
                "dry_run": dry_run,
                "idempotency_key": idempotency_key,
                "dry_run_ref": dry_run_ref,
                "rollback_ref": rollback_ref,
            },
            caller=RUNTIME,
        )
    except Exception as exc:  # noqa: BLE001
        return {
            "dry_run_result": {},
            "created_review_candidate_ids": [],
            "schedule_write_blocking_reasons": ["host_write_failed"],
            "schedule_write_state": "write_failed",
            "error_category": "host_write_failed",
            "host_write_error": str(exc),
        }

    response = output.get("response") or {}
    error_category = output.get("error_category")
    if error_category:
        return {
            "dry_run_result": response,
            "created_review_candidate_ids": output.get("created_review_candidate_ids") or [],
            "schedule_write_blocking_reasons": [str(error_category)],
            "schedule_write_state": "write_failed",
            "error_category": str(error_category),
        }

    write_state = "dry_run_ready" if dry_run else "written"
    return {
        "dry_run_result": response if dry_run else {},
        "created_review_candidate_ids": output.get("created_review_candidate_ids") or [],
        "dry_run_ref": output.get("dry_run_ref") or dry_run_ref,
        "rollback_ref": output.get("rollback_ref") or rollback_ref,
        "idempotency_key": idempotency_key,
        "schedule_write_state": write_state,
    }


def finalize_schedule_write(state: StudyGraphState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    dry_run = bool(state.get("dry_run", True))
    blocking_reasons = state.get("schedule_write_blocking_reasons") or []
    schedule_error = state.get("error_category") if blocking_reasons else None
    if blocking_reasons and schedule_error in {None, "insufficient_review_data"}:
        schedule_error = "study_schedule_write_failed"
    quality_envelope = _schedule_quality(state.get("quality_envelope") or {}, blocking_reasons)
    write_state = str(state.get("schedule_write_state") or ("write_blocked" if blocking_reasons else "written"))
    artifact_ref, write_artifacts = build_schedule_write_artifact(
        run_id=run_id,
        dry_run=dry_run,
        idempotency_key=state.get("idempotency_key") or (_default_idempotency_key(state) if dry_run else None),
        dry_run_ref=state.get("dry_run_ref"),
        candidate_count=len(state.get("review_candidates") or []),
        created_review_candidate_ids=state.get("created_review_candidate_ids") or [],
        rollback_ref=state.get("rollback_ref") or (_default_rollback_ref(state) if dry_run else None),
        quality_envelope=quality_envelope,
        error_category=schedule_error,
        write_state=write_state,
        graph_version=GRAPH_VERSION_V2,
        response=state.get("dry_run_result") or {},
    )
    artifacts = dict(state.get("artifacts") or {})
    artifacts.update(write_artifacts)
    artifact_store_ok, artifact_store_error = persist_graph_artifacts(host, run_id, write_artifacts)

    result = dict(state.get("result") or {})
    if not artifact_store_ok:
        blocking_reasons = list(dict.fromkeys([*blocking_reasons, "artifact_write_failed"]))
        schedule_error = str(schedule_error or artifact_store_error or "artifact_write_failed")
        quality_envelope = _schedule_quality(quality_envelope, ["artifact_write_failed"])
    result.update(
        {
            "status": "partial" if blocking_reasons else result.get("status", "completed"),
            "runtime": RUNTIME,
            "graphVersion": GRAPH_VERSION_V2,
            "fallbackUsed": False,
            "studyScheduleWriteArtifactRef": artifact_ref,
            "dryRunResult": state.get("dry_run_result") or {},
            "createdReviewCandidateIds": state.get("created_review_candidate_ids") or [],
            "rollbackRef": state.get("rollback_ref") or (_default_rollback_ref(state) if dry_run else None),
            "qualityEnvelope": quality_envelope,
            "errorCategory": schedule_error,
            "artifacts": artifacts,
        }
    )
    save_checkpoint(host, run_id, "study_schedule_write", result)
    emit_event(
        host,
        run_id,
        "completed" if not blocking_reasons else "failed",
        "StudyGraph schedule write finalized",
        progress=1.0,
        payload={
            "runtime": RUNTIME,
            "graphVersion": GRAPH_VERSION_V2,
            "status": result["status"],
            "writeState": write_state,
            "errorCategory": schedule_error,
            "blockingReasons": blocking_reasons,
        },
    )
    return {
        "schedule_write_artifact_ref": artifact_ref,
        "quality_envelope": quality_envelope,
        "artifacts": artifacts,
        "error_category": schedule_error,
        "result": result,
    }
