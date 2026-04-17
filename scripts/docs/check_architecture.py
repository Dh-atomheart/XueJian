from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from lib import APP_ROOT, REPO_ROOT, Check, format_check_result, read_text


TS_IMPORT_RE = re.compile(
    r"""(?:import|export)\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]""",
    re.MULTILINE,
)


def classify_ts_path(path: Path) -> str | None:
    try:
        relative = path.relative_to(APP_ROOT / "src")
    except ValueError:
        return None

    parts = relative.parts
    if not parts:
        return None
    if parts[0] == "components" and len(parts) > 1 and parts[1] == "ui":
        return "components-ui"
    if parts[0] == "components":
        return "components"
    if parts[0] == "services" and len(parts) > 1 and parts[1] == "gateway":
        return "services-gateway"
    if parts[0] == "services":
        return "services"
    if parts[0] in {"types", "queries", "store", "features", "lib", "design-system"}:
        return parts[0]
    return parts[0]


def resolve_ts_import(source: Path, specifier: str) -> Path | None:
    if specifier.startswith("@/"):
        base = APP_ROOT / "src" / specifier[2:]
    elif specifier.startswith("."):
        base = (source.parent / specifier).resolve()
    else:
        return None

    candidates = [
        base,
        base.with_suffix(".ts"),
        base.with_suffix(".tsx"),
        base.with_suffix(".js"),
        base.with_suffix(".jsx"),
        base / "index.ts",
        base / "index.tsx",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def ts_violations() -> list[str]:
    violations: list[str] = []
    for path in sorted((APP_ROOT / "src").rglob("*.ts*")):
        source_layer = classify_ts_path(path)
        if source_layer is None:
            continue
        text = read_text(path)
        for specifier in TS_IMPORT_RE.findall(text):
            if source_layer == "queries" and specifier.startswith("@tauri-apps/"):
                violations.append(
                    f"{path.relative_to(REPO_ROOT)} imports `{specifier}` directly; runtime access must go through services."
                )
                continue
            if source_layer == "store" and specifier.startswith("@tauri-apps/"):
                violations.append(
                    f"{path.relative_to(REPO_ROOT)} imports `{specifier}` directly; store must not call runtime APIs."
                )
                continue

            target = resolve_ts_import(path, specifier)
            if target is None:
                continue
            target_layer = classify_ts_path(target)
            if target_layer is None:
                continue

            if source_layer == "types" and target_layer in {
                "features",
                "services",
                "services-gateway",
                "queries",
                "store",
                "components",
                "components-ui",
            }:
                violations.append(
                    f"{path.relative_to(REPO_ROOT)} depends on {target.relative_to(REPO_ROOT)} from the types layer."
                )
            if source_layer in {"services", "services-gateway"} and target_layer == "features":
                violations.append(
                    f"{path.relative_to(REPO_ROOT)} depends on feature code {target.relative_to(REPO_ROOT)}."
                )
            if source_layer == "components-ui" and target_layer == "features":
                violations.append(
                    f"{path.relative_to(REPO_ROOT)} depends on feature code {target.relative_to(REPO_ROOT)}."
                )
            if source_layer == "queries" and target_layer in {"features", "store", "components", "components-ui"}:
                violations.append(
                    f"{path.relative_to(REPO_ROOT)} depends on disallowed query target {target.relative_to(REPO_ROOT)}."
                )
            if source_layer == "store" and target_layer == "services-gateway":
                violations.append(
                    f"{path.relative_to(REPO_ROOT)} depends on gateway code {target.relative_to(REPO_ROOT)}."
                )
    return violations


RUST_BLOCK_USE_RE = re.compile(r"use\s+crate::\{([^;]+)\};", re.MULTILINE | re.DOTALL)
RUST_DIRECT_USE_RE = re.compile(r"crate::([a-z_]+)")


def classify_rust_path(path: Path) -> str | None:
    root = APP_ROOT / "src-tauri" / "src"
    try:
        relative = path.relative_to(root)
    except ValueError:
        return None
    return relative.parts[0]


def rust_used_modules(text: str) -> set[str]:
    modules = set(RUST_DIRECT_USE_RE.findall(text))
    for block in RUST_BLOCK_USE_RE.findall(text):
        for item in block.split(","):
            token = item.strip()
            if not token:
                continue
            module = token.split("::", 1)[0].strip()
            if module:
                modules.add(module)
    return modules


def rust_violations() -> list[str]:
    violations: list[str] = []
    root = APP_ROOT / "src-tauri" / "src"
    for path in sorted(root.rglob("*.rs")):
        source_layer = classify_rust_path(path)
        if source_layer is None:
            continue
        text = read_text(path)
        modules = rust_used_modules(text)
        if source_layer != "commands" and "commands" in modules:
            violations.append(
                f"{path.relative_to(REPO_ROOT)} depends on commands, which must stay outermost."
            )
    return violations


def run_checks() -> dict:
    ts = ts_violations()
    rust = rust_violations()
    checks = [
        Check("typescript_boundaries", not ts, ts or ["TypeScript boundaries are clean."]),
        Check("rust_boundaries", not rust, rust or ["Rust boundaries are clean."]),
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
