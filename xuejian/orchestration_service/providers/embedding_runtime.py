"""Embedding runtime helpers for active embedding profiles."""
from __future__ import annotations

import hashlib
import logging
import random
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING

from .litellm_adapter import litellm_embedding
from .runtime import normalize_provider

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)

QUERY_EMBEDDING_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60
QUERY_EMBEDDING_CACHE_MAX_ENTRIES = 2_000
QUERY_EMBEDDING_ATTEMPT_TIMEOUTS = (15, 25)


@dataclass(frozen=True)
class QueryEmbeddingResult:
    vector: list[float]
    cache_hit: bool
    attempts: int
    latency_ms: float
    cache_key: str | None = None
    status: str = "ready"


class QueryEmbeddingRuntimeError(RuntimeError):
    def __init__(self, original: Exception, *, attempts: int, latency_ms: float) -> None:
        self.original = original
        self.attempts = attempts
        self.latency_ms = latency_ms
        super().__init__(str(original))


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
    *,
    timeout_seconds: int | float | None = None,
    num_retries: int | None = None,
) -> list[list[float]]:
    resolved = resolve_embedding_config(host, profile)
    if resolved is None:
        provider = normalize_provider(profile.get("provider", "openai"))
        raise RuntimeError(f"No enabled API config with key found for provider '{provider}'")

    config, api_key = resolved
    if task_type:
        config = dict(config)
        config["taskType"] = task_type
    vectors = litellm_embedding(
        config,
        api_key,
        texts,
        timeout_seconds=timeout_seconds,
        num_retries=num_retries,
    )
    expected_dimensions = int(profile.get("dimensions") or 0)
    if expected_dimensions > 0:
        for vector in vectors:
            if len(vector) != expected_dimensions:
                raise RuntimeError(
                    f"Embedding dimension mismatch: expected {expected_dimensions}, got {len(vector)}"
                )
    return vectors


def _normalize_query_for_cache(question: str) -> str:
    return " ".join(question.strip().casefold().split())


def _query_cache_identity(profile: dict, config: dict, question: str, task_type: str) -> tuple[str, str]:
    provider = normalize_provider(config.get("provider", profile.get("provider", "openai")))
    model = str(config.get("model") or profile.get("model") or "").strip()
    dimensions = str(int(profile.get("dimensions") or config.get("dimensions") or 0))
    revision = str(profile.get("revision") or "")
    normalized_question = _normalize_query_for_cache(question)
    question_hash = hashlib.sha256(normalized_question.encode("utf-8")).hexdigest()
    cache_material = "\x1f".join(
        [
            str(profile.get("id") or ""),
            revision,
            provider,
            model,
            dimensions,
            task_type,
            question_hash,
        ]
    )
    return hashlib.sha256(cache_material.encode("utf-8")).hexdigest(), question_hash


def _is_retryable_embedding_error(exc: Exception) -> bool:
    message = str(exc).casefold()
    retry_tokens = (
        "timeout",
        "timed out",
        "connection",
        "network",
        "dns",
        "temporarily unavailable",
        "service unavailable",
        "503",
        "502",
        "504",
    )
    permanent_tokens = (
        "dimension mismatch",
        "unauthorized",
        "forbidden",
        "401",
        "403",
        "invalid api key",
        "no enabled api config",
        "api key",
    )
    return any(token in message for token in retry_tokens) and not any(
        token in message for token in permanent_tokens
    )


def embed_query_with_resilience(
    host: HostGatewayClient,
    profile: dict,
    question: str,
    *,
    task_type: str = "RETRIEVAL_QUERY",
) -> QueryEmbeddingResult:
    started_at = time.monotonic()
    resolved = resolve_embedding_config(host, profile)
    if resolved is None:
        provider = normalize_provider(profile.get("provider", "openai"))
        raise RuntimeError(f"No enabled API config with key found for provider '{provider}'")

    config, api_key = resolved
    config = dict(config)
    config["taskType"] = task_type

    expected_dimensions = int(profile.get("dimensions") or config.get("dimensions") or 0)
    cache_key, question_hash = _query_cache_identity(profile, config, question, task_type)
    provider = normalize_provider(config.get("provider", profile.get("provider", "openai")))
    model = str(config.get("model") or profile.get("model") or "").strip()
    profile_id = str(profile.get("id") or "")

    if expected_dimensions > 0 and hasattr(host, "get_query_embedding_cache"):
        try:
            cached = host.get_query_embedding_cache(
                cache_key,
                expected_dimensions,
                QUERY_EMBEDDING_CACHE_TTL_SECONDS,
            )
            vector = cached.get("vector") if isinstance(cached, dict) and cached.get("hit") else None
            if isinstance(vector, list) and len(vector) == expected_dimensions:
                return QueryEmbeddingResult(
                    vector=[float(value) for value in vector],
                    cache_hit=True,
                    attempts=0,
                    latency_ms=(time.monotonic() - started_at) * 1000,
                    cache_key=cache_key,
                )
        except Exception as exc:
            logger.warning("Query embedding cache read failed: %s", exc)

    last_error: Exception | None = None
    attempts = 0
    for attempt_index, timeout_seconds in enumerate(QUERY_EMBEDDING_ATTEMPT_TIMEOUTS, start=1):
        attempts = attempt_index
        try:
            vectors = litellm_embedding(
                config,
                api_key,
                [question],
                timeout_seconds=timeout_seconds,
                num_retries=0,
            )
            vector = vectors[0]
            if expected_dimensions > 0 and len(vector) != expected_dimensions:
                raise RuntimeError(
                    f"Embedding dimension mismatch: expected {expected_dimensions}, got {len(vector)}"
                )
            if (
                expected_dimensions > 0
                and profile_id
                and hasattr(host, "put_query_embedding_cache")
            ):
                try:
                    host.put_query_embedding_cache(
                        cache_key=cache_key,
                        profile_id=profile_id,
                        provider=provider,
                        model=model,
                        dimensions=expected_dimensions,
                        task_type=task_type,
                        question_hash=question_hash,
                        vector=vector,
                        max_age_seconds=QUERY_EMBEDDING_CACHE_TTL_SECONDS,
                        max_entries=QUERY_EMBEDDING_CACHE_MAX_ENTRIES,
                    )
                except Exception as exc:
                    logger.warning("Query embedding cache write failed: %s", exc)
            return QueryEmbeddingResult(
                vector=vector,
                cache_hit=False,
                attempts=attempt_index,
                latency_ms=(time.monotonic() - started_at) * 1000,
                cache_key=cache_key,
            )
        except Exception as exc:
            last_error = exc
            if attempt_index >= len(QUERY_EMBEDDING_ATTEMPT_TIMEOUTS) or not _is_retryable_embedding_error(exc):
                break
            sleep_seconds = random.uniform(0.6, 1.0)
            logger.warning(
                "Query embedding attempt %s failed; retrying after %.2fs: %s",
                attempt_index,
                sleep_seconds,
                exc,
            )
            time.sleep(sleep_seconds)

    assert last_error is not None
    raise QueryEmbeddingRuntimeError(
        last_error,
        attempts=attempts,
        latency_ms=(time.monotonic() - started_at) * 1000,
    ) from last_error
