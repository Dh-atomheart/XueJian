from orchestration_service.evals.supervisor_golden_tasks_eval import (
    SupervisorFakeHost,
    _card_result,
    _default_quality,
    _knowledge_result,
    _study_result,
    run_all_cases,
    run_budget_exceeded_case,
    run_forbidden_graph_blocked_case,
    run_formal_card_write_option_case,
    run_non_compound_task_case,
    run_partial_success_case,
)


def test_run_non_compound_task_case():
    result = run_non_compound_task_case()
    assert result.blocking_reasons == []
    assert result.status == "failed"
    assert "not_compound_task" in result.actual_behavior


def test_run_forbidden_graph_blocked_case():
    result = run_forbidden_graph_blocked_case()
    assert result.blocking_reasons == []
    assert "policy_rejected=True" in result.actual_behavior


def test_run_budget_exceeded_case():
    result = run_budget_exceeded_case()
    assert result.blocking_reasons == []
    assert "budget_exceeded" in result.actual_behavior


def test_run_partial_success_case():
    result = run_partial_success_case()
    assert result.blocking_reasons == []
    assert result.status == "partial"


def test_run_formal_card_write_option_case():
    result = run_formal_card_write_option_case()
    assert result.blocking_reasons == []
    assert "write_mode=formal_card" in result.actual_behavior


def test_run_all_cases_returns_suite():
    suite = run_all_cases()
    assert suite.name == "supervisor-golden-tasks"
    assert len(suite.cases) == 5
    assert suite.summary["caseCount"] == 5


def test_quality_helper():
    q = _default_quality("low")
    assert q["riskLevel"] == "low"
    assert q["reviewRequired"] is False
    q2 = _default_quality("high", ["fail"])
    assert q2["riskLevel"] == "high"
    assert q2["reviewRequired"] is True
