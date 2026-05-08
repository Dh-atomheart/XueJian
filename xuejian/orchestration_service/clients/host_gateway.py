"""Host Gateway Client — HTTP client for calling the Rust host's ModelGateway and ToolGateway."""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
import uuid
from typing import Any

logger = logging.getLogger(__name__)


class BudgetExceededError(RuntimeError):
    """Raised when the selected provider configuration is blocked by its monthly budget."""


class HostGatewayHttpError(RuntimeError):
    """Raised when the Rust host gateway returns a non-success HTTP response."""

    def __init__(self, method: str, path: str, code: int, body: str) -> None:
        self.method = method
        self.path = path
        self.code = code
        self.body = body
        detail = body.strip() or "empty response body"
        super().__init__(f"Host gateway {method} {path} returned HTTP {code}: {detail}")


def _normalize_provider(provider: Any) -> str:
    value = str(provider or "openai").strip().lower()
    if value in {"custom", "qianfan", "openai_compatible"}:
        return "custom_openai"
    return value


class HostGatewayClient:
    """HTTP client for calling the Rust Host's ModelGateway and ToolGateway."""

    def __init__(self, base_url: str) -> None:
        self._base = base_url.rstrip("/")
        self._token = os.environ.get("XUEJIAN_HOST_GATEWAY_TOKEN", "")

    def _headers(self, content_type: bool = False) -> dict[str, str]:
        headers = {
            "X-XueJian-Gateway-Token": self._token,
            "X-XueJian-Trace-Id": uuid.uuid4().hex,
        }
        if content_type:
            headers["Content-Type"] = "application/json"
        return headers

    def _get(self, path: str) -> dict:
        url = f"{self._base}{path}"
        try:
            req = urllib.request.Request(url, headers=self._headers())
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            logger.error("Host gateway %s returned %s: %s", path, exc.code, body)
            raise HostGatewayHttpError("GET", path, exc.code, body) from exc
        except urllib.error.URLError as exc:
            logger.error("Host gateway %s unreachable: %s", path, exc)
            raise

    def _post(self, path: str, payload: dict, timeout: int = 10) -> dict:
        url = f"{self._base}{path}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url, data=data, headers=self._headers(content_type=True)
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            logger.error("Host gateway POST %s returned %s: %s", path, exc.code, body)
            raise HostGatewayHttpError("POST", path, exc.code, body) from exc
        except urllib.error.URLError as exc:
            logger.error("Host gateway POST %s unreachable: %s", path, exc)
            raise

    # ── ModelGateway ──────────────────────────────────

    def list_api_configs(self) -> list[dict]:
        result = self._get("/model-gateway/configs")
        if isinstance(result, dict):
            return result.get("items", [])
        return result

    def get_api_config(self, config_id: str) -> dict | None:
        try:
            return self._get(f"/model-gateway/configs/{config_id}")
        except (urllib.error.HTTPError, HostGatewayHttpError):
            return None

    def get_config(self, config_id: str) -> dict | None:
        return self.get_api_config(config_id)

    def get_api_key(self, config_id: str) -> str:
        result = self._get(f"/model-gateway/api-key/{config_id}")
        return result.get("apiKey", "")

    def get_provider_budget_usage(self, config_id: str) -> dict | None:
        try:
            return self._get(f"/model-gateway/budget-usage/{config_id}")
        except (urllib.error.HTTPError, HostGatewayHttpError):
            return None

    def _ensure_budget_available(self, config: dict) -> None:
        raw_limit = config.get("budgetLimit")
        if raw_limit is None:
            return

        try:
            budget_limit = float(raw_limit)
        except (TypeError, ValueError):
            return

        name = (
            config.get("displayName")
            or config.get("name")
            or _normalize_provider(config.get("provider", "openai"))
        )

        if budget_limit <= 0:
            raise BudgetExceededError(f"供应商 {name} 的月度预算已达上限 (${budget_limit:.2f})")

        usage = self.get_provider_budget_usage(config.get("id", "")) or {}
        used = float(usage.get("estimatedCostUsd") or 0.0)
        if used >= budget_limit:
            raise BudgetExceededError(f"供应商 {name} 的月度预算已达上限 (${budget_limit:.2f})")

    def get_default_config_with_key(self) -> tuple[dict, str] | None:
        configs = self.list_api_configs()
        candidates = [
            config for config in configs if config.get("isDefault") and config.get("isEnabled")
        ]
        candidates.extend(
            config
            for config in configs
            if config.get("isEnabled") and not config.get("isDefault")
        )

        for config in candidates:
            if config.get("authMode") == "adc":
                self._ensure_budget_available(config)
                return config, ""
            api_key = self.get_api_key(config["id"])
            if api_key:
                self._ensure_budget_available(config)
                return config, api_key

        return None

    def get_config_with_key_by_provider(self, provider: str) -> tuple[dict, str] | None:
        configs = self.list_api_configs()
        normalized_provider = _normalize_provider(provider)
        config = next(
            (
                item
                for item in configs
                if item.get("isEnabled")
                and _normalize_provider(item.get("provider", "")) == normalized_provider
            ),
            None,
        )
        if config is None:
            return None
        if config.get("authMode") == "adc":
            self._ensure_budget_available(config)
            return config, ""
        api_key = self.get_api_key(config["id"])
        if not api_key:
            return None
        self._ensure_budget_available(config)
        return config, api_key

    def list_workflow_assignments(self) -> list[dict]:
        result = self._get("/model-gateway/workflow-assignments")
        if isinstance(result, list):
            return result
        return result.get("items", [])

    def get_workflow_assignment(self, workflow_type: str) -> dict | None:
        try:
            return self._get(f"/model-gateway/workflow-assignments/{workflow_type}")
        except (urllib.error.HTTPError, HostGatewayHttpError):
            return None

    def get_config_for_workflow(self, workflow_type: str) -> tuple[dict, str] | None:
        assignment = self.get_workflow_assignment(workflow_type)
        if not assignment:
            return None

        model_profile = assignment.get("modelProfile") or {}
        config_payload = assignment.get("apiConfig") or {}
        config_id = config_payload.get("id") or model_profile.get("apiConfigId")
        if not config_id:
            return None

        config = self.get_api_config(config_id) or config_payload
        if not config or not config.get("isEnabled"):
            return None

        model_id = model_profile.get("modelId")
        if model_id:
            config["model"] = model_id

        if config.get("authMode") == "adc":
            self._ensure_budget_available(config)
            return config, ""

        api_key = self.get_api_key(config_id)
        if not api_key:
            return None

        self._ensure_budget_available(config)
        return config, api_key

    def record_workflow_cost(self, api_config_id: str, estimated_cost_usd: float) -> dict:
        return self._post(
            "/model-gateway/workflow-cost",
            {
                "apiConfigId": api_config_id,
                "estimatedCostUsd": estimated_cost_usd,
            },
        )

    def list_embedding_profiles(self) -> list[dict]:
        return self._get("/model-gateway/embedding-profiles")

    def get_active_embedding_profile(self) -> dict | None:
        try:
            return self._get("/model-gateway/embedding-profiles/active")
        except (urllib.error.HTTPError, HostGatewayHttpError):
            return None

    # ── ToolGateway ────────────────────────────────────

    def get_app_settings(self) -> dict:
        return self._get("/tool-gateway/settings")

    def get_runtime_paths(self) -> dict:
        return self._get("/tool-gateway/runtime-paths")

    def get_document(self, document_id: str) -> dict | None:
        try:
            return self._get(f"/tool-gateway/documents/{document_id}")
        except (urllib.error.HTTPError, HostGatewayHttpError):
            return None

    def list_anchors(self, document_id: str) -> list[dict]:
        return self._get(f"/tool-gateway/anchors?documentId={document_id}")

    def list_chunks(self, document_id: str) -> list[dict]:
        return self._get(f"/tool-gateway/chunks?documentId={document_id}")

    def list_sections(self, document_id: str) -> list[dict]:
        return self._get(f"/tool-gateway/sections?documentId={document_id}")

    def list_document_chunks(self, document_id: str) -> list[dict]:
        return self.list_chunks(document_id)

    def persist_candidates(self, run_id: str, document_id: str, candidates: list[dict]) -> dict:
        return self._post("/tool-gateway/candidates", {
            "runId": run_id,
            "documentId": document_id,
            "candidates": candidates,
        })

    def persist_cards(self, run_id: str, document_id: str, cards: list[dict]) -> dict:
        return self._post("/tool-gateway/cards", {
            "runId": run_id,
            "documentId": document_id,
            "cards": cards,
        }, timeout=60)

    def count_candidates(self, run_id: str) -> dict:
        return self._get(f"/tool-gateway/candidates/count?runId={run_id}")

    def search_chunks(self, query: str, document_ids: list[str] | None = None, limit: int = 10) -> list[dict]:
        return self._post("/tool-gateway/search-chunks", {
            "query": query,
            "documentIds": document_ids or [],
            "limit": limit,
        })

    def save_chunk_embeddings(self, profile_id: str, embeddings: list[dict]) -> dict:
        return self._post(
            "/tool-gateway/embeddings/chunks",
            {
                "profileId": profile_id,
                "embeddings": embeddings,
            },
        )

    def get_document_embedding_readiness(
        self,
        profile_id: str,
        document_ids: list[str] | None = None,
    ) -> dict:
        return self._post(
            "/tool-gateway/embeddings/readiness",
            {
                "profileId": profile_id,
                "documentIds": document_ids or [],
            },
        )

    def get_query_embedding_cache(
        self,
        cache_key: str,
        expected_dimensions: int,
        max_age_seconds: int,
    ) -> dict:
        return self._post(
            "/tool-gateway/query-embedding-cache/get",
            {
                "cacheKey": cache_key,
                "expectedDimensions": expected_dimensions,
                "maxAgeSeconds": max_age_seconds,
            },
        )

    def put_query_embedding_cache(
        self,
        *,
        cache_key: str,
        profile_id: str,
        provider: str,
        model: str,
        dimensions: int,
        task_type: str,
        question_hash: str,
        vector: list[float],
        max_age_seconds: int,
        max_entries: int,
    ) -> dict:
        return self._post(
            "/tool-gateway/query-embedding-cache/put",
            {
                "cacheKey": cache_key,
                "profileId": profile_id,
                "provider": provider,
                "model": model,
                "dimensions": dimensions,
                "taskType": task_type,
                "questionHash": question_hash,
                "vector": vector,
                "maxAgeSeconds": max_age_seconds,
                "maxEntries": max_entries,
            },
        )

    def prune_query_embedding_cache(
        self,
        *,
        max_age_seconds: int,
        max_entries: int,
    ) -> dict:
        return self._post(
            "/tool-gateway/query-embedding-cache/prune",
            {
                "maxAgeSeconds": max_age_seconds,
                "maxEntries": max_entries,
            },
        )

    def search_hybrid(
        self,
        query: str,
        query_embedding: list[float] | None = None,
        document_ids: list[str] | None = None,
        limit: int = 10,
        rrf_k: int = 60,
    ) -> list[dict]:
        payload: dict[str, Any] = {
            "query": query,
            "documentIds": document_ids or [],
            "limit": limit,
            "rrfK": rrf_k,
        }
        if query_embedding:
            payload["queryEmbedding"] = query_embedding
        return self._post("/tool-gateway/search-hybrid", payload)

    # ── Knowledge Graph ────────────────────────────────

    # ── Run status & checkpoint ────────────────────────────────

    def get_run_status(self, run_id: str) -> dict | None:
        """Return the workflow_run record for the given run_id, or None if not found."""
        try:
            return self._get(f"/tool-gateway/runs/{run_id}")
        except Exception:
            return None

    def update_background_job_progress(
        self,
        job_id: str,
        *,
        progress_current: int | None = None,
        progress_total: int | None = None,
        progress_message: str | None = None,
    ) -> dict:
        payload: dict[str, Any] = {}
        if progress_current is not None:
            payload["progressCurrent"] = progress_current
        if progress_total is not None:
            payload["progressTotal"] = progress_total
        if progress_message is not None:
            payload["progressMessage"] = progress_message
        return self._post(f"/tool-gateway/jobs/{job_id}/progress", payload)

    def get_background_job_checkpoint(self, job_id: str) -> dict | None:
        try:
            return self._get(f"/tool-gateway/jobs/{job_id}/checkpoint")
        except Exception:
            return None

    def update_background_job_checkpoint(self, job_id: str, checkpoint: dict) -> dict:
        return self._post(f"/tool-gateway/jobs/{job_id}/checkpoint", checkpoint)

    def save_checkpoint(self, run_id: str, checkpoint: dict) -> dict:
        """Persist a checkpoint dict for the given workflow run."""
        return self._post(f"/tool-gateway/runs/{run_id}/checkpoint", checkpoint)

    def load_checkpoint(self, run_id: str) -> dict | None:
        """Load the most recent checkpoint for the given workflow run."""
        try:
            return self._get(f"/tool-gateway/runs/{run_id}/checkpoint")
        except Exception:
            return None

    def cancel_run(self, run_id: str) -> dict:
        """Request the host to mark the run as cancelled."""
        return self._post(f"/tool-gateway/runs/{run_id}/cancel", {})

    def emit_workflow_event(
        self,
        run_id: str,
        event_type: str,
        message: str | None = None,
        progress: float | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict:
        return self._post(
            f"/tool-gateway/runs/{run_id}/events",
            {
                "eventType": event_type,
                "message": message,
                "progress": progress,
                "payload": payload,
            },
        )

    def is_run_cancelled(self, run_id: str) -> bool:
        """Check whether the run has been cancelled by the host / user."""
        status = self.get_run_status(run_id)
        if status is None:
            return False
        return status.get("status") == "cancelled"

    def is_job_cancelled(self, job_id: str) -> bool:
        """Check whether a background job has a cancellation request."""
        try:
            status = self._get(f"/tool-gateway/jobs/{job_id}/status")
        except Exception:
            return False
        return bool(status.get("cancelRequestedAt") or status.get("cancel_requested_at"))

    # ── Cards (for export) ─────────────────────────────────────

    def update_document_status(self, document_id: str, status: str) -> dict:
        """Set the document status (e.g. 'parsing', 'parsed', 'failed')."""
        return self._post(f"/tool-gateway/documents/{document_id}/status", {"status": status})

    def save_document_analysis(self, document_id: str, analysis: dict) -> dict:
        """Persist parsed anchors + chunks for a document."""
        return self._post(f"/tool-gateway/documents/{document_id}/analysis", analysis)

    # ── Podcasts ───────────────────────────────────────────

    def create_podcast_episode(self, episode: dict) -> dict:
        return self._post("/tool-gateway/podcasts", episode)

    def get_podcast_episode(self, episode_id: str) -> dict | None:
        try:
            return self._get(f"/tool-gateway/podcasts/{episode_id}")
        except (urllib.error.HTTPError, HostGatewayHttpError):
            return None

    def update_podcast_episode(self, episode_id: str, updates: dict) -> dict:
        return self._post(f"/tool-gateway/podcasts/{episode_id}/update", updates)

    def list_podcast_episodes(self) -> list[dict]:
        return self._get("/tool-gateway/podcasts")

    def delete_podcast_episode(self, episode_id: str) -> dict:
        return self._post(f"/tool-gateway/podcasts/{episode_id}/delete", {})

    def save_podcast_audio_segment(self, segment: dict) -> dict:
        return self._post("/tool-gateway/podcast-audio-segments", segment)

    def list_podcast_audio_segments(self, episode_id: str) -> list[dict]:
        return self._get(f"/tool-gateway/podcasts/{episode_id}/audio-segments")

    def delete_podcast_audio_segments(self, episode_id: str) -> dict:
        return self._post(f"/tool-gateway/podcasts/{episode_id}/audio-segments/delete", {})

    def review_podcast_script(
        self,
        episode_id: str,
        action: str,
        edited_script_json: str | None = None,
    ) -> dict:
        payload: dict[str, Any] = {"action": action}
        if edited_script_json is not None:
            payload["editedScriptJson"] = edited_script_json
        return self._post(f"/tool-gateway/podcasts/{episode_id}/review", payload)

    # ── Cards (for export) ─────────────────────────────────────

    def list_cards(
        self,
        document_id: str | None = None,
        group_id: str | None = None,
        limit: int = 1000,
    ) -> list[dict]:
        """Return cards optionally filtered by document or group."""
        params: list[str] = [f"limit={limit}"]
        if document_id:
            params.append(f"documentId={document_id}")
        if group_id:
            params.append(f"groupId={group_id}")
        qs = "&".join(params)
        return self._get(f"/tool-gateway/cards?{qs}")
