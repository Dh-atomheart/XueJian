import json
from pathlib import Path

import pytest

from orchestration_service.evals.eval_base import (
    BLOCKING_THRESHOLDS,
    EvalCase,
    EvalResult,
    EvalSuite,
    build_regression_payload,
    check_threshold,
    evaluate_suite_thresholds,
    exit_code_for_payload,
    should_block,
    timestamped_dir,
    write_json_report,
    write_regression_report,
)


def test_check_threshold_ge_passes():
    passed, reason = check_threshold("foo", 0.96, "ge", 0.95)
    assert passed is True
    assert reason == ""


def test_check_threshold_ge_fails():
    passed, reason = check_threshold("foo", 0.90, "ge", 0.95)
    assert passed is False
    assert "failed" in reason


def test_check_threshold_eq_zero():
    passed, reason = check_threshold("foo", 0, "eq", 0.0)
    assert passed is True


def test_check_threshold_missing():
    passed, reason = check_threshold("foo", None, "eq", 0.0)
    assert passed is False
    assert "missing" in reason


def test_evaluate_suite_thresholds_no_match():
    blocking, warnings = evaluate_suite_thresholds("test", {})
    assert blocking == []
    assert warnings == []


def test_evaluate_suite_thresholds_blocking_hit():
    blocking, warnings = evaluate_suite_thresholds(
        "test",
        {"cardgraph_source_quote_invalid_write_count": 1},
    )
    assert len(blocking) == 1
    assert "cardgraph_source_quote_invalid_write_count" in blocking[0]
    assert warnings == []


def test_evaluate_suite_thresholds_warning_hit():
    blocking, warnings = evaluate_suite_thresholds(
        "test",
        {"supervisor_partial_success_rate": 0.50},
    )
    assert blocking == []
    assert len(warnings) == 1


def test_should_block_true():
    payload = {"blockingFailureCount": 2, "warningCount": 0}
    assert should_block(payload) is True
    assert exit_code_for_payload(payload) == 1


def test_should_block_false():
    payload = {"blockingFailureCount": 0, "warningCount": 3}
    assert should_block(payload) is False
    assert exit_code_for_payload(payload) == 0


def test_eval_result_to_dict():
    result = EvalResult(
        case_id="c-1",
        suite="cardgraph",
        runtime="langgraph_card",
        status="failed",
        quality_envelope={"riskLevel": "high"},
        expected_behavior="block",
        actual_behavior="blocked",
        blocking_reasons=["source_quote_invalid"],
        trace_ref="trace://1",
    )
    d = result.to_dict()
    assert d["caseId"] == "c-1"
    assert d["blockingReasons"] == ["source_quote_invalid"]


def test_eval_suite_blocking_and_warnings():
    suite = EvalSuite(name="s", runtime="r", graph_version="v1")
    suite.cases.append(
        EvalResult(
            case_id="c-1", suite="s", runtime="r", status="failed",
            quality_envelope={}, expected_behavior="b", actual_behavior="a",
            blocking_reasons=["fail"],
        )
    )
    suite.cases.append(
        EvalResult(
            case_id="c-2", suite="s", runtime="r", status="partial",
            quality_envelope={}, expected_behavior="b", actual_behavior="a",
            blocking_reasons=[],
        )
    )
    suite.cases.append(
        EvalResult(
            case_id="c-3", suite="s", runtime="r", status="completed",
            quality_envelope={}, expected_behavior="b", actual_behavior="a",
            blocking_reasons=[],
        )
    )
    assert len(suite.blocking_failures()) == 1
    assert len(suite.warnings()) == 1
    d = suite.to_dict()
    assert d["blockingFailureCount"] == 1
    assert d["warningCount"] == 1


def test_write_json_report_redacts_sensitive_keys(tmp_path):
    path = tmp_path / "report.json"
    payload = {
        "ok": True,
        "prompt": "secret",
        "messages": ["secret"],
        "chain_of_thought": "secret",
        "api_key": "secret",
        "nested": {"prompt": "secret", "allowed": "yes"},
    }
    write_json_report(path, payload)
    data = json.loads(path.read_text(encoding="utf-8"))
    assert "prompt" not in data
    assert "messages" not in data
    assert "chain_of_thought" not in data
    assert "api_key" not in data
    assert data["ok"] is True
    assert data["nested"]["allowed"] == "yes"
    assert "prompt" not in data["nested"]


def test_build_regression_payload_structure():
    suite = EvalSuite(name="cardgraph", runtime="langgraph_card", graph_version="v1")
    suite.cases.append(
        EvalResult(
            case_id="c-1", suite="cardgraph", runtime="langgraph_card", status="failed",
            quality_envelope={}, expected_behavior="b", actual_behavior="a",
            blocking_reasons=["source_quote_invalid"],
        )
    )
    payload = build_regression_payload(
        runtime="local",
        graph_version="v1",
        suites=[suite],
        metrics={"cardgraph_source_quote_invalid_write_count": 1},
    )
    assert payload["runtime"] == "local"
    assert payload["graphVersion"] == "v1"
    assert payload["caseCount"] == 1
    assert payload["blockingFailureCount"] == 2  # case + metric
    assert payload["suites"][0]["name"] == "cardgraph"


def test_write_regression_report_creates_files(tmp_path):
    suite = EvalSuite(name="s", runtime="r", graph_version="v1")
    suite.cases.append(
        EvalResult(
            case_id="c-1", suite="s", runtime="r", status="completed",
            quality_envelope={}, expected_behavior="b", actual_behavior="a",
        )
    )
    payload = write_regression_report(
        tmp_path,
        runtime="local",
        graph_version="v1",
        suites=[suite],
    )
    assert (tmp_path / "report.json").exists()
    assert (tmp_path / "report.md").exists()
    assert payload["caseCount"] == 1
    assert "Blocking Failures" in (tmp_path / "report.md").read_text(encoding="utf-8")


def test_timestamped_dir_format():
    d = timestamped_dir(Path("/tmp/regression"))
    assert d.name[0:8].isdigit()
    assert d.name[8] == "T"
