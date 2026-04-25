"""Embedding runtime helpers for active embedding profiles."""
from __future__ import annotations

from typing import TYPE_CHECKING

from .litellm_adapter import litellm_embedding
from .runtime import normalize_provider

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient


def resolve_embedding_config(
    host: HostGatewayClient,
    profile: dict,
) -> tuple[dict, str] | None:
    assignment = host.get_workflow_assignment("document_embedding")
    if not assignment:
        return None

    model_profile = assignment.get("modelProfile") or {}
    config_payload = assignment.get("apiConfig") or {}
    config_id = config_payload.get("id") or model_profile.get("apiConfigId")
    if not config_id:
        return None

    if profile.get("id") and model_profile.get("id") and profile.get("id") != model_profile.get("id"):
        return None

    config = host.get_api_config(config_id) or config_payload
    if not config or not config.get("isEnabled"):
        return None

    api_key = ""
    if config.get("authMode") != "adc":
        api_key = host.get_api_key(config_id)
        if not api_key:
            return None

    runtime_config = dict(config)
    runtime_config["provider"] = normalize_provider(config.get("provider", profile.get("provider", "openai")))
    runtime_config["model"] = model_profile.get("modelId") or profile.get("model") or config.get("model")
    if profile.get("dimensions"):
        runtime_config["dimensions"] = profile["dimensions"]
    return runtime_config, api_key


def embed_texts(
    host: HostGatewayClient,
    profile: dict,
    texts: list[str],
    task_type: str | None = None,
) -> list[list[float]]:
    resolved = resolve_embedding_config(host, profile)
    if resolved is None:
        provider = normalize_provider(profile.get("provider", "openai"))
        raise RuntimeError(f"No enabled API config with key found for provider '{provider}'")

    config, api_key = resolved
    if task_type:
        config = dict(config)
        config["taskType"] = task_type
    vectors = litellm_embedding(config, api_key, texts)
    expected_dimensions = int(profile.get("dimensions") or 0)
    if expected_dimensions > 0:
        for vector in vectors:
            if len(vector) != expected_dimensions:
                raise RuntimeError(
                    f"Embedding dimension mismatch: expected {expected_dimensions}, got {len(vector)}"
                )
    return vectors
