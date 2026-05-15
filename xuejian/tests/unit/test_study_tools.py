import pytest

from orchestration_service.tools import TOOL_REGISTRY, ToolCallerNotAllowedError


class StudyHost:
    def __init__(self, response=None):
        self.response = response or {"acceptedCount": 1, "rejectedCount": 0}
        self.calls: list[tuple[str, list[dict]]] = []

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
        self.calls.append(
            {
                "runId": run_id,
                "candidates": candidates,
                "dryRun": dry_run,
                "idempotencyKey": idempotency_key,
                "dryRunRef": dry_run_ref,
                "rollbackRef": rollback_ref,
            }
        )
        return dict(self.response)


def test_suggest_review_schedule_uses_confidence_buckets():
    result = TOOL_REGISTRY.invoke(
        "suggest_review_schedule",
        {
            "card_ids": ["card-1", "card-2", "card-3"],
            "confidence_scores": {
                "card-1": 0.9,
                "card-2": 0.6,
                "card-3": 0.3,
            },
        },
        caller="langgraph_study",
    )

    assert result["suggestions"] == [
        {"cardId": "card-1", "suggestedIntervalDays": 7, "reason": "high_confidence_grounded_candidate"},
        {"cardId": "card-2", "suggestedIntervalDays": 3, "reason": "medium_confidence_candidate"},
        {"cardId": "card-3", "suggestedIntervalDays": 1, "reason": "low_confidence_needs_fast_followup"},
    ]


def test_submit_review_candidates_returns_route_not_implemented_without_raising():
    host = StudyHost(
        {
            "acceptedCount": 0,
            "rejectedCount": 1,
            "error": "route_not_implemented",
        }
    )
    result = TOOL_REGISTRY.invoke(
        "submit_review_candidates",
        {
            "run_id": "run-1",
            "candidates": [{"cardId": "card-1", "suggestedIntervalDays": 3}],
            "host_ref": host,
        },
        caller="langgraph_study",
    )

    assert result["accepted_count"] == 0
    assert result["rejected_count"] == 1
    assert result["error_category"] == "route_not_implemented"
    assert host.calls[0]["runId"] == "run-1"
    assert host.calls[0]["dryRun"] is True
    assert host.calls[0]["candidates"] == [{"cardId": "card-1", "suggestedIntervalDays": 3}]


def test_submit_review_candidates_returns_success_on_valid_response():
    host = StudyHost({"acceptedCount": 2, "rejectedCount": 0, "stored": True})
    result = TOOL_REGISTRY.invoke(
        "submit_review_candidates",
        {
            "run_id": "run-1",
            "candidates": [
                {"cardId": "card-1", "suggestedIntervalDays": 3, "reason": "medium_confidence_candidate"},
                {"cardId": "card-2", "suggestedIntervalDays": 7, "reason": "high_confidence_grounded_candidate"},
            ],
            "host_ref": host,
        },
        caller="langgraph_study",
    )

    assert result["accepted_count"] == 2
    assert result["rejected_count"] == 0
    assert result["error_category"] is None
    assert host.calls[0]["runId"] == "run-1"
    assert host.calls[0]["candidates"] == [
        {"cardId": "card-1", "suggestedIntervalDays": 3, "reason": "medium_confidence_candidate"},
        {"cardId": "card-2", "suggestedIntervalDays": 7, "reason": "high_confidence_grounded_candidate"},
    ]


def test_submit_review_candidates_passes_schedule_write_contract():
    host = StudyHost(
        {
            "acceptedCount": 1,
            "rejectedCount": 0,
            "createdReviewCandidateIds": ["review-candidate-1"],
            "dryRunRef": "dry-1",
            "rollbackRef": "rollback-1",
            "skippedDuplicates": 0,
        }
    )
    result = TOOL_REGISTRY.invoke(
        "submit_review_candidates",
        {
            "run_id": "run-1",
            "candidates": [{"cardId": "card-1", "suggestedIntervalDays": 3}],
            "host_ref": host,
            "dry_run": False,
            "idempotency_key": "study-schedule:run-1:test",
            "dry_run_ref": "dry-1",
            "rollback_ref": "rollback-1",
        },
        caller="langgraph_study",
    )

    assert result["created_review_candidate_ids"] == ["review-candidate-1"]
    assert result["dry_run_ref"] == "dry-1"
    assert result["rollback_ref"] == "rollback-1"
    assert host.calls[0]["dryRun"] is False
    assert host.calls[0]["idempotencyKey"] == "study-schedule:run-1:test"
    assert host.calls[0]["dryRunRef"] == "dry-1"
    assert host.calls[0]["rollbackRef"] == "rollback-1"


def test_study_tools_reject_legacy_study_agent_caller():
    with pytest.raises(ToolCallerNotAllowedError) as exc:
        TOOL_REGISTRY.invoke(
            "suggest_review_schedule",
            {
                "card_ids": ["card-1"],
                "confidence_scores": {"card-1": 0.9},
            },
            caller="study_agent",
        )

    assert exc.value.error_category == "caller_not_allowed"
