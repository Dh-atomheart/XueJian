#!/usr/bin/env python3
"""CLI entry point for the full XueJian regression suite.

Runs all four eval suites (RAG is handled separately via the orchestration
server endpoint; this script runs CardGraph, StudyGraph, and Supervisor),
aggregates results, checks thresholds, and exits non-zero if any blocking
thresholds fail.

Usage:
    python scripts/ci/run_regression_suite.py --output-dir test-results/regression
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Allow imports from orchestration_service
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT / "xuejian") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "xuejian"))

from orchestration_service.evals.regression_report import run_all_eval_suites, run_regression


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run XueJian regression eval suites.")
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Output directory. Defaults to test-results/regression/<timestamp>.",
    )
    parser.add_argument(
        "--runtime",
        default="xuejian-local",
        help="Runtime identifier for the report.",
    )
    parser.add_argument(
        "--graph-version",
        default="v1",
        help="Graph version for the report.",
    )
    parser.add_argument(
        "--ci",
        action="store_true",
        help="CI mode: print concise JSON summary to stdout and exit with non-zero on blocking failures.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    if args.output_dir:
        output_dir = Path(args.output_dir)
    else:
        from orchestration_service.evals.eval_base import DEFAULT_OUTPUT_ROOT, timestamped_dir

        output_dir = timestamped_dir(DEFAULT_OUTPUT_ROOT)

    suites = run_all_eval_suites()
    payload = run_regression(
        suites=suites,
        runtime=args.runtime,
        graph_version=args.graph_version,
        output_dir=output_dir,
    )

    blocking = payload.get("blockingFailureCount", 0)
    warnings = payload.get("warningCount", 0)
    exit_code = 1 if blocking > 0 else 0

    if args.ci:
        summary = {
            "status": "blocked" if blocking else "passed",
            "blockingFailures": blocking,
            "warnings": warnings,
            "caseCount": payload.get("caseCount", 0),
            "runtime": args.runtime,
            "graphVersion": args.graph_version,
            "outputDir": str(output_dir),
        }
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        print(f"Regression report written to {output_dir}")
        print(f"Cases: {payload.get('caseCount', 0)}")
        print(f"Blocking failures: {blocking}")
        print(f"Warnings: {warnings}")
        if blocking:
            print("BLOCKED: see report.md for details")

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
