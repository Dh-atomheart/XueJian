"""Regression report orchestrator.

Runs the non-RAG eval suites (CardGraph, StudyGraph, Supervisor), aggregates
their results, checks global thresholds, and writes a unified regression report.

Note: RAG eval is handled separately via the /evals/ragas-knowledge-qa endpoint
because it requires document ingestion, question generation, and Ragas scoring.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .eval_base import (
    BLOCKING_THRESHOLDS,
    WARNING_THRESHOLDS,
    EvalSuite,
    check_threshold,
    evaluate_suite_thresholds,
    exit_code_for_payload,
    should_block,
    timestamped_dir,
    write_json_report,
    write_regression_report,
)


def collect_suite_metrics(suites: list[EvalSuite]) -> dict[str, Any]:
    """Aggregate metrics across all suites for global threshold checking."""
    metrics: dict[str, Any] = {}

    # RAG metrics come from the first suite if present
    rag_suite = next((s for s in suites if s.name == "rag"), None)
    if rag_suite and rag_suite.summary:
        for key in (
            "citation_audit_pass_rate",
            "false_grounded_no_relevant_count",
            "false_grounded_fts_only_count",
            "grounded_confidence_median",
        ):
            if key in rag_suite.summary:
                mapped = {
                    "citation_audit_pass_rate": "rag_grounded_citation_audit_pass_rate",
                    "false_grounded_no_relevant_count": "rag_false_grounded_no_relevant_count",
                    "false_grounded_fts_only_count": "rag_false_grounded_fts_only_count",
                    "grounded_confidence_median": "rag_grounded_confidence_median",
                }
                metrics[mapped[key]] = rag_suite.summary[key]

    # CardGraph metrics
    card_suite = next((s for s in suites if s.name == "cardgraph-quality"), None)
    if card_suite and card_suite.summary:
        for key in ("cardgraph_source_quote_invalid_write_count", "cardgraph_duplicate_formal_write_count"):
            if key in card_suite.summary:
                metrics[key] = card_suite.summary[key]
        if "rejection_rate" in card_suite.summary:
            metrics["card_candidate_rejection_rate"] = card_suite.summary["rejection_rate"]

    # StudyGraph metrics
    study_suite = next((s for s in suites if s.name == "studygraph-recommendation"), None)
    if study_suite and study_suite.summary:
        for key in ("studygraph_high_risk_schedule_write_count", "study_advice_review_required_rate"):
            if key in study_suite.summary:
                metrics[key] = study_suite.summary[key]

    # Supervisor metrics
    sup_suite = next((s for s in suites if s.name == "supervisor-golden-tasks"), None)
    if sup_suite and sup_suite.summary:
        for key in ("supervisor_policy_bypass_count", "supervisor_budget_bypass_count", "supervisor_partial_success_rate"):
            if key in sup_suite.summary:
                metrics[key] = sup_suite.summary[key]

    return metrics


def run_regression(
    *,
    suites: list[EvalSuite],
    runtime: str = "xuejian-local",
    graph_version: str = "v1",
    output_dir: Path | None = None,
) -> dict[str, Any]:
    """Run all suites, aggregate metrics, check thresholds, write reports.

    Returns the report payload.
    """
    if output_dir is None:
        output_dir = timestamped_dir(Path("test-results/regression"))

    metrics = collect_suite_metrics(suites)
    payload = write_regression_report(
        output_dir,
        runtime=runtime,
        graph_version=graph_version,
        suites=suites,
        metrics=metrics,
    )

    # Also write a machine-readable summary for CI
    ci_summary = {
        "createdAt": payload["createdAt"],
        "runtime": runtime,
        "graphVersion": graph_version,
        "caseCount": payload["caseCount"],
        "blockingFailureCount": payload["blockingFailureCount"],
        "warningCount": payload["warningCount"],
        "shouldBlock": should_block(payload),
        "exitCode": exit_code_for_payload(payload),
    }
    write_json_report(output_dir / "ci_summary.json", ci_summary)

    return payload


def run_all_eval_suites(
    *,
    monkeypatch_generation: Any | None = None,
) -> list[EvalSuite]:
    """Import and run all eval suites.

    This function is designed to be called from the server or CLI.
    It lazily imports to avoid heavy deps during module load.
    """
    from .cardgraph_quality_eval import run_all_cases as run_cardgraph
    from .studygraph_recommendation_eval import run_all_cases as run_studygraph
    from .supervisor_golden_tasks_eval import run_all_cases as run_supervisor

    suites: list[EvalSuite] = []

    # CardGraph
    try:
        suites.append(run_cardgraph(monkeypatch_generation=monkeypatch_generation))
    except Exception as exc:
        suites.append(
            EvalSuite(
                name="cardgraph-quality",
                runtime="langgraph_card",
                graph_version="unknown",
                summary={"error": str(exc)},
            )
        )

    # StudyGraph
    try:
        suites.append(run_studygraph())
    except Exception as exc:
        suites.append(
            EvalSuite(
                name="studygraph-recommendation",
                runtime="langgraph_study",
                graph_version="unknown",
                summary={"error": str(exc)},
            )
        )

    # Supervisor
    try:
        suites.append(run_supervisor())
    except Exception as exc:
        suites.append(
            EvalSuite(
                name="supervisor-golden-tasks",
                runtime="langgraph_multi_agent",
                graph_version="unknown",
                summary={"error": str(exc)},
            )
        )

    return suites
