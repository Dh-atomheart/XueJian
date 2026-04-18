"""Validate that exec-plan Acceptance criteria have corresponding test markers.

Scans all ``.test.ts`` and ``.spec.ts`` files under ``xuejian/tests/`` for
``@acceptance:<ID>`` markers and cross-references them with the ``## Tests``
tables in exec-plans.

This is an **advisory** check — it reports uncovered acceptance IDs but
does not block preflight.  Run manually or from workflows:

    python scripts/docs/validate_acceptance.py
    python scripts/docs/validate_acceptance.py --json
    python scripts/docs/validate_acceptance.py --plan m4-reading-and-sticky-notes
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from lib import APP_ROOT, DOCS_ROOT, REPO_ROOT, read_text

EXEC_PLAN_DIRS = [
    DOCS_ROOT / "exec-plans" / "active",
    DOCS_ROOT / "exec-plans" / "completed",
]

TESTS_DIR = APP_ROOT / "tests"

# Matches ID-based table rows: | m4-a1 | 验收点描述 | ⏳ |
TABLE_ROW_RE = re.compile(
    r"^\|"
    r"\s*(?P<id>[a-zA-Z0-9][\w-]*-a\d+)\s*\|"
    r"\s*(?P<criterion>[^|]+?)\s*\|"
    r"\s*(?P<status>[^|]+?)\s*\|",
)

# Matches @acceptance:xxx markers in test source code
MARKER_RE = re.compile(r"@acceptance:([\w-]+-a\d+)")


def _extract_tests_table(text: str) -> list[dict[str, str]]:
    """Return rows from the ``## Tests`` table in *text*."""
    in_section = False
    rows: list[dict[str, str]] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("## Tests"):
            in_section = True
            continue
        if in_section and stripped.startswith("## "):
            break
        if not in_section:
            continue
        if stripped.startswith("|--") or stripped.startswith("|-") or stripped.startswith("| ID"):
            continue
        m = TABLE_ROW_RE.match(stripped)
        if m:
            rows.append(m.groupdict())
    return rows


def _scan_test_markers() -> dict[str, list[str]]:
    """Scan all test files and return {acceptance_id: [file_paths]}."""
    markers: dict[str, list[str]] = {}
    if not TESTS_DIR.exists():
        return markers
    for ext in ("*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx"):
        for test_file in TESTS_DIR.rglob(ext):
            try:
                content = test_file.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            for match in MARKER_RE.finditer(content):
                aid = match.group(1)
                rel_path = str(test_file.relative_to(APP_ROOT))
                if aid not in markers:
                    markers[aid] = []
                if rel_path not in markers[aid]:
                    markers[aid].append(rel_path)
    return markers


def validate(plan_filter: str | None = None) -> dict:
    """Run validation and return a structured report."""
    marker_map = _scan_test_markers()
    plans: list[dict] = []
    total = 0
    covered = 0
    uncovered: list[str] = []

    for plan_dir in EXEC_PLAN_DIRS:
        if not plan_dir.exists():
            continue
        for md_path in sorted(plan_dir.glob("*.md")):
            if md_path.name.startswith("_") or md_path.name == "README.md":
                continue
            plan_name = md_path.stem
            if plan_filter and plan_filter != plan_name:
                continue

            text = read_text(md_path)
            rows = _extract_tests_table(text)
            if not rows:
                continue

            plan_entry: dict = {
                "plan": plan_name,
                "file": str(md_path.relative_to(REPO_ROOT)),
                "criteria": [],
            }

            for row in rows:
                total += 1
                aid = row["id"]
                test_files = marker_map.get(aid, [])
                is_covered = len(test_files) > 0
                if is_covered:
                    covered += 1
                else:
                    uncovered.append(f"{aid}: {row['criterion'].strip()}")

                plan_entry["criteria"].append(
                    {
                        "id": aid,
                        "criterion": row["criterion"].strip(),
                        "status": row["status"].strip(),
                        "covered": is_covered,
                        "test_files": test_files,
                    }
                )
            plans.append(plan_entry)

    return {
        "total": total,
        "covered": covered,
        "missing": total - covered,
        "uncovered": uncovered,
        "markers_found": len(marker_map),
        "plans": plans,
    }


def main(argv: list[str] | None = None) -> int:
    argv = argv or sys.argv[1:]
    as_json = "--json" in argv
    plan_filter: str | None = None
    for i, arg in enumerate(argv):
        if arg == "--plan" and i + 1 < len(argv):
            plan_filter = argv[i + 1]

    result = validate(plan_filter)

    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        scope = f" (plan: {plan_filter})" if plan_filter else ""
        print(f"\nAcceptance Test Coverage{scope}")
        print(f"{'='*50}")
        print(f"  Total criteria  : {result['total']}")
        print(f"  Covered (marker): {result['covered']}")
        print(f"  Missing (marker): {result['missing']}")
        print(f"  Markers found   : {result['markers_found']}")
        print(f"{'='*50}")

        if result["uncovered"]:
            print("\nUncovered acceptance IDs:\n")
            for entry in result["uncovered"]:
                print(f"  - {entry}")
        else:
            print("\n  All acceptance IDs have @acceptance markers in test code.")

        if result["covered"] > 0:
            print("\nCovered:")
            for plan in result["plans"]:
                for c in plan["criteria"]:
                    if c["covered"]:
                        files = ", ".join(c["test_files"])
                        print(f"  ✅ {c['id']}: {files}")

        print()

    # Advisory — always exit 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
