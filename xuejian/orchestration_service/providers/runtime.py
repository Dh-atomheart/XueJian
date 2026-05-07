"""Provider runtime helpers — model resolution and LangChain client construction."""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# Supported providers: openai | anthropic | google | deepseek | custom_openai | custom_anthropic | custom_google
_VALID_PROVIDERS = {
    "openai",
    "anthropic",
    "google",
    "deepseek",
    "custom_openai",
    "custom_anthropic",
    "custom_google",
}


def normalize_provider(provider: Any) -> str:
    """Normalise a raw provider value to one of the supported provider IDs."""
    value = str(provider or "openai").strip().lower()
    if value in _VALID_PROVIDERS:
        return value
    if value in {"custom", "qianfan", "openai_compatible"}:
        logger.warning("Deprecated provider value %r normalised to 'custom_openai'", value)
        return "custom_openai"
    return "openai"


def default_model_for_provider(provider: str) -> str:
    if provider in {"anthropic", "custom_anthropic"}:
        return "claude-3-5-haiku-20241022"
    if provider in {"google", "custom_google"}:
        return "gemini-2.0-flash"
    if provider == "deepseek":
        return "deepseek-chat"
    # openai and compatible variants both default to gpt-4o-mini
    return "gpt-4o-mini"


def estimate_workflow_cost(config: dict) -> float:
    provider = normalize_provider(config.get("provider", "openai"))
    model_name = str(config.get("model") or default_model_for_provider(provider)).strip().lower()

    if provider in {"openai", "custom_openai"}:
        if model_name == "gpt-4o":
            return 0.03
        if model_name == "gpt-4o-mini":
            return 0.002
        if model_name.startswith("o1"):
            return 0.10
        return 0.01

    if provider in {"anthropic", "custom_anthropic"}:
        if "sonnet" in model_name:
            return 0.03
        if "haiku" in model_name:
            return 0.002
        return 0.01

    if provider in {"google", "custom_google"}:
        if "pro" in model_name:
            return 0.02
        if "flash" in model_name:
            return 0.001
        return 0.005

    if provider == "deepseek":
        return 0.002

    return 0.01


def resolve_model_runtime(config: dict) -> tuple[str, str, str | None]:
    provider = normalize_provider(config.get("provider", "openai"))
    model_name = str(config.get("model") or default_model_for_provider(provider)).strip()

    raw_base_url = config.get("baseUrl")
    if isinstance(raw_base_url, str):
        base_url = raw_base_url.strip().rstrip("/") or None
    else:
        base_url = None

    return provider, model_name, base_url


def build_langchain_chat_model(
    config: dict,
    api_key: str,
    temperature: float,
    *,
    timeout: float | None = None,
    max_tokens: int | None = None,
):
    from langchain_openai import ChatOpenAI

    provider, model_name, base_url = resolve_model_runtime(config)

    llm_kwargs: dict[str, Any] = {
        "model": model_name,
        "api_key": api_key,
        "temperature": temperature,
    }
    if timeout is not None:
        llm_kwargs["timeout"] = timeout
    if max_tokens is not None:
        llm_kwargs["max_tokens"] = max_tokens
    if base_url:
        llm_kwargs["base_url"] = base_url

    if provider in {"anthropic", "custom_anthropic"}:
        try:
            from langchain_anthropic import ChatAnthropic

            anthropic_kwargs: dict[str, Any] = {
                "model": model_name,
                "api_key": api_key,
                "temperature": temperature,
                "base_url": base_url,
            }
            if timeout is not None:
                anthropic_kwargs["timeout"] = timeout
            if max_tokens is not None:
                anthropic_kwargs["max_tokens"] = max_tokens
            return ChatAnthropic(**anthropic_kwargs)
        except ImportError:
            logger.warning("langchain-anthropic not installed, using OpenAI-compatible endpoint")
            return ChatOpenAI(**llm_kwargs)

    if provider in {"google", "custom_google"}:
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI

            google_kwargs: dict[str, Any] = {
                "model": model_name,
                "google_api_key": api_key,
                "temperature": temperature,
            }
            if timeout is not None:
                google_kwargs["timeout"] = timeout
            if max_tokens is not None:
                google_kwargs["max_output_tokens"] = max_tokens
            return ChatGoogleGenerativeAI(**google_kwargs)
        except ImportError:
            logger.warning("langchain-google-genai not installed, falling back to OpenAI-compatible client")
            return ChatOpenAI(**llm_kwargs)

    # openai, deepseek, and compatible variants all use ChatOpenAI
    return ChatOpenAI(**llm_kwargs)
