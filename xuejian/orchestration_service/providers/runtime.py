"""Provider runtime helpers — model resolution and LangChain client construction."""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def normalize_provider(provider: Any) -> str:
    value = str(provider or "openai").strip()
    if value == "custom":
        return "openai_compatible"
    if value in {"openai", "anthropic", "google", "openai_compatible"}:
        return value
    return "openai"


def default_model_for_provider(provider: str) -> str:
    if provider in {"openai", "openai_compatible"}:
        return "gpt-4o-mini"
    if provider == "anthropic":
        return "claude-3-5-haiku-20241022"
    if provider == "google":
        return "gemini-2.5-flash"
    return "gpt-4o-mini"


def resolve_model_runtime(config: dict) -> tuple[str, str, str | None]:
    provider = normalize_provider(config.get("provider", "openai"))
    model_name = str(config.get("model") or default_model_for_provider(provider)).strip()

    raw_base_url = config.get("baseUrl")
    if isinstance(raw_base_url, str):
        base_url = raw_base_url.strip().rstrip("/") or None
    else:
        base_url = None

    return provider, model_name, base_url


def build_langchain_chat_model(config: dict, api_key: str, temperature: float):
    from langchain_openai import ChatOpenAI

    provider, model_name, base_url = resolve_model_runtime(config)

    llm_kwargs: dict[str, Any] = {
        "model": model_name,
        "api_key": api_key,
        "temperature": temperature,
    }
    if base_url:
        llm_kwargs["base_url"] = base_url

    if provider == "anthropic":
        try:
            from langchain_anthropic import ChatAnthropic

            return ChatAnthropic(
                model=model_name,
                api_key=api_key,
                temperature=temperature,
                base_url=base_url,
            )
        except ImportError:
            logger.warning("langchain-anthropic not installed, using OpenAI-compatible endpoint")
            return ChatOpenAI(**llm_kwargs)

    if provider == "google":
        raise RuntimeError("Google provider is not yet wired into the Python orchestration client")

    return ChatOpenAI(**llm_kwargs)
