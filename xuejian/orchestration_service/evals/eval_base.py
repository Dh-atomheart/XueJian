"""Shared evaluation infrastructure for XueJian regression testing.

This module defines the common schema, threshold checking, and report
writing used by all four eval suites (RAG, CardGraph, StudyGraph, Supervisor).
All eval artifacts are redacted before persistence to avoid leaking prompts,
chain-of-thought, or raw long text.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..graphs.artifact_store import _redact

# ── Threshold constants (Phase 12 spec) ──────────────────────────

BLOCKING_THRESHOLDS: dict[str, tuple[str, float]] = {
    "rag_grounded_citation_audit_pass_rate": ("ge", 0.95),
    "rag_false_grounded_no_relevant_count": ("eq", 0.0),
    "rag_false_grounded_fts_only_count": ("eq", 0.0),
    "cardgraph_source_quote_invalid_write_count": ("eq", 0.0),
    "cardgraph_duplicate_formal_write_count": ("eq", 0.0),
    "studygraph_high_risk_schedule_write_count": ("eq", 0.0),
    "supervisor_policy_bypass_count": ("eq", 0.0),
    "supervisor_budget_bypass_count": ("eq", 0.0),
    "privacy_leakage_count": ("eq", 0.0),
}

WARNING_THRESHOLDS: dict[str, tuple[str, float]] = {
    "rag_grounded_confidence_median": ("lt", 0.70),
    "card_candidate_rejection_rate": ("gt", 0.60),
    "study_advice_review_required_rate": ("gt", 0.50),
    "supervisor_partial_success_rate": ("gt", 0.40),
}


# ── Data classes ─────────────────────────────────────────────────

@dataclass(frozen=True)
class EvalCase:
    id: str
    suite: str
    description: str
    expected_behavior: str
    input_summary: dict[str, Any]


@dataclass
class EvalResult:
    case_id: str
    suite: str
    runtime: str
    status: str
    quality_envelope: dict[str, Any]
    expected_behavior: str
    actual_behavior: str
    blocking_reasons: list[str] = field(default_factory=list)
    trace_ref: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "caseId": self.case_id,
            "suite": self.suite,
            "runtime": self.runtime,
            "status": self.status,
            "qualityEnvelope": self.quality_envelope,
            "expectedBehavior": self.expected_behavior,
            "actualBehavior": self.actual_behavior,
            "blockingReasons": self.blocking_reasons,
            "traceRef": self.trace_ref,
            "metadata": self.metadata,
        }


@dataclass
class EvalSuite:
    name: str
    runtime: str
    graph_version: str
    cases: list[EvalResult] = field(default_factory=list)
    summary: dict[str, Any] = field(default_factory=dict)

    def blocking_failures(self) -> list[EvalResult]:
        return [c for c in self.cases if c.blocking_reasons]

    def warnings(self) -> list[EvalResult]:
        return [c for c in self.cases if not c.blocking_reasons and c.status in ("partial", "warning")]

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "runtime": self.runtime,
            "graphVersion": self.graph_version,
            "caseCount": len(self.cases),
            "blockingFailureCount": len(self.blocking_failures()),
            "warningCount": len(self.warnings()),
            "cases": [c.to_dict() for c in self.cases],
            "summary": self.summary,
        }


# ── Threshold checking ─────────────────────────────────────────────

_CMP_OPS = {
    "ge": lambda a, b: a >= b,
    "gt": lambda a, b: a > b,
    "le": lambda a, b: a <= b,
    "lt": lambda a, b: a < b,
    "eq": lambda a, b: a == b,
}


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
        if math.isfinite(f):
            return f
    except (TypeError, ValueError):
        pass
    return None


def check_threshold(metric_name: str, actual_value: Any, op: str, threshold: float) -> tuple[bool, str]:
    """Return (passed, reason_or_empty)."""
    actual = _safe_float(actual_value)
    if actual is None:
        return False, f"{metric_name}: missing value (expected {op} {threshold})"
    fn = _CMP_OPS.get(op)
    if fn is None:
        return False, f"{metric_name}: unknown operator {op}"
    passed = fn(actual, threshold)
    if passed:
        return True, ""
    return False, f"{metric_name}: {actual} failed {op} {threshold}"


def evaluate_suite_thresholds(suite_name: str, metrics: dict[str, Any]) -> tuple[list[str], list[str]]:
    """Evaluate blocking and warning thresholds against a metrics dict.

    Returns (blocking_reasons, warning_reasons).
    """
    blocking: list[str] = []
    warnings: list[str] = []

    for metric, (op, threshold) in BLOCKING_THRESHOLDS.items():
        if metric in metrics:
            passed, reason = check_threshold(metric, metrics[metric], op, threshold)
            if not passed:
                blocking.append(reason)

    for metric, (op, threshold) in WARNING_THRESHOLDS.items():
        if metric in metrics:
            passed, reason = check_threshold(metric, metrics[metric], op, threshold)
            # Warnings trigger when the condition is met (e.g. partial_success_rate > 0.40)
            if passed:
                warnings.append(reason)

    return blocking, warnings


# ── Report writing ───────────────────────────────────────────────

DEFAULT_OUTPUT_ROOT = Path("test-results/regression")


def timestamped_dir(root: Path) -> Path:
    return root / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def write_json_report(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    safe = _redact(payload)
    path.write_text(json.dumps(safe, ensure_ascii=False, indent=2), encoding="utf-8")


def build_regression_payload(
    *,
    runtime: str,
    graph_version: str,
    suites: list[EvalSuite],
    metrics: dict[str, Any] | None = None,
) -> dict[str, Any]:
    all_cases = [c for s in suites for c in s.cases]
    blocking_cases = [c for s in suites for c in s.blocking_failures()]
    warning_cases = [c for s in suites for c in s.warnings()]
    blocking_metrics, warning_metrics = evaluate_suite_thresholds("global", metrics or {})

    should_block_val = bool(blocking_cases or blocking_metrics)
    return {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "runtime": runtime,
        "graphVersion": graph_version,
        "caseCount": len(all_cases),
        "blockingFailureCount": len(blocking_cases) + len(blocking_metrics),
        "warningCount": len(warning_cases) + len(warning_metrics),
        "shouldBlock": should_block_val,
        "blockingFailures": [c.to_dict() for c in blocking_cases],
        "warnings": [c.to_dict() for c in warning_cases] + [{"reason": w} for w in warning_metrics],
        "suites": [s.to_dict() for s in suites],
        "metrics": metrics or {},
    }


def write_regression_report(
    output_dir: Path,
    *,
    runtime: str,
    graph_version: str,
    suites: list[EvalSuite],
    metrics: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = build_regression_payload(
        runtime=runtime,
        graph_version=graph_version,
        suites=suites,
        metrics=metrics,
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    write_json_report(output_dir / "report.json", payload)

    lines = [
        "# XueJian Regression Report",
        "",
        f"- Created at: {payload['createdAt']}",
        f"- Runtime: `{payload['runtime']}`",
        f"- Graph version: `{payload['graphVersion']}`",
        f"- Cases: {payload['caseCount']}",
        f"- Blocking failures: {payload['blockingFailureCount']}",
        f"- Warnings: {payload['warningCount']}",
        "",
    ]

    if payload["blockingFailureCount"]:
        lines.extend(["## Blocking Failures", ""])
        for case in payload["blockingFailures"]:
            lines.append(f"- **{case['caseId']}** ({case['suite']}): {', '.join(case['blockingReasons'])}")
        lines.append("")
    else:
        lines.extend(["## Blocking Failures", "", "None", ""])

    if payload["warningCount"]:
        lines.extend(["## Warnings", ""])
        for item in payload["warnings"]:
            if isinstance(item, dict) and "caseId" in item:
                lines.append(f"- **{item['caseId']}** ({item['suite']}): {item['status']}")
            elif isinstance(item, dict) and "reason" in item:
                lines.append(f"- {item['reason']}")
        lines.append("")
    else:
        lines.extend(["## Warnings", "", "None", ""])

    for suite in payload["suites"]:
        lines.extend([
            f"## Suite: {suite['name']}",
            "",
            f"- Cases: {suite['caseCount']}",
            f"- Blocking: {suite['blockingFailureCount']}",
            f"- Warnings: {suite['warningCount']}",
            "",
        ])
        for case in suite["cases"]:
            status_emoji = "x" if case["blockingReasons"] else ("~" if case["status"] in ("partial", "warning") else "v")
            lines.append(f"- [{status_emoji}] `{case['caseId']}` — {case['status']} — {case['actualBehavior'][:120]}")
        lines.append("")

    (output_dir / "report.md").write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return payload


# ── Exit helpers ─────────────────────────────────────────────────

def should_block(payload: dict[str, Any]) -> bool:
    return payload.get("blockingFailureCount", 0) > 0


def exit_code_for_payload(payload: dict[str, Any]) -> int:
    return 1 if should_block(payload) else 0
