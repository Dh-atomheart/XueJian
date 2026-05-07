#!/usr/bin/env python3
from __future__ import annotations

import ast
import compileall
import importlib
import json
import sys
from pathlib import Path


WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
SERVICE_ROOT = WORKSPACE_ROOT / "xuejian" / "orchestration_service"
PACKAGE_PARENT = SERVICE_ROOT.parent


def _check_python_sources() -> None:
    python_files = sorted(path for path in SERVICE_ROOT.rglob("*.py") if "__pycache__" not in path.parts)

    if not python_files:
        raise RuntimeError(f"no Python files found under {SERVICE_ROOT}")

    for file_path in python_files:
        source = file_path.read_text(encoding="utf-8")
        ast.parse(source, filename=str(file_path))

    compiled = compileall.compile_dir(
        str(SERVICE_ROOT),
        quiet=1,
        force=False,
        maxlevels=10,
    )
    if not compiled:
        raise RuntimeError("compileall reported failures")


def _import_modules() -> list[str]:
    if str(PACKAGE_PARENT) not in sys.path:
        sys.path.insert(0, str(PACKAGE_PARENT))

    module_names = [
        "orchestration_service.main",
        "orchestration_service.server",
        "orchestration_service.clients.host_gateway",
        "orchestration_service.providers.runtime",
        "orchestration_service.providers.litellm_adapter",
        "orchestration_service.workflows.document_embedding",
        "orchestration_service.workflows.litellm_card_generation",
        "orchestration_service.workflows.card_generation",
        "orchestration_service.workflows.knowledge_qa",
        "orchestration_service.workflows.podcast",
        "orchestration_service.parsing.docling_pipeline",
    ]

    imported = []
    for module_name in module_names:
        importlib.import_module(module_name)
        imported.append(module_name)
    return imported


def main() -> int:
    _check_python_sources()
    imported_modules = _import_modules()

    payload = {
        "serviceRoot": str(SERVICE_ROOT),
        "importedModules": imported_modules,
        "status": "passed",
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
