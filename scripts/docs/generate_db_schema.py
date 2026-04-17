from __future__ import annotations

import argparse
import hashlib
import re
import sys

from lib import DOCS_ROOT, MIGRATIONS_DIR, today_string, read_text, write_text


OUTPUT_PATH = DOCS_ROOT / "generated" / "db-schema.md"
TABLE_RE = re.compile(
    r"(CREATE\s+(?:VIRTUAL\s+)?TABLE\s+IF\s+NOT\s+EXISTS\s+([A-Za-z0-9_]+).*?;)",
    re.IGNORECASE | re.DOTALL,
)
INDEX_RE = re.compile(
    r"(CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+([A-Za-z0-9_]+).*?;)",
    re.IGNORECASE | re.DOTALL,
)


def migration_payload() -> list[tuple[str, str]]:
    payload: list[tuple[str, str]] = []
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        payload.append((path.name, read_text(path)))
    return payload


def source_hash(entries: list[tuple[str, str]]) -> str:
    digest = hashlib.sha256()
    for name, content in entries:
        digest.update(name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(content.encode("utf-8"))
        digest.update(b"\0")
    return digest.hexdigest()[:16]


def render() -> str:
    entries = migration_payload()
    digest = source_hash(entries)
    lines = [
        "---",
        "title: Database Schema",
        "status: active",
        "owner: platform",
        f"last_reviewed: {today_string()}",
        "canonical: false",
        f"source_hash: {digest}",
        "---",
        "",
        "# Database Schema",
        "",
        "This file is generated from `xuejian/src-tauri/src/migrations/*.sql`.",
        "",
        f"- Source hash: `{digest}`",
        "",
        "## Migrations",
    ]
    for name, _ in entries:
        lines.append(f"- `{name}`")

    lines.extend(["", "## Tables"])
    tables_found = False
    for name, content in entries:
        matches = list(TABLE_RE.findall(content))
        if not matches:
            continue
        tables_found = True
        lines.extend(["", f"### {name}"])
        for statement, table_name in matches:
            lines.extend(
                [
                    "",
                    f"#### `{table_name}`",
                    "",
                    "```sql",
                    statement.strip(),
                    "```",
                ]
            )
    if not tables_found:
        lines.extend(["", "_No table statements found._"])

    lines.extend(["", "## Indexes"])
    indexes_found = False
    for name, content in entries:
        matches = list(INDEX_RE.findall(content))
        if not matches:
            continue
        indexes_found = True
        lines.extend(["", f"### {name}"])
        for statement, index_name in matches:
            lines.extend(
                [
                    "",
                    f"#### `{index_name}`",
                    "",
                    "```sql",
                    statement.strip(),
                    "```",
                ]
            )
    if not indexes_found:
        lines.extend(["", "_No index statements found._"])

    lines.append("")
    return "\n".join(lines)


def is_current() -> bool:
    if not OUTPUT_PATH.exists():
        return False
    return read_text(OUTPUT_PATH) == render()


def write_schema() -> None:
    write_text(OUTPUT_PATH, render())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate docs/generated/db-schema.md")
    parser.add_argument("--check", action="store_true", help="Fail if the generated output is stale.")
    args = parser.parse_args(argv)

    if args.check:
        if is_current():
            print("docs/generated/db-schema.md is up to date.")
            return 0
        print("docs/generated/db-schema.md is stale. Run python scripts/docs/generate_db_schema.py")
        return 1

    write_schema()
    print(f"Wrote {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
