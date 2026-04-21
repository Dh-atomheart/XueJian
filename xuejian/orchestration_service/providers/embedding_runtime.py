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
    provider = normalize_provider(profile.get("provider", "openai"))
    config_with_key = host.get_config_with_key_by_provider(provider)
    if config_with_key is None:
        return None

    config, api_key = config_with_key
    runtime_config = dict(config)
    runtime_config["provider"] = provider
    runtime_config["model"] = profile.get("model") or config.get("model")
    if profile.get("dimensions"):
        runtime_config["dimensions"] = profile["dimensions"]
    return runtime_config, api_key


def embed_texts(
    host: HostGatewayClient,
    profile: dict,
    texts: list[str],
) -> list[list[float]]:
    resolved = resolve_embedding_config(host, profile)
    if resolved is None:
        provider = normalize_provider(profile.get("provider", "openai"))
        raise RuntimeError(f"No enabled API config with key found for provider '{provider}'")

    config, api_key = resolved
    vectors = litellm_embedding(config, api_key, texts)
    expected_dimensions = int(profile.get("dimensions") or 0)
    if expected_dimensions > 0:
        for vector in vectors:
            if len(vector) != expected_dimensions:
                raise RuntimeError(
                    f"Embedding dimension mismatch: expected {expected_dimensions}, got {len(vector)}"
                )
    return vectors