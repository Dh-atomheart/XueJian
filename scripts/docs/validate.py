from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from lib import (
    ALLOWED_STATUS,
    FRONTMATTER_KEYS,
    REQUIRED_LAYOUT_PATHS,
    APP_ROOT,
    DOCS_ROOT,
    REPO_ROOT,
    Check,
    canonical_markdown_files,
    expected_commands,
    find_local_links,
    format_check_result,
    non_archive_markdown_files,
    parse_frontmatter,
    read_text,
)


DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def check_required_layout() -> Check:
    missing = [str(path.relative_to(REPO_ROOT)) for path in REQUIRED_LAYOUT_PATHS if not path.exists()]
    return Check("required_layout", not missing, missing or ["Repository layout is complete."])


def check_frontmatter() -> Check:
    details: list[str] = []
    ok = True
    for path in canonical_markdown_files():
        metadata, _ = parse_frontmatter(read_text(path))
        missing = sorted(FRONTMATTER_KEYS - metadata.keys())
        if missing:
            ok = False
            details.append(f"{path.relative_to(REPO_ROOT)} missing keys: {', '.join(missing)}")
            continue
        if metadata["status"] not in ALLOWED_STATUS:
            ok = False
            details.append(f"{path.relative_to(REPO_ROOT)} has invalid status `{metadata['status']}`")
        if not DATE_RE.match(metadata["last_reviewed"]):
            ok = False
            details.append(f"{path.relative_to(REPO_ROOT)} has invalid last_reviewed `{metadata['last_reviewed']}`")
        if metadata["canonical"].lower() not in {"true", "false"}:
            ok = False
            details.append(f"{path.relative_to(REPO_ROOT)} has invalid canonical `{metadata['canonical']}`")
    return Check("frontmatter", ok, details or ["All canonical docs include valid frontmatter."])


def check_links() -> Check:
    details: list[str] = []
    ok = True
    for path in non_archive_markdown_files():
        text = read_text(path)
        for raw_target, resolved in find_local_links(path, text):
            if not resolved.exists():
                ok = False
                details.append(f"{path.relative_to(REPO_ROOT)} -> {raw_target} does not resolve")
    return Check("local_links", ok, details or ["All local markdown links resolve."])


def check_agents_length() -> Check:
    details: list[str] = []
    ok = True
    for path in [REPO_ROOT / "AGENTS.md", DOCS_ROOT / "AGENTS.md", APP_ROOT / "AGENTS.md"]:
        line_count = len(read_text(path).splitlines())
        if line_count > 200:
            ok = False
            details.append(f"{path.relative_to(REPO_ROOT)} has {line_count} lines")
    return Check("agents_length", ok, details or ["All AGENTS files are within 200 lines."])


def check_command_sync() -> Check:
    details: list[str] = []
    ok = True
    command_targets = [
        REPO_ROOT / "README.md",
        REPO_ROOT / "AGENTS.md",
        REPO_ROOT / "ARCHITECTURE.md",
        APP_ROOT / "AGENTS.md",
    ]
    expected = expected_commands()
    for path in command_targets:
        text = read_text(path)
        for command in expected:
            if command not in text:
                ok = False
                details.append(f"{path.relative_to(REPO_ROOT)} missing command `{command}`")
    return Check("command_sync", ok, details or ["Commands are synchronized with xuejian/package.json."])


def check_archive_references() -> Check:
    details: list[str] = []
    ok = True
    targets = [REPO_ROOT / "AGENTS.md", REPO_ROOT / "ARCHITECTURE.md", DOCS_ROOT / "README.md"]
    banned_markers = ("docs/archive/", "./archive/", "../archive/")
    for path in targets:
        text = read_text(path)
        for marker in banned_markers:
            if marker in text:
                ok = False
                details.append(f"{path.relative_to(REPO_ROOT)} references archive path `{marker}`")
    return Check("archive_truth_ban", ok, details or ["Main entry docs do not reference archives as truth sources."])


def check_workflows() -> Check:
    expected = [
        ".github/workflows/knowledge-base.yml",
        ".github/workflows/doc-garden.yml",
    ]
    missing = [path for path in expected if not (REPO_ROOT / path).exists()]
    return Check("workflow_files", not missing, missing or ["Workflow files are present."])


def run_checks() -> dict:
    checks = [
        check_required_layout(),
        check_frontmatter(),
        check_links(),
        check_agents_length(),
        check_command_sync(),
        check_archive_references(),
        check_workflows(),
    ]
    return {
        "ok": all(check.ok for check in checks),
        "checks": [
            {"name": check.name, "ok": check.ok, "details": check.details}
            for check in checks
        ],
    }


def main(argv: list[str] | None = None) -> int:
    argv = argv or sys.argv[1:]
    as_json = "--json" in argv
    result = run_checks()

    if as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        for check_data in result["checks"]:
            check = Check(check_data["name"], check_data["ok"], check_data["details"])
            print(format_check_result(check))

    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
