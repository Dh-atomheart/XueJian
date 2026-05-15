import pytest

from orchestration_service.graphs.study_graph import StudyGraphRunner, build_study_graph
from orchestration_service.tools import study_tools


def _summary(total_cards=4):
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


class StudyGraphHost:
    def __init__(self, summary=None):
        self.summary = summary if summary is not None else _summary()
        self.review_summary_calls = []
        self.submit_calls = []
        self.events = []
        self.checkpoints = []

    def get_study_review_summary(self, document_id=None, limit=200):
        self.review_summary_calls.append({"documentId": document_id, "limit": limit})
        return dict(self.summary)

    def submit_review_candidates(
        self,
        run_id,
        candidates,
        *,
        dry_run=True,
        idempotency_key=None,
        dry_run_ref=None,
        rollback_ref=None,
    ):
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

    def emit_workflow_event(self, run_id, event_type, message=None, progress=None, payload=None):
        self.events.append({"runId": run_id, "eventType": event_type, "payload": payload})
        return {"stored": True}

    def save_checkpoint(self, run_id, checkpoint):
        self.checkpoints.append({"runId": run_id, "checkpoint": checkpoint})
        return {"stored": True}


def _run(host, **overrides):
    payload = {
        "document_ids": ["doc-1"],
        "card_group_ids": [],
        "review_summary": None,
        "max_weak_topics": 5,
        "max_card_gap_suggestions": 5,
    }
    payload.update(overrides)
    return StudyGraphRunner(host).run("run-study-1", **payload)


def test_study_graph_compiles():
    assert build_study_graph() is not None


def test_study_graph_outputs_learning_advice_from_review_summary():
    host = StudyGraphHost()

    result = _run(host)

    assert result["status"] == "completed"
    assert result["runtime"] == "langgraph_study"
    assert result["graphVersion"] == "study-graph-v1"
    assert result["learningAdviceArtifactRef"] == "study-graph://runs/run-study-1/learning_advice"
    assert result["qualityEnvelope"]["riskLevel"] == "low"
    assert result["weakTopics"][0]["topic"] == "retrieval practice"
    assert result["weakTopics"][0]["evidenceType"] == "review_summary"
    assert result["cardGapSuggestions"][0]["cardGraphInput"]["writeMode"] == "candidate"
    assert result["cardGapSuggestions"][0]["cardGraphInput"]["documentIds"] == ["doc-1"]
    assert result["learningAdviceArtifactRef"] in result["artifacts"]
    assert not host.submit_calls


def test_study_graph_prefers_supplied_review_summary():
    host = StudyGraphHost()

    result = _run(host, review_summary=_summary())

    assert result["status"] == "completed"
    assert host.review_summary_calls == []


def test_study_graph_handles_no_review_data_as_partial():
    host = StudyGraphHost({"totalCards": 0, "topicSummary": [], "recentReviews": {"total": 0, "ratings": {}}})

    result = _run(host)

    assert result["status"] == "partial"
    assert result["errorCategory"] == "insufficient_review_data"
    assert result["qualityEnvelope"]["riskLevel"] == "medium"
    assert result["qualityEnvelope"]["reviewRequired"] is True
    assert "insufficient_review_data" in result["qualityEnvelope"]["blockingReasons"]
    assert result["cardGapSuggestions"] == []


def test_study_graph_limits_weak_topics_and_card_gaps():
    summary = _summary()
    summary["topicSummary"].append(
        {
            "topic": "encoding",
            "cardCount": 4,
            "lowRetrievabilityCount": 2,
            "highDifficultyCount": 1,
            "recentFailureCount": 0,
            "documentIds": ["doc-2"],
            "exampleCardIds": ["card-4"],
        }
    )
    host = StudyGraphHost(summary)

    result = _run(host, max_weak_topics=1, max_card_gap_suggestions=1)

    assert len(result["weakTopics"]) == 1
    assert len(result["cardGapSuggestions"]) == 1
    assert len(result["suggestedCardGapRefs"]) == 1


def test_study_graph_v1_does_not_call_submit_review_candidates(monkeypatch):
    def fail_submit(*args, **kwargs):
        raise AssertionError("submit_review_candidates should not be invoked")

    monkeypatch.setattr(study_tools, "submit_review_candidates", fail_submit)
    host = StudyGraphHost()

    result = _run(host)

    assert result["status"] == "completed"
    assert host.submit_calls == []


def test_study_graph_returns_stable_failed_payload_on_host_timeout():
    class TimeoutHost(StudyGraphHost):
        def get_study_review_summary(self, document_id=None, limit=200):
            raise TimeoutError("timed out")

    result = _run(TimeoutHost())

    assert result["status"] == "failed"
    assert result["runtime"] == "langgraph_study"
    assert result["graphVersion"] == "study-graph-v1"
    assert result["errorCategory"] == "host_timeout"
    assert result["weakTopics"] == []
    assert "host_timeout" in result["qualityEnvelope"]["blockingReasons"]


def test_study_graph_v2_dry_run_returns_schedule_write_artifact():
    host = StudyGraphHost()

    result = _run(host, enable_schedule_write=True, dry_run=True)

    assert result["status"] == "completed"
    assert result["graphVersion"] == "study-graph-v2"
    assert result["studyScheduleWriteArtifactRef"] == "study-graph://runs/run-study-1/study_schedule_write"
    assert result["dryRunResult"]["dryRunRef"] == "dry-run-1"
    assert result["createdReviewCandidateIds"] == []
    assert host.submit_calls[0]["dryRun"] is True
    artifact = result["artifacts"][result["studyScheduleWriteArtifactRef"]]
    assert artifact["artifactType"] == "study_schedule_write"
    assert artifact["writeState"] == "dry_run_ready"


def test_study_graph_v2_blocks_real_write_without_required_refs():
    host = StudyGraphHost()

    result = _run(host, enable_schedule_write=True, dry_run=False)

    assert result["status"] == "partial"
    assert result["graphVersion"] == "study-graph-v2"
    assert result["errorCategory"] == "study_schedule_write_failed"
    assert "idempotency_key_missing" in result["qualityEnvelope"]["blockingReasons"]
    assert "dry_run_ref_missing" in result["qualityEnvelope"]["blockingReasons"]
    assert "rollback_ref_missing" in result["qualityEnvelope"]["blockingReasons"]
    assert host.submit_calls == []


def test_study_graph_v2_real_write_returns_created_review_candidate_ids():
    host = StudyGraphHost()

    result = _run(
        host,
        enable_schedule_write=True,
        dry_run=False,
        idempotency_key="study-schedule:run-study-1:test",
        dry_run_ref="dry-run-1",
        rollback_ref="rollback-1",
    )

    assert result["status"] == "completed"
    assert result["graphVersion"] == "study-graph-v2"
    assert result["createdReviewCandidateIds"] == ["review-candidate-1"]
    assert result["rollbackRef"] == "rollback-1"
    assert host.submit_calls[0]["dryRun"] is False
    assert host.submit_calls[0]["idempotencyKey"] == "study-schedule:run-study-1:test"
    artifact = result["artifacts"][result["studyScheduleWriteArtifactRef"]]
    assert artifact["writeState"] == "written"


def test_study_graph_v2_blocks_no_review_data_write():
    host = StudyGraphHost({"totalCards": 0, "topicSummary": [], "recentReviews": {"total": 0, "ratings": {}}})

    result = _run(host, enable_schedule_write=True, dry_run=True)

    assert result["status"] == "partial"
    assert result["errorCategory"] == "study_schedule_write_failed"
    assert "insufficient_review_data" in result["qualityEnvelope"]["blockingReasons"]
    assert "no_review_candidates" in result["qualityEnvelope"]["blockingReasons"]
    assert host.submit_calls == []


def test_study_graph_v2_host_write_failure_returns_stable_payload():
    class FailingHost(StudyGraphHost):
        def submit_review_candidates(self, *args, **kwargs):
            self.submit_calls.append({"args": args, **kwargs})
            raise RuntimeError("host write failed")

    result = _run(FailingHost(), enable_schedule_write=True, dry_run=True)

    assert result["status"] == "partial"
    assert result["errorCategory"] == "host_write_failed"
    assert "host_write_failed" in result["qualityEnvelope"]["blockingReasons"]
