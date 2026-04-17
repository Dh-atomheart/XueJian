from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
DOCS_ROOT = REPO_ROOT / "docs"
APP_ROOT = REPO_ROOT / "xuejian"
MIGRATIONS_DIR = APP_ROOT / "src-tauri" / "src" / "migrations"

ALLOWED_STATUS = {"draft", "active", "deprecated", "archived"}
FRONTMATTER_KEYS = {"title", "status", "owner", "last_reviewed", "canonical"}

REQUIRED_LAYOUT_PATHS = [
    REPO_ROOT / "AGENTS.md",
    REPO_ROOT / "ARCHITECTURE.md",
    REPO_ROOT / "README.md",
    DOCS_ROOT / "README.md",
    DOCS_ROOT / "AGENTS.md",
    DOCS_ROOT / "design-docs",
    DOCS_ROOT / "exec-plans" / "active",
    DOCS_ROOT / "exec-plans" / "completed",
    DOCS_ROOT / "exec-plans" / "tech-debt-tracker.md",
    DOCS_ROOT / "generated",
    DOCS_ROOT / "product-specs" / "index.md",
    DOCS_ROOT / "product-specs" / "mvp.md",
    DOCS_ROOT / "product-specs" / "v2.md",
    DOCS_ROOT / "product-specs" / "v3.md",
    DOCS_ROOT / "product-specs" / "v4.md",
    DOCS_ROOT / "references" / "ai-orchestration.md",
    DOCS_ROOT / "references" / "repo-map-llms.txt",
    DOCS_ROOT / "QUALITY_SCORE.md",
    DOCS_ROOT / "RELIABILITY.md",
    DOCS_ROOT / "SECURITY.md",
    APP_ROOT / "AGENTS.md",
    REPO_ROOT / ".github" / "workflows" / "knowledge-base.yml",
    REPO_ROOT / ".github" / "workflows" / "doc-garden.yml",
    REPO_ROOT / "scripts" / "docs" / "validate.py",
    REPO_ROOT / "scripts" / "docs" / "check_architecture.py",
    REPO_ROOT / "scripts" / "docs" / "generate_db_schema.py",
    REPO_ROOT / "scripts" / "docs" / "garden.py",
    REPO_ROOT / "scripts" / "docs" / "preflight.py",
]


@dataclass
class Check:
    name: str
    ok: bool
    details: list[str]


def today_string() -> str:
    return date.today().isoformat()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def load_package_json() -> dict:
    return json.loads(read_text(APP_ROOT / "package.json"))


def expected_commands() -> list[str]:
    package = load_package_json()
    scripts = package.get("scripts", {})
    command_map = {
        "install": "cd xuejian && npm install",
        "dev": f"cd xuejian && npm run dev" if "dev" in scripts else None,
        "build": f"cd xuejian && npm run build" if "build" in scripts else None,
        "lint": f"cd xuejian && npm run lint" if "lint" in scripts else None,
        "test": f"cd xuejian && npm run test" if "test" in scripts else None,
        "test:e2e": f"cd xuejian && npm run test:e2e" if "test:e2e" in scripts else None,
        "tauri:dev": f"cd xuejian && npm run tauri:dev" if "tauri:dev" in scripts else None,
        "tauri:build": f"cd xuejian && npm run tauri:build" if "tauri:build" in scripts else None,
        "cargo-test": "cargo test --manifest-path xuejian/src-tauri/Cargo.toml",
    }
    return [command for command in command_map.values() if command]


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        return {}, text

    parts = text.split("\n---\n", 1)
    if len(parts) != 2:
        return {}, text

    raw_frontmatter, body = parts
    metadata: dict[str, str] = {}
    for line in raw_frontmatter.splitlines()[1:]:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        metadata[key.strip()] = value.strip().strip("'\"")
    return metadata, body


def canonical_markdown_files() -> list[Path]:
    files = [
        REPO_ROOT / "AGENTS.md",
        REPO_ROOT / "ARCHITECTURE.md",
        APP_ROOT / "AGENTS.md",
    ]
    for root in [
        DOCS_ROOT / "design-docs",
        DOCS_ROOT / "product-specs",
        DOCS_ROOT / "exec-plans",
        DOCS_ROOT / "references",
    ]:
        if root.exists():
            files.extend(sorted(root.rglob("*.md")))
    files.extend(
        [
            DOCS_ROOT / "README.md",
            DOCS_ROOT / "AGENTS.md",
            DOCS_ROOT / "QUALITY_SCORE.md",
            DOCS_ROOT / "RELIABILITY.md",
            DOCS_ROOT / "SECURITY.md",
        ]
    )
    unique = []
    seen: set[Path] = set()
    for path in files:
        if path.suffix == ".md" and path.exists() and path not in seen:
            if path.name.startswith("_"):
                continue
            seen.add(path)
            unique.append(path)
    return unique


def non_archive_markdown_files() -> list[Path]:
    files: list[Path] = [
        REPO_ROOT / "README.md",
        REPO_ROOT / "AGENTS.md",
        REPO_ROOT / "ARCHITECTURE.md",
        APP_ROOT / "AGENTS.md",
    ]
    for path in DOCS_ROOT.rglob("*.md"):
        if "archive" in path.parts:
            continue
        if path.name.startswith("_"):
            continue
        files.append(path)
    unique = []
    seen: set[Path] = set()
    for path in files:
        if path.exists() and path not in seen:
            seen.add(path)
            unique.append(path)
    return unique


LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")


def find_local_links(path: Path, text: str) -> Iterable[tuple[str, Path]]:
    for match in LINK_RE.finditer(text):
        raw_target = match.group(1).strip()
        if raw_target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        target = raw_target.split("#", 1)[0].strip("<>")
        if not target:
            continue
        yield raw_target, (path.parent / target).resolve()


def format_check_result(check: Check) -> str:
    status = "PASS" if check.ok else "FAIL"
    lines = [f"[{status}] {check.name}"]
    for detail in check.details:
        lines.append(f"  - {detail}")
    return "\n".join(lines)
