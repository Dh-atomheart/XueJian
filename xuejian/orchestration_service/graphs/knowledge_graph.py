from __future__ import annotations

import logging
from typing import Any

from langgraph.graph import END, START, StateGraph

from ..workflows import knowledge_qa as workflow
from .knowledge_events import build_artifact_refs, build_rag_artifacts
from .knowledge_nodes import (
    audit_citations,
    build_rag_trace,
    check_embedding_readiness,
    embed_question,
    finalize_result,
    initialize_run,
    load_conversation_context,
    maybe_remediate_retrieval,
    maybe_rewrite_query,
    merge_parent_context,
    pack_context,
    relevance_gate,
    rerank_evidence,
    retrieve_evidence,
    write_answer,
)
from .knowledge_state import GRAPH_VERSION, RUNTIME, KnowledgeGraphState

logger = logging.getLogger(__name__)


def _fallback_quality_envelope(answer_payload: dict[str, Any]) -> dict[str, Any]:
    retrieval_status = str(answer_payload.get("retrievalStatus") or "ready").strip().lower()
    blocking_reasons = ["graph_exception_fallback"]
    if retrieval_status and retrieval_status != "ready":
        blocking_reasons.append(retrieval_status)
    return {
        "groundingStatus": "not_applicable",
        "auditStatus": "not_applicable",
        "confidence": 0.0,
        "riskLevel": "high",
        "reviewRequired": True,
        "blockingReasons": blocking_reasons,
    }


def _route_after_readiness(state: KnowledgeGraphState) -> str:
    if state.get("error_category") in {"embedding_missing", "embedding_stale"}:
        return "build_rag_trace"
    return "embed_question"


def _route_after_relevance_gate(state: KnowledgeGraphState) -> str:
    gate_decision = state.get("gate_decision")
    if gate_decision == "second_retrieval" and int(state.get("remediation_count") or 0) < 1:
        return "maybe_remediate_retrieval"
    if gate_decision == "no_relevant_content":
        return "build_rag_trace"
    return "pack_context"


def _route_after_remediation(state: KnowledgeGraphState) -> str:
    if state.get("gate_decision") == "answer":
        return "pack_context"
    return "build_rag_trace"


def _route_after_write_answer(state: KnowledgeGraphState) -> str:
    answer_data = state.get("answer_data")
    if isinstance(answer_data, dict) and answer_data.get("answerMode") == "grounded":
        return "audit_citations"
    return "build_rag_trace"


def _route_after_audit_citations(state: KnowledgeGraphState) -> str:
    if state.get("error_category") == "citation_audit_failed" and int(state.get("remediation_count") or 0) < 1:
        return "maybe_remediate_retrieval"
    return "build_rag_trace"


def build_knowledge_graph():
    graph = StateGraph(KnowledgeGraphState)
    graph.add_node("initialize_run", initialize_run)
    graph.add_node("check_embedding_readiness", check_embedding_readiness)
    graph.add_node("embed_question", embed_question)
    graph.add_node("load_conversation_context", load_conversation_context)
    graph.add_node("maybe_rewrite_query", maybe_rewrite_query)
    graph.add_node("retrieve_evidence", retrieve_evidence)
    graph.add_node("merge_parent_context", merge_parent_context)
    graph.add_node("rerank_evidence", rerank_evidence)
    graph.add_node("relevance_gate", relevance_gate)
    graph.add_node("maybe_remediate_retrieval", maybe_remediate_retrieval)
    graph.add_node("pack_context", pack_context)
    graph.add_node("write_answer", write_answer)
    graph.add_node("audit_citations", audit_citations)
    graph.add_node("build_rag_trace", build_rag_trace)
    graph.add_node("finalize_result", finalize_result)

    graph.add_edge(START, "initialize_run")
    graph.add_edge("initialize_run", "check_embedding_readiness")
    graph.add_conditional_edges(
        "check_embedding_readiness",
        _route_after_readiness,
        {
            "embed_question": "embed_question",
            "build_rag_trace": "build_rag_trace",
        },
    )
    graph.add_edge("embed_question", "load_conversation_context")
    graph.add_edge("load_conversation_context", "maybe_rewrite_query")
    graph.add_edge("maybe_rewrite_query", "retrieve_evidence")
    graph.add_edge("retrieve_evidence", "merge_parent_context")
    graph.add_edge("merge_parent_context", "rerank_evidence")
    graph.add_edge("rerank_evidence", "relevance_gate")
    graph.add_conditional_edges(
        "relevance_gate",
        _route_after_relevance_gate,
        {
            "maybe_remediate_retrieval": "maybe_remediate_retrieval",
            "build_rag_trace": "build_rag_trace",
            "pack_context": "pack_context",
        },
    )
    graph.add_conditional_edges(
        "maybe_remediate_retrieval",
        _route_after_remediation,
        {
            "pack_context": "pack_context",
            "build_rag_trace": "build_rag_trace",
        },
    )
    graph.add_edge("pack_context", "write_answer")
    graph.add_conditional_edges(
        "write_answer",
        _route_after_write_answer,
        {
            "audit_citations": "audit_citations",
            "build_rag_trace": "build_rag_trace",
        },
    )
    graph.add_conditional_edges(
        "audit_citations",
        _route_after_audit_citations,
        {
            "maybe_remediate_retrieval": "maybe_remediate_retrieval",
            "build_rag_trace": "build_rag_trace",
        },
    )
    graph.add_edge("build_rag_trace", "finalize_result")
    graph.add_edge("finalize_result", END)
    return graph.compile()


class KnowledgeGraphRunner:
    def __init__(self, host: Any) -> None:
        self.host = host
        self._graph = build_knowledge_graph()

    def _annotate_fallback(self, run_id: str, result: dict[str, Any]) -> dict[str, Any]:
        answer = result.get("answer") if isinstance(result, dict) else None
        answer_payload = dict(answer) if isinstance(answer, dict) else {}
        citations = answer_payload.get("citations") if isinstance(answer_payload.get("citations"), list) else []
        artifact_refs = build_artifact_refs(run_id, [], citations)
        quality_envelope = _fallback_quality_envelope(answer_payload)
        annotated = dict(result)
        annotated["runtime"] = RUNTIME
        annotated["graphVersion"] = GRAPH_VERSION
        annotated["fallbackUsed"] = True
        annotated["qualityEnvelope"] = quality_envelope
        annotated["artifactRefs"] = artifact_refs
        annotated["artifacts"] = build_rag_artifacts(
            run_id,
            [],
            citations,
            quality_envelope,
            answer_payload,
            str(answer_payload.get("retrievalMode") or "hybrid"),
            str(answer_payload.get("retrievalStatus") or "ready"),
            error_category="graph_exception_fallback",
        )
        return annotated

    def run(
        self,
        run_id: str,
        question: str,
        document_ids: list[str],
        *,
        conversation_id: str | None = None,
    ) -> dict[str, Any]:
        initial_state: KnowledgeGraphState = {
            "run_id": run_id,
            "question": question,
            "document_ids": document_ids,
            "conversation_id": conversation_id,
            "host_ref": self.host,
        }
        try:
            final_state = self._graph.invoke(initial_state)
        except Exception as exc:
            logger.warning("KnowledgeGraph failed, using deterministic fallback: %s", exc)
            fallback_result = workflow.run_knowledge_qa_workflow(
                run_id,
                question,
                document_ids,
                self.host,
                conversation_id=conversation_id,
            )
            return self._annotate_fallback(run_id, fallback_result)

        result = final_state.get("result") if isinstance(final_state, dict) else None
        if isinstance(result, dict):
            return result

        fallback_result = workflow.run_knowledge_qa_workflow(
            run_id,
            question,
            document_ids,
            self.host,
            conversation_id=conversation_id,
        )
        return self._annotate_fallback(run_id, fallback_result)