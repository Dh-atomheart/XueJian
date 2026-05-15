from __future__ import annotations

import logging
from typing import Any

from langgraph.graph import END, START, StateGraph

from .card_nodes import (
    audit_source_quotes,
    build_coverage_plan,
    critique_candidates,
    dedupe_candidates,
    finalize_result,
    generate_candidates,
    load_source_evidence,
    submit_or_create_cards,
)
from .card_state import CardGraphState

logger = logging.getLogger(__name__)


def _classify_card_graph_error(exc: Exception) -> str:
    message = str(exc).casefold()
    if "timeout" in message or "timed out" in message:
        return "provider_timeout"
    if "json" in message:
        return "provider_invalid_json"
    if "validation" in message or "field required" in message or "extra inputs" in message:
        return "provider_validation_failed"
    if "host gateway" in message or "host" in message:
        return "host_gateway_error"
    return "card_graph_exception"


def _failure_payload(run_id: str, error_category: str, reason: str) -> dict[str, Any]:
    return {
        "runtime": "langgraph_card",
        "graphVersion": "card-graph-v1",
        "fallbackUsed": False,
        "status": "failed",
        "summary": f"CardGraph failed before cards could be created: {error_category}.",
        "submittedCount": 0,
        "cardArtifactRefs": {},
        "artifactRefs": {"card_candidate": [], "formal_card_write": [], "trace": [f"card-graph://runs/{run_id}/trace"]},
        "createdCardIds": [],
        "qualityEnvelope": {
            "groundingStatus": "not_applicable",
            "auditStatus": "failed",
            "confidence": 0.0,
            "riskLevel": "high",
            "reviewRequired": True,
            "blockingReasons": [error_category],
        },
        "errorCategory": error_category,
        "candidates": [],
        "discardedCandidates": [],
        "artifacts": {
            f"card-graph://runs/{run_id}/trace": {
                "artifactType": "trace",
                "createdBy": "langgraph_card",
                "summary": reason[:240],
                "qualityEnvelope": {
                    "groundingStatus": "not_applicable",
                    "auditStatus": "failed",
                    "confidence": 0.0,
                    "riskLevel": "high",
                    "reviewRequired": True,
                    "blockingReasons": [error_category],
                },
            }
        },
        "writeResponse": {},
    }


def build_card_graph():
    graph = StateGraph(CardGraphState)
    graph.add_node("load_source_evidence", load_source_evidence)
    graph.add_node("build_coverage_plan", build_coverage_plan)
    graph.add_node("generate_candidates", generate_candidates)
    graph.add_node("audit_source_quotes", audit_source_quotes)
    graph.add_node("critique_candidates", critique_candidates)
    graph.add_node("dedupe_candidates", dedupe_candidates)
    graph.add_node("submit_or_create_cards", submit_or_create_cards)
    graph.add_node("finalize_result", finalize_result)

    graph.add_edge(START, "load_source_evidence")
    graph.add_edge("load_source_evidence", "build_coverage_plan")
    graph.add_edge("build_coverage_plan", "generate_candidates")
    graph.add_edge("generate_candidates", "audit_source_quotes")
    graph.add_edge("audit_source_quotes", "critique_candidates")
    graph.add_edge("critique_candidates", "dedupe_candidates")
    graph.add_edge("dedupe_candidates", "submit_or_create_cards")
    graph.add_edge("submit_or_create_cards", "finalize_result")
    graph.add_edge("finalize_result", END)
    return graph.compile()


class CardGraphRunner:
    def __init__(self, host: Any) -> None:
        self.host = host
        self._graph = build_card_graph()

    def run(
        self,
        run_id: str,
        *,
        document_ids: list[str],
        source_chunk_ids: list[str] | None = None,
        evidence_artifact_refs: list[str] | None = None,
        evidence_artifacts: list[dict[str, Any]] | None = None,
        card_count_hint: int = 0,
        difficulty: str = "medium",
        write_mode: str = "candidate",
        provider_config_id: str,
    ) -> dict[str, Any]:
        state: CardGraphState = {
            "run_id": run_id,
            "document_ids": document_ids,
            "source_chunk_ids": source_chunk_ids or [],
            "evidence_artifact_refs": evidence_artifact_refs or [],
            "evidence_artifacts": evidence_artifacts or [],
            "card_count_hint": card_count_hint,
            "difficulty": difficulty,
            "write_mode": write_mode,
            "provider_config_id": provider_config_id,
            "host_ref": self.host,
        }
        try:
            final_state = self._graph.invoke(state)
        except Exception as exc:  # noqa: BLE001
            error_category = _classify_card_graph_error(exc)
            logger.exception("CardGraph failed for run %s: %s", run_id[:8], exc)
            return _failure_payload(run_id, error_category, str(exc))
        result = final_state.get("result") if isinstance(final_state, dict) else None
        if isinstance(result, dict):
            return result
        return _failure_payload(run_id, "card_graph_result_missing", "CardGraph finished without a result payload.")
