"""LiteLLM adapter — thin wrapper that routes completions through litellm.

This is an alternative to the LangChain-based path when litellm is available.
The adapter normalises provider/model/api_key from the host's config format into
litellm's completion() call signature.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def _build_litellm_model_str(provider: str, model_name: str, base_url: str | None) -> str:
    """Return the litellm model string for a given provider + model."""
    if provider in {"anthropic", "custom_anthropic"}:
        return f"anthropic/{model_name}"
    if provider in {"google", "custom_google"}:
        return f"gemini/{model_name}"
    if provider in {"custom_openai", "deepseek"} and base_url:
        # openai-compatible endpoint — use "openai/" prefix with custom base
        return f"openai/{model_name}"
    # openai
    return model_name


def litellm_completion(
    config: dict,
    api_key: str,
    messages: list[dict[str, str]],
    temperature: float = 0.4,
    max_tokens: int = 1024,
) -> str:
    """Call litellm.completion() and return the assistant message text.

    Args:
        config: Host API config dict with keys: provider, model, baseUrl (optional).
        api_key: Plaintext key fetched from the Rust key-ring (never logged).
        messages: OpenAI-style message list e.g. [{"role": "user", "content": "..."}].
        temperature: Sampling temperature.
        max_tokens: Maximum tokens to generate.

    Returns:
        The generated assistant message string.

    Raises:
        ImportError: If litellm is not installed.
        Exception: Propagated from litellm on API error.
    """
    try:
        import litellm  # type: ignore[import]
    except ImportError as exc:
        raise ImportError(
            "litellm is not installed. Add 'litellm' to requirements.txt."
        ) from exc

    from ..providers.runtime import normalize_provider, resolve_model_runtime

    provider = normalize_provider(config.get("provider", "openai"))
    _, model_name, base_url = resolve_model_runtime(config)
    model_str = _build_litellm_model_str(provider, model_name, base_url)

    kwargs: dict[str, Any] = {
        "model": model_str,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "api_key": api_key,
    }

    if provider == "anthropic":
        pass  # litellm handles anthropic API natively
    elif base_url:
        kwargs["api_base"] = base_url

    logger.debug("litellm_completion: model=%s provider=%s base_url=%s", model_str, provider, base_url)

    response = litellm.completion(**kwargs)
    return response.choices[0].message.content or ""


def litellm_embedding(
    config: dict,
    api_key: str,
    texts: list[str],
) -> list[list[float]]:
    """Call litellm.embedding() and return embedding vectors in order."""
    try:
        import litellm  # type: ignore[import]
    except ImportError as exc:
        raise ImportError(
            "litellm is not installed. Add 'litellm' to requirements.txt."
        ) from exc

    from ..providers.runtime import normalize_provider, resolve_model_runtime

    provider = normalize_provider(config.get("provider", "openai"))
    _, model_name, base_url = resolve_model_runtime(config)
    model_str = _build_litellm_model_str(provider, model_name, base_url)

    kwargs: dict[str, Any] = {
        "model": model_str,
        "input": texts,
        "api_key": api_key,
    }

    if provider == "google":
        kwargs["api_key"] = api_key
    elif base_url:
        kwargs["api_base"] = base_url

    logger.debug("litellm_embedding: model=%s provider=%s base_url=%s", model_str, provider, base_url)

    response = litellm.embedding(**kwargs)
    items = getattr(response, "data", None) or response.get("data", [])
    return [list(item["embedding"]) for item in items]
