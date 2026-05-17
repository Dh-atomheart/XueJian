"""StudyGraph recommendation evaluation runner.

Runs the StudyGraph against a FakeHost with synthetic review summaries.
Checks weak topic detection, card gap suggestions, schedule write gates,
and dry-run artifact generation.
"""
from __future__ import annotations

import uuid
from typing import Any

from ..graphs.study_graph import StudyGraphRunner
from ..graphs.study_state import GRAPH_VERSION, GRAPH_VERSION_V2, RUNTIME
from .eval_base import EvalResult, EvalSuite


def _default_summary(total_cards: int = 4) -> dict[str, Any]:
    return {
        "totalCards": total_cards,
        "stateCounts": {"review": 2, "learning": 1, "new": 1},
        "lowRetrievabilityCards": [{"id": "card-1", "retrievability": 0.2}],
        "highDifficultyCards": [{"id": "card-2", "difficulty": 0.86}],
        "recentReviews": {"total": 3, "ratings": {"again": 1, "hard": 1, "good": 1}},
        "topicSummary": [
            {
                "topic": "retrieval practice",
                "cardCount": 3,
                "lowRetrievabilityCount": 1,
                "highDifficultyCount": 1,
                "recentFailureCount": 1,
                "documentIds": ["doc-1"],
                "exampleCardIds": ["card-1", "card-2"],
            },
            {
                "topic": "spacing",
                "cardCount": 1,
                "lowRetrievabilityCount": 0,
                "highDifficultyCount": 0,
                "recentFailureCount": 0,
                "documentIds": ["doc-1"],
                "exampleCardIds": ["card-3"],
            },
        ],
        "documentIds": ["doc-1"],
    }


class StudyGraphFakeHost:
    """Minimal host scaffold for StudyGraph eval."""

    def __init__(self, summary: dict[str, Any] | None = None):
        self.summary = summary if summary is not None else _default_summary()
        self.review_summary_calls: list[dict[str, Any]] = []
        self.submit_calls: list[dict[str, Any]] = []
        self.events: list[dict[str, Any]] = []
        self.checkpoints: list[dict[str, Any]] = []

    def get_study_review_summary(self, document_id: str | None = None, limit: int = 200) -> dict[str, Any]:
        self.review_summary_calls.append({"documentId": document_id, "limit": limit})
        return dict(self.summary)

    def submit_review_candidates(
        self,
        run_id: str,
        candidates: list[dict[str, Any]],
        *,
        dry_run: bool = True,
        idempotency_key: str | None = None,
        dry_run_ref: str | None = None,
        rollback_ref: str | None = None,
    ) -> dict[str, Any]:
        self.submit_calls.append(
            {
                "runId": run_id,
                "candidates": candidates,
                "dryRun": dry_run,
                "idempotencyKey": idempotency_key,
                "dryRunRef": dry_run_ref,
                "rollbackRef": rollback_ref,
            }
        )
        if dry_run:
            return {
                "acceptedCount": len(candidates),
                "rejectedCount": 0,
                "stored": False,
                "dryRunRef": "dry-run-1",
                "rollbackRef": "rollback-1",
                "createdReviewCandidateIds": [],
            }
        return {
            "acceptedCount": len(candidates),
            "rejectedCount": 0,
            "stored": True,
            "dryRunRef": dry_run_ref,
            "rollbackRef": rollback_ref,
            "createdReviewCandidateIds": ["review-candidate-1"],
        }

    def emit_workflow_event(self, run_id: str, event_type: str, message: str | None = None, progress: float | None = None, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        self.events.append({"runId": run_id, "eventType": event_type, "payload": payload})
        return {"stored": True}

    def save_checkpoint(self, run_id: str, checkpoint: dict[str, Any]) -> dict[str, Any]:
        self.checkpoints.append({"runId": run_id, "checkpoint": checkpoint})
        return {"stored": True}


def _run_case(host: StudyGraphFakeHost, **overrides: Any) -> dict[str, Any]:
    payload = {
        "document_ids": ["doc-1"],
        "card_group_ids": [],
        "review_summary": None,
        "max_weak_topics": 5,
        "max_card_gap_suggestions": 5,
    }
    payload.update(overrides)
    run_id = f"eval-studygraph-{uuid.uuid4().hex[:8]}"
    return StudyGraphRunner(host).run(run_id, **payload)


def run_weak_topic_detection_case() -> EvalResult:
    """Case studygraph-s1: weak topic detection from review summary."""
    host = StudyGraphFakeHost()
    result = _run_case(host)
    weak_topics = result.get("weakTopics", [])
    status = result.get("status")
    return EvalResult(
        case_id="studygraph-s1",
        suite="studygraph",
        runtime=RUNTIME,
        status=status or "unknown",
        quality_envelope=result.get("qualityEnvelope") or {},
        expected_behavior="weakTopics populated, highest weakness-score first",
        actual_behavior=f"weakTopics={len(weak_topics)}, status={status}",
        blocking_reasons=[],
        trace_ref=result.get("learningAdviceArtifactRef") or "",
        metadata={"weakTopicCount": len(weak_topics)},
    )


def run_card_gap_suggestion_case() -> EvalResult:
    """Case studygraph-s2: card gap suggestion links to CardGraph input."""
    host = StudyGraphFakeHost()
    result = _run_case(host)
    suggestions = result.get("cardGapSuggestions", [])
    all_have_input = (
        len(suggestions) > 0
        and all(
            isinstance(s.get("cardGraphInput"), dict)
            and "documentIds" in s["cardGraphInput"]
            and s["cardGraphInput"].get("writeMode") == "candidate"
            for s in suggestions
        )
    )
    return EvalResult(
        case_id="studygraph-s2",
        suite="studygraph",
        runtime=RUNTIME,
        status=result.get("status") or "unknown",
        quality_envelope=result.get("qualityEnvelope") or {},
        expected_behavior="every suggestion has cardGraphInput with documentIds and writeMode=candidate",
        actual_behavior=f"suggestions={len(suggestions)}, all_have_input={all_have_input}",
        blocking_reasons=[] if all_have_input else ["missing cardGraphInput"],
        trace_ref=result.get("learningAdviceArtifactRef") or "",
        metadata={"suggestionCount": len(suggestions), "allHaveInput": all_have_input},
    )


def run_schedule_write_blocked_without_refs_case() -> EvalResult:
    """Case studygraph-s3: V2 schedule write blocked without required refs."""
    host = StudyGraphFakeHost()
    result = _run_case(
        host,
        enable_schedule_write=True,
        dry_run=False,
        # intentionally omitting idempotency_key, dry_run_ref, rollback_ref
    )
    envelope = result.get("qualityEnvelope") or {}
    reasons = envelope.get("blockingReasons", [])
    status = result.get("status")
    return EvalResult(
        case_id="studygraph-s3",
        suite="studygraph",
        runtime=RUNTIME,
        status=status or "unknown",
        quality_envelope=envelope,
        expected_behavior="schedule write blocked: idempotency_key_missing, dry_run_ref_missing, rollback_ref_missing",
        actual_behavior=f"status={status}, blockingReasons={reasons}",
        blocking_reasons=[] if status == "partial" and "idempotency_key_missing" in reasons else ["expected schedule write blocked"],
        trace_ref=result.get("studyScheduleWriteArtifactRef") or "",
        metadata={"blockingReasons": reasons},
    )


def run_dry_run_produces_artifact_case() -> EvalResult:
    """Case studygraph-s4: V2 dry run produces schedule write artifact."""
    host = StudyGraphFakeHost()
    result = _run_case(host, enable_schedule_write=True, dry_run=True)
    status = result.get("status")
    artifact_ref = result.get("studyScheduleWriteArtifactRef")
    return EvalResult(
        case_id="studygraph-s4",
        suite="studygraph",
        runtime=RUNTIME,
        status=status or "unknown",
        quality_envelope=result.get("qualityEnvelope") or {},
        expected_behavior="completed, studyScheduleWriteArtifactRef present, writeState=dry_run_ready",
        actual_behavior=f"status={status}, artifactRef={artifact_ref}",
        blocking_reasons=[] if status == "completed" and artifact_ref else ["expected dry-run artifact"],
        trace_ref=artifact_ref or "",
    )


def run_insufficient_review_data_case() -> EvalResult:
    """Case studygraph-s5: insufficient review data returns partial."""
    host = StudyGraphFakeHost(
        {"totalCards": 0, "topicSummary": [], "recentReviews": {"total": 0, "ratings": {}}}
    )
    result = _run_case(host)
    status = result.get("status")
    error = result.get("errorCategory")
    suggestions = result.get("cardGapSuggestions", [])
    return EvalResult(
        case_id="studygraph-s5",
        suite="studygraph",
        runtime=RUNTIME,
        status=status or "unknown",
        quality_envelope=result.get("qualityEnvelope") or {},
        expected_behavior="partial, insufficient_review_data, no suggestions",
        actual_behavior=f"status={status}, error={error}, suggestions={len(suggestions)}",
        blocking_reasons=[] if status == "partial" and error == "insufficient_review_data" and not suggestions else ["expected insufficient review data"],
        trace_ref=result.get("learningAdviceArtifactRef") or "",
    )


def run_all_cases() -> EvalSuite:
    """Run all StudyGraph recommendation eval cases and return the suite."""
    suite = EvalSuite(
        name="studygraph-recommendation",
        runtime=RUNTIME,
        graph_version=GRAPH_VERSION,
    )
    suite.cases.append(run_weak_topic_detection_case())
    suite.cases.append(run_card_gap_suggestion_case())
    suite.cases.append(run_schedule_write_blocked_without_refs_case())
    suite.cases.append(run_dry_run_produces_artifact_case())
    suite.cases.append(run_insufficient_review_data_case())

    total = len(suite.cases)
    high_risk_writes = sum(
        1 for c in suite.cases
        if c.case_id == "studygraph-s3" and c.blocking_reasons
    )
    review_required = sum(
        1 for c in suite.cases
        if c.quality_envelope.get("reviewRequired")
    )
    suite.summary = {
        "caseCount": total,
        "blockingFailures": len(suite.blocking_failures()),
        "studygraph_high_risk_schedule_write_count": high_risk_writes,
        "study_advice_review_required_rate": round(review_required / total, 3) if total else 0.0,
    }
    return suite
