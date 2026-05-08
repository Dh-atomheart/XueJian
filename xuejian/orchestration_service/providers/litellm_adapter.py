"""LiteLLM adapter — thin wrapper that routes completions through litellm.

This is an alternative to the LangChain-based path when litellm is available.
The adapter normalises provider/model/api_key from the host's config format into
litellm's completion() call signature.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)
EMBEDDING_TIMEOUT_SECONDS = 60
COMPLETION_TIMEOUT_SECONDS = 60


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
    temperature: float = 1.0,
    max_tokens: int = 1024,
    response_format: dict[str, Any] | None = None,
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
        "timeout": COMPLETION_TIMEOUT_SECONDS,
        "num_retries": 1,
    }
    if response_format is not None:
        kwargs["response_format"] = response_format

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
    *,
    timeout_seconds: int | float | None = None,
    num_retries: int | None = None,
) -> list[list[float]]:
    """Call litellm.embedding() and return embedding vectors in order."""
    from ..providers.runtime import normalize_provider, resolve_model_runtime

    provider = normalize_provider(config.get("provider", "openai"))
    _, model_name, base_url = resolve_model_runtime(config)

    if provider == "google" and not base_url:
        return _google_native_embedding(
            api_key=api_key,
            model_name=model_name,
            texts=texts,
            task_type=str(config.get("taskType") or "").strip() or None,
            timeout_seconds=timeout_seconds,
        )

    if provider == "custom_openai" and base_url:
        return _openai_compatible_embedding(
            api_key=api_key,
            base_url=base_url,
            model_name=model_name,
            texts=texts,
            dimensions=config.get("dimensions"),
            timeout_seconds=timeout_seconds,
            num_retries=num_retries,
        )

    try:
        import litellm  # type: ignore[import]
    except ImportError as exc:
        raise ImportError(
            "litellm is not installed. Add 'litellm' to requirements.txt."
        ) from exc

    model_str = _build_litellm_model_str(provider, model_name, base_url)

    kwargs: dict[str, Any] = {
        "model": model_str,
        "input": texts,
        "api_key": api_key,
        "timeout": timeout_seconds or EMBEDDING_TIMEOUT_SECONDS,
        "num_retries": 1 if num_retries is None else num_retries,
    }

    if provider == "google":
        kwargs["api_key"] = api_key
    elif base_url:
        kwargs["api_base"] = base_url

    logger.debug("litellm_embedding: model=%s provider=%s base_url=%s", model_str, provider, base_url)

    response = litellm.embedding(**kwargs)
    items = getattr(response, "data", None) or response.get("data", [])
    return [list(item["embedding"]) for item in items]


def _openai_compatible_embedding(
    *,
    api_key: str,
    base_url: str,
    model_name: str,
    texts: list[str],
    dimensions: Any,
    timeout_seconds: int | float | None,
    num_retries: int | None,
) -> list[list[float]]:
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise ImportError(
            "openai is not installed. Add 'openai' to requirements.txt."
        ) from exc

    kwargs: dict[str, Any] = {
        "model": model_name,
        "input": texts,
    }
    try:
        parsed_dimensions = int(dimensions or 0)
    except (TypeError, ValueError):
        parsed_dimensions = 0
    if parsed_dimensions > 0:
        kwargs["dimensions"] = parsed_dimensions

    client = OpenAI(
        api_key=api_key,
        base_url=base_url,
        timeout=float(timeout_seconds or EMBEDDING_TIMEOUT_SECONDS),
        max_retries=1 if num_retries is None else num_retries,
    )
    response = client.embeddings.create(**kwargs)
    return [list(item.embedding) for item in response.data]


def _google_native_embedding(
    *,
    api_key: str,
    model_name: str,
    texts: list[str],
    task_type: str | None,
    timeout_seconds: int | float | None,
) -> list[list[float]]:
    try:
        from google import genai
        from google.genai import types
    except ImportError as exc:
        raise ImportError(
            "google-genai is not installed. Add 'google-genai' to requirements.txt."
        ) from exc

    try:
        from google.genai import client as genai_client

        timeout_ms = int((timeout_seconds or EMBEDDING_TIMEOUT_SECONDS) * 1000)
        http_options = genai_client.HttpOptions(timeout=timeout_ms)
        client = genai.Client(api_key=api_key, http_options=http_options)
    except Exception:
        client = genai.Client(api_key=api_key)
    config = None
    if task_type:
        config = types.EmbedContentConfig(task_type=task_type)

    response = client.models.embed_content(
        model=model_name,
        contents=texts,
        config=config,
    )
    embeddings = getattr(response, "embeddings", None) or []
    vectors: list[list[float]] = []
    for item in embeddings:
        values = getattr(item, "values", None)
        if values is None and isinstance(item, dict):
            values = item.get("values")
        if values is None:
            raise RuntimeError("Google embedding response did not include vector values")
        vectors.append(list(values))
    return vectors
