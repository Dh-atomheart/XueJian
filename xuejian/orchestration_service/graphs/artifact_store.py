from __future__ import annotations

import copy
from typing import Any

SENSITIVE_KEYS = {
    "prompt",
    "messages",
    "chain_of_thought",
    "chainOfThought",
    "api_key",
    "apiKey",
    "authorization",
}


def _redact(value: Any) -> Any:
    if isinstance(value, list):
        return [_redact(item) for item in value[:200]]
    if isinstance(value, dict):
        output: dict[str, Any] = {}
        for key, item in value.items():
            if key in SENSITIVE_KEYS:
                continue
            output[key] = _redact(item)
        return output
    if isinstance(value, str):
        return value[:8000]
    return value


def persist_graph_artifacts(host: Any, run_id: str, artifacts: dict[str, Any] | None) -> tuple[bool, str | None]:
    if not run_id or not artifacts:
        return True, None
    create = getattr(host, "create_artifacts", None)
    if not callable(create):
        return True, None
    try:
        safe_artifacts = _redact(copy.deepcopy(artifacts))
        response = create(run_id, safe_artifacts)
        if isinstance(response, dict) and response.get("error"):
            return False, str(response.get("error"))
        return True, None
    except Exception:  # noqa: BLE001
        return False, "artifact_write_failed"


def fetch_artifact_by_ref(host: Any, artifact_ref: str) -> dict[str, Any] | None:
    get_artifact = getattr(host, "get_artifact", None)
    if not callable(get_artifact) or not artifact_ref:
        return None
    try:
        artifact = get_artifact(artifact_ref)
    except Exception:  # noqa: BLE001
        return None
    return artifact if isinstance(artifact, dict) else None
