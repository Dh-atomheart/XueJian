"""Host Gateway Client — HTTP client for calling the Rust host's ModelGateway and ToolGateway."""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any

logger = logging.getLogger(__name__)


class HostGatewayClient:
    """HTTP client for calling the Rust Host's ModelGateway and ToolGateway."""

    def __init__(self, base_url: str) -> None:
        self._base = base_url.rstrip("/")

    def _get(self, path: str) -> dict:
        url = f"{self._base}{path}"
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            logger.error("Host gateway %s returned %s: %s", path, exc.code, body)
            raise
        except urllib.error.URLError as exc:
            logger.error("Host gateway %s unreachable: %s", path, exc)
            raise

    def _post(self, path: str, payload: dict) -> dict:
        url = f"{self._base}{path}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url, data=data, headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            logger.error("Host gateway POST %s returned %s: %s", path, exc.code, body)
            raise
        except urllib.error.URLError as exc:
            logger.error("Host gateway POST %s unreachable: %s", path, exc)
            raise

    # ── ModelGateway ──────────────────────────────────

    def list_api_configs(self) -> list[dict]:
        return self._get("/model-gateway/configs").get("items", self._get("/model-gateway/configs"))

    def get_api_config(self, config_id: str) -> dict | None:
        try:
            return self._get(f"/model-gateway/configs/{config_id}")
        except urllib.error.HTTPError:
            return None

    def get_api_key(self, config_id: str) -> str:
        result = self._get(f"/model-gateway/api-key/{config_id}")
        return result.get("apiKey", "")

    def get_default_config_with_key(self) -> tuple[dict, str] | None:
        configs = self.list_api_configs()
        default = next((c for c in configs if c.get("isDefault") and c.get("isEnabled")), None)
        if not default:
            default = next((c for c in configs if c.get("isEnabled")), None)
        if not default:
            return None
        api_key = self.get_api_key(default["id"])
        if not api_key:
            return None
        return default, api_key

    def get_config_with_key_by_provider(self, provider: str) -> tuple[dict, str] | None:
        configs = self.list_api_configs()
        normalized_provider = provider.lower()
        config = next(
            (
                item
                for item in configs
                if item.get("isEnabled")
                and str(item.get("provider", "")).lower() == normalized_provider
            ),
            None,
        )
        if config is None:
            return None
        api_key = self.get_api_key(config["id"])
        if not api_key:
            return None
        return config, api_key

    def list_embedding_profiles(self) -> list[dict]:
        return self._get("/model-gateway/embedding-profiles")

    def get_active_embedding_profile(self) -> dict | None:
        try:
            return self._get("/model-gateway/embedding-profiles/active")
        except urllib.error.HTTPError:
            return None

    # ── ToolGateway ────────────────────────────────────

    def get_document(self, document_id: str) -> dict | None:
        try:
            return self._get(f"/tool-gateway/documents/{document_id}")
        except urllib.error.HTTPError:
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

    # ── Run status & checkpoint ────────────────────────────────

    def get_run_status(self, run_id: str) -> dict | None:
        """Return the workflow_run record for the given run_id, or None if not found."""
        try:
            return self._get(f"/tool-gateway/runs/{run_id}")
        except Exception:
            return None

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

    def is_run_cancelled(self, run_id: str) -> bool:
        """Check whether the run has been cancelled by the host / user."""
        status = self.get_run_status(run_id)
        if status is None:
            return False
        return status.get("status") == "cancelled"

    # ── Cards (for export) ─────────────────────────────────────

    def update_document_status(self, document_id: str, status: str) -> dict:
        """Set the document status (e.g. 'parsing', 'parsed', 'failed')."""
        return self._post(f"/tool-gateway/documents/{document_id}/status", {"status": status})

    def save_document_analysis(self, document_id: str, analysis: dict) -> dict:
        """Persist parsed anchors + chunks for a document."""
        return self._post(f"/tool-gateway/documents/{document_id}/analysis", analysis)

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
