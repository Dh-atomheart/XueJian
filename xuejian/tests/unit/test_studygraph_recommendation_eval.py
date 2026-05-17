from orchestration_service.evals.studygraph_recommendation_eval import (
    StudyGraphFakeHost,
    _default_summary,
    run_all_cases,
    run_card_gap_suggestion_case,
    run_dry_run_produces_artifact_case,
    run_insufficient_review_data_case,
    run_schedule_write_blocked_without_refs_case,
    run_weak_topic_detection_case,
)


def test_run_weak_topic_detection_case():
    result = run_weak_topic_detection_case()
    assert result.blocking_reasons == []
    assert result.metadata["weakTopicCount"] > 0
    assert "weakTopics=" in result.actual_behavior


def test_run_card_gap_suggestion_case():
    result = run_card_gap_suggestion_case()
    assert result.blocking_reasons == []
    assert result.metadata["allHaveInput"] is True


def test_run_schedule_write_blocked_without_refs_case():
    result = run_schedule_write_blocked_without_refs_case()
    assert result.blocking_reasons == []
    assert "idempotency_key_missing" in result.metadata["blockingReasons"]


def test_run_dry_run_produces_artifact_case():
    result = run_dry_run_produces_artifact_case()
    assert result.blocking_reasons == []
    assert result.status == "completed"


def test_run_insufficient_review_data_case():
    result = run_insufficient_review_data_case()
    assert result.blocking_reasons == []
    assert result.status == "partial"


def test_run_all_cases_returns_suite():
    suite = run_all_cases()
    assert suite.name == "studygraph-recommendation"
    assert len(suite.cases) == 5
    assert suite.summary["caseCount"] == 5
