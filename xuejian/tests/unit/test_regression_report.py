from pathlib import Path

from orchestration_service.evals.eval_base import EvalResult, EvalSuite
from orchestration_service.evals.regression_report import (
    collect_suite_metrics,
    run_all_eval_suites,
    run_regression,
)


def test_collect_suite_metrics_empty():
    metrics = collect_suite_metrics([])
    assert metrics == {}


def test_collect_suite_metrics_cardgraph():
    suite = EvalSuite(name="cardgraph-quality", runtime="r", graph_version="v1")
    suite.summary = {
        "cardgraph_source_quote_invalid_write_count": 0,
        "cardgraph_duplicate_formal_write_count": 0,
        "rejection_rate": 0.2,
    }
    metrics = collect_suite_metrics([suite])
    assert metrics["cardgraph_source_quote_invalid_write_count"] == 0
    assert metrics["cardgraph_duplicate_formal_write_count"] == 0
    assert metrics["card_candidate_rejection_rate"] == 0.2


def test_collect_suite_metrics_studygraph():
    suite = EvalSuite(name="studygraph-recommendation", runtime="r", graph_version="v1")
    suite.summary = {
        "studygraph_high_risk_schedule_write_count": 0,
        "study_advice_review_required_rate": 0.1,
    }
    metrics = collect_suite_metrics([suite])
    assert metrics["studygraph_high_risk_schedule_write_count"] == 0
    assert metrics["study_advice_review_required_rate"] == 0.1


def test_collect_suite_metrics_supervisor():
    suite = EvalSuite(name="supervisor-golden-tasks", runtime="r", graph_version="v1")
    suite.summary = {
        "supervisor_policy_bypass_count": 0,
        "supervisor_budget_bypass_count": 0,
        "supervisor_partial_success_rate": 0.2,
    }
    metrics = collect_suite_metrics([suite])
    assert metrics["supervisor_policy_bypass_count"] == 0
    assert metrics["supervisor_budget_bypass_count"] == 0
    assert metrics["supervisor_partial_success_rate"] == 0.2


def test_run_regression_creates_files(tmp_path):
    suite = EvalSuite(name="s", runtime="r", graph_version="v1")
    suite.cases.append(
        EvalResult(
            case_id="c-1", suite="s", runtime="r", status="completed",
            quality_envelope={}, expected_behavior="b", actual_behavior="a",
        )
    )
    payload = run_regression(
        suites=[suite],
        runtime="test",
        graph_version="v1",
        output_dir=tmp_path,
    )
    assert (tmp_path / "report.json").exists()
    assert (tmp_path / "report.md").exists()
    assert (tmp_path / "ci_summary.json").exists()
    assert payload["caseCount"] == 1
    assert payload["blockingFailureCount"] == 0


def test_run_regression_with_blocking_failure(tmp_path):
    suite = EvalSuite(name="s", runtime="r", graph_version="v1")
    suite.cases.append(
        EvalResult(
            case_id="c-1", suite="s", runtime="r", status="failed",
            quality_envelope={}, expected_behavior="b", actual_behavior="a",
            blocking_reasons=["source_quote_invalid"],
        )
    )
    payload = run_regression(
        suites=[suite],
        runtime="test",
        graph_version="v1",
        output_dir=tmp_path,
    )
    assert payload["blockingFailureCount"] == 1
    assert payload["shouldBlock"] is True


def test_run_all_eval_suites_returns_list():
    suites = run_all_eval_suites()
    assert isinstance(suites, list)
    assert len(suites) == 3
    names = {s.name for s in suites}
    assert names == {"cardgraph-quality", "studygraph-recommendation", "supervisor-golden-tasks"}
