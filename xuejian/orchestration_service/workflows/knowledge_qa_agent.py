from __future__ import annotations

from dataclasses import dataclass
import logging
import time
from typing import TYPE_CHECKING, Any

from ..memory import SESSION_STORE, SessionStore, build_session_context, update_session_state
from ..tools import TOOL_REGISTRY, ToolInputValidationError, ToolNotRegisteredError
from . import knowledge_qa as workflow

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)


@dataclass
class AgentToolInvocation:
    tool_key: str
    duration_ms: float
    input_summary: dict[str, Any]
    output_summary: dict[str, Any]
    error_category: str | None = None

    def to_payload(self) -> dict[str, Any]:
        return {
            "toolKey": self.tool_key,
            "durationMs": round(self.duration_ms, 3),
            "inputSummary": self.input_summary,
            "outputSummary": self.output_summary,
            "errorCategory": self.error_category,
        }


def _truncate_preview(value: str | None, limit: int = 80) -> str:
    if not value:
        return ""
    text = " ".join(str(value).split())
    return text[:limit]


def _retrieval_summary(chunks: list[dict[str, Any]], retrieval_mode: str) -> dict[str, Any]:
    return {
        "chunkCount": len(chunks),
        "retrievedDocumentCount": len(
            {
                document_id
                for chunk in chunks
                for document_id in [chunk.get("documentId")]
                if isinstance(document_id, str) and document_id
            }
        ),
        "lexicalStatus": workflow._lexical_status(chunks),
        "retrievalMode": retrieval_mode,
    }


def _safe_emit_event(
    host: HostGatewayClient,
    run_id: str,
    event_type: str,
    message: str,
    progress: float | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    if not run_id:
        return
    try:
        host.emit_workflow_event(run_id, event_type, message=message, progress=progress, payload=payload)
    except Exception as exc:
        logger.warning("Failed to emit workflow event for run %s: %s", run_id[:8], exc)


def _emit_rag_progress(
    host: HostGatewayClient,
    run_id: str,
    step_key: str,
    status: str,
    *,
    title: str,
    detail: str | None = None,
    progress: float | None = None,
    metrics: dict[str, Any] | None = None,
) -> None:
    workflow._emit_rag_progress(
        host,
        run_id,
        step_key,
        status,
        title=title,
        detail=detail,
        progress=progress,
        metrics=metrics,
    )


def _safe_save_checkpoint(
    host: HostGatewayClient,
    run_id: str,
    checkpoint_ref: str,
    step_key: str,
    payload: dict[str, Any],
) -> None:
    if not run_id:
        return
    try:
        host.save_checkpoint(
            run_id,
            {
                "checkpointRef": checkpoint_ref,
                "stepKey": step_key,
                "payload": payload,
            },
        )
    except Exception as exc:
        logger.warning("Failed to save checkpoint for run %s: %s", run_id[:8], exc)


class AgentQaRunner:
    def __init__(self, host: HostGatewayClient, *, session_store: SessionStore | None = None) -> None:
        self.host = host
        self.agent_trace: list[AgentToolInvocation] = []
        self.session_store = session_store or SESSION_STORE

    def _summarize_input(self, tool_key: str, payload: dict[str, Any]) -> dict[str, Any]:
        if tool_key == "retrieve_evidence":
            return {
                "questionPreview": _truncate_preview(payload.get("rewritten_query") or payload.get("question")),
                "documentCount": len(payload.get("document_ids") or []),
            }
        if tool_key in {"merge_parent_context", "rerank_evidence", "grade_retrieval_relevance", "pack_context"}:
            summary = {"chunkCount": len(payload.get("chunks") or [])}
            if tool_key == "pack_context":
                summary["episodicMemoryUsed"] = bool(payload.get("episodic_memory"))
            return summary
        if tool_key == "audit_citations":
            return {
                "chunkCount": len(payload.get("chunks") or []),
                "citationCount": len(payload.get("raw_citations") or []) if isinstance(payload.get("raw_citations"), list) else 0,
            }
        if tool_key == "build_rag_trace":
            return {
                "retrievalMode": payload.get("retrieval_mode"),
                "chunkCount": len(payload.get("chunks") or []),
                "failureReason": payload.get("failure_reason"),
            }
        return {}

    def _summarize_output(self, tool_key: str, result: dict[str, Any]) -> dict[str, Any]:
        if tool_key == "retrieve_evidence":
            return {
                "chunkCount": len(result.get("chunks") or []),
                "retrievalMode": result.get("retrieval_mode"),
                "readinessStatus": result.get("readiness_status"),
            }
        if tool_key == "merge_parent_context":
            return dict(result.get("merge_summary") or {})
        if tool_key == "rerank_evidence":
            return dict(result.get("rerank_summary") or {})
        if tool_key == "grade_retrieval_relevance":
            return dict(result.get("gate_summary") or {})
        if tool_key == "pack_context":
            return dict(result.get("packing_summary") or {})
        if tool_key == "audit_citations":
            return dict(result.get("audit_summary") or {})
        if tool_key == "build_rag_trace":
            rag_trace = result.get("rag_trace") or {}
            return {
                "retrievalMode": rag_trace.get("retrievalMode"),
                "citationAuditStatus": rag_trace.get("citationAuditStatus"),
                "failureReason": rag_trace.get("failureReason"),
            }
        return {}

    def _result_error_category(self, tool_key: str, result: dict[str, Any]) -> str | None:
        if tool_key == "audit_citations" and (result.get("removed_ids") or []):
            return "citation_invalid"
        return None

    def _invoke_tool(self, tool_key: str, payload: dict[str, Any]) -> dict[str, Any]:
        started_at = time.monotonic()
        input_summary = self._summarize_input(tool_key, payload)
        try:
            result = TOOL_REGISTRY.invoke(tool_key, payload, caller="knowledge_qa_agent")
        except ToolNotRegisteredError as exc:
            self.agent_trace.append(
                AgentToolInvocation(
                    tool_key=tool_key,
                    duration_ms=(time.monotonic() - started_at) * 1000,
                    input_summary=input_summary,
                    output_summary={},
                    error_category=exc.error_category,
                )
            )
            raise
        except ToolInputValidationError as exc:
            self.agent_trace.append(
                AgentToolInvocation(
                    tool_key=tool_key,
                    duration_ms=(time.monotonic() - started_at) * 1000,
                    input_summary=input_summary,
                    output_summary={},
                    error_category=exc.error_category,
                )
            )
            raise
        except Exception:
            self.agent_trace.append(
                AgentToolInvocation(
                    tool_key=tool_key,
                    duration_ms=(time.monotonic() - started_at) * 1000,
                    input_summary=input_summary,
                    output_summary={},
                    error_category="tool_execution_failed",
                )
            )
            raise

        self.agent_trace.append(
            AgentToolInvocation(
                tool_key=tool_key,
                duration_ms=(time.monotonic() - started_at) * 1000,
                input_summary=input_summary,
                output_summary=self._summarize_output(tool_key, result),
                error_category=self._result_error_category(tool_key, result),
            )
        )
        return result

    def _attach_agent_trace(self, result: dict[str, Any]) -> dict[str, Any]:
        answer = result.get("answer")
        if isinstance(answer, dict):
            answer["agentTrace"] = [item.to_payload() for item in self.agent_trace]
        return result

    def _attach_session_memory(
        self,
        result: dict[str, Any],
        *,
        session_memory_used: bool,
        session_memory_summary: str | None,
    ) -> dict[str, Any]:
        answer = result.get("answer")
        if isinstance(answer, dict):
            answer["sessionMemoryUsed"] = session_memory_used
            answer["sessionMemorySummary"] = session_memory_summary
        return result

    def _finalize_result(
        self,
        result: dict[str, Any],
        *,
        conversation_id: str | None,
        question: str,
        recent_messages: list[dict[str, str]],
        session_memory_context: str | None,
    ) -> dict[str, Any]:
        updated_summary: str | None = None
        if conversation_id:
            previous_state = self.session_store.get(conversation_id)
            answer = result.get("answer") if isinstance(result, dict) else None
            answer_text = answer.get("answer") if isinstance(answer, dict) else None
            next_state = update_session_state(
                previous_state,
                question,
                answer_text if isinstance(answer_text, str) else None,
                recent_messages,
            )
            self.session_store.put(conversation_id, next_state)
            updated_summary = next_state.get("summary")
        result = self._attach_agent_trace(result)
        return self._attach_session_memory(
            result,
            session_memory_used=bool(session_memory_context),
            session_memory_summary=updated_summary,
        )

    def _emit_completed(self, run_id: str, result: dict[str, Any], *, fallback_used: bool = False) -> None:
        answer = result.get("answer") if isinstance(result, dict) else None
        if not isinstance(answer, dict):
            return
        _safe_emit_event(
            self.host,
            run_id,
            "completed",
            "Agent QA 完成",
            progress=1.0,
            payload={
                "answerMode": answer.get("answerMode"),
                "retrievalStatus": answer.get("retrievalStatus"),
                "citationCount": len(answer.get("citations") or []),
                "toolCount": len(self.agent_trace),
                "fallbackUsed": fallback_used,
            },
        )

    def _finalize_and_emit(
        self,
        run_id: str,
        result: dict[str, Any],
        *,
        conversation_id: str | None,
        question: str,
        recent_messages: list[dict[str, str]],
        session_memory_context: str | None,
        fallback_used: bool = False,
    ) -> dict[str, Any]:
        finalized = self._finalize_result(
            result,
            conversation_id=conversation_id,
            question=question,
            recent_messages=recent_messages,
            session_memory_context=session_memory_context,
        )
        self._emit_completed(run_id, finalized, fallback_used=fallback_used)
        return finalized

    def _fallback_to_deterministic(
        self,
        run_id: str,
        question: str,
        document_ids: list[str],
        conversation_id: str | None,
        recent_messages: list[dict[str, str]] | None = None,
        session_memory_context: str | None = None,
        *,
        exc: Exception | None = None,
    ) -> dict[str, Any]:
        if exc is not None:
            logger.warning("Agent QA fell back to deterministic workflow: %s", exc)
        _safe_emit_event(
            self.host,
            run_id,
            "fallback",
            "回退到确定性 RAG",
            progress=0.5,
            payload={
                "reason": str(exc) if exc is not None else "precondition_not_met",
                "sessionMemoryUsed": bool(session_memory_context),
            },
        )
        result = workflow.run_knowledge_qa_workflow(
            run_id,
            question,
            document_ids,
            self.host,
            conversation_id=conversation_id,
            episodic_memory=session_memory_context,
        )
        _safe_save_checkpoint(
            self.host,
            run_id,
            "agent_qa",
            "fallback_to_deterministic",
            {
                "reason": str(exc) if exc is not None else "precondition_not_met",
                "sessionMemoryUsed": bool(session_memory_context),
            },
        )
        return self._finalize_and_emit(
            run_id,
            result,
            conversation_id=conversation_id,
            question=question,
            recent_messages=recent_messages or [],
            session_memory_context=session_memory_context,
            fallback_used=True,
        )

    def _prepare_retrieval_state(
        self,
        run_id: str,
        chunks: list[dict[str, Any]],
        question: str,
        *,
        rewritten_query: str | None,
        config: dict[str, Any] | None,
        api_key: str,
        episodic_memory: str | None = None,
        is_second_retrieval: bool = False,
    ) -> dict[str, Any]:
        merge_result = self._invoke_tool(
            "merge_parent_context",
            {
                "chunks": chunks,
                "host_ref": self.host,
            },
        )
        _emit_rag_progress(
            self.host,
            run_id,
            "rerank",
            "running",
            title="\u91cd\u6392\u8bc1\u636e",
            detail="\u6b63\u5728\u6309\u76f8\u5173\u6027\u91cd\u65b0\u6392\u5e8f",
            progress=0.42 if not is_second_retrieval else 0.62,
            metrics={"chunkCount": len(chunks)},
        )
        rerank_result = self._invoke_tool(
            "rerank_evidence",
            {
                "chunks": chunks,
                "question": question,
                "expanded_contexts": merge_result["expanded_contexts"],
                "rewritten_query": rewritten_query,
                "config_ref": config,
                "api_key_ref": api_key,
            },
        )
        _emit_rag_progress(
            self.host,
            run_id,
            "rerank",
            "completed",
            title="\u91cd\u6392\u8bc1\u636e",
            detail=str((rerank_result.get("rerank_summary") or {}).get("status") or "completed"),
            progress=0.5 if not is_second_retrieval else 0.66,
            metrics={
                "chunkCount": (rerank_result.get("rerank_summary") or {}).get("chunkCount", 0),
                "topScore": (rerank_result.get("rerank_summary") or {}).get("topScore"),
            },
        )
        _emit_rag_progress(
            self.host,
            run_id,
            "gate",
            "running",
            title="\u76f8\u5173\u6027\u95e8\u63a7",
            detail="\u6b63\u5728\u5224\u65ad\u662f\u5426\u9700\u8981\u4e8c\u6b21\u68c0\u7d22",
            progress=0.52 if not is_second_retrieval else 0.68,
            metrics={},
        )
        gate_result = self._invoke_tool(
            "grade_retrieval_relevance",
            {
                "chunks": rerank_result["chunks"],
                "is_second_retrieval": is_second_retrieval,
            },
        )
        _emit_rag_progress(
            self.host,
            run_id,
            "gate",
            "completed",
            title="\u76f8\u5173\u6027\u95e8\u63a7",
            detail=str(gate_result.get("decision") or "completed"),
            progress=0.58 if not is_second_retrieval else 0.7,
            metrics={
                "decision": gate_result.get("decision"),
                "topScore": (gate_result.get("gate_summary") or {}).get("topScore"),
            },
        )
        _emit_rag_progress(
            self.host,
            run_id,
            "pack",
            "running",
            title="\u6574\u7406\u4e0a\u4e0b\u6587",
            detail="\u6b63\u5728\u6253\u5305\u53ef\u5f15\u7528\u7247\u6bb5",
            progress=0.72,
            metrics={"chunkCount": len(rerank_result["chunks"])},
        )
        pack_result = self._invoke_tool(
            "pack_context",
            {
                "chunks": rerank_result["chunks"],
                "expanded_contexts": merge_result["expanded_contexts"],
                "episodic_memory": episodic_memory,
            },
        )
        _emit_rag_progress(
            self.host,
            run_id,
            "pack",
            "completed",
            title="\u6574\u7406\u4e0a\u4e0b\u6587",
            detail="\u5df2\u51c6\u5907\u751f\u6210\u4e0a\u4e0b\u6587",
            progress=0.76,
            metrics={
                "passageCount": (pack_result.get("packing_summary") or {}).get("passageCount", 0),
                "totalChars": (pack_result.get("packing_summary") or {}).get("totalChars", 0),
            },
        )
        return {
            "candidateChunks": rerank_result["chunks"],
            "expandedContexts": merge_result["expanded_contexts"],
            "mergeSummary": merge_result["merge_summary"],
            "rerankSummary": rerank_result["rerank_summary"],
            "gateDecision": gate_result["decision"],
            "gateSummary": gate_result["gate_summary"],
            "packedChunks": pack_result["packed_chunks"],
            "packingSummary": pack_result["packing_summary"],
        }

    def run(
        self,
        run_id: str,
        question: str,
        document_ids: list[str],
        *,
        conversation_id: str | None = None,
    ) -> dict[str, Any]:
        try:
            workflow._check_cancelled(self.host, run_id)
            self.session_store.expire_old()
            _safe_emit_event(
                self.host,
                run_id,
                "started",
                "Agent QA 开始",
                progress=0.05,
                payload={
                    "questionPreview": workflow._truncate_text(question, 60),
                    "documentCount": len(document_ids),
                },
            )
            _emit_rag_progress(
                self.host,
                run_id,
                "query_embedding",
                "running",
                title="\u7406\u89e3\u95ee\u9898",
                detail="Agent QA \u5df2\u542f\u52a8\uff0c\u6b63\u5728\u68c0\u67e5\u5411\u91cf\u68c0\u7d22\u72b6\u6001",
                progress=0.08,
                metrics={"documentCount": len(document_ids)},
            )

            active_profile = self.host.get_active_embedding_profile()
            if active_profile is None:
                _emit_rag_progress(
                    self.host,
                    run_id,
                    "query_embedding",
                    "failed",
                    title="\u7406\u89e3\u95ee\u9898",
                    detail="\u672a\u627e\u5230\u53ef\u7528\u7684\u5411\u91cf\u914d\u7f6e",
                    progress=0.1,
                    metrics={},
                )
                return self._fallback_to_deterministic(
                    run_id,
                    question,
                    document_ids,
                    conversation_id,
                    recent_messages=[],
                )

            readiness_status = workflow._embedding_readiness_status(self.host, active_profile, document_ids)
            if readiness_status != "ready":
                _emit_rag_progress(
                    self.host,
                    run_id,
                    "query_embedding",
                    "failed",
                    title="\u7406\u89e3\u95ee\u9898",
                    detail=f"\u5411\u91cf\u72b6\u6001: {readiness_status}",
                    progress=0.1,
                    metrics={"readinessStatus": readiness_status},
                )
                return self._fallback_to_deterministic(
                    run_id,
                    question,
                    document_ids,
                    conversation_id,
                    recent_messages=[],
                )
            _emit_rag_progress(
                self.host,
                run_id,
                "query_embedding",
                "completed",
                title="\u7406\u89e3\u95ee\u9898",
                detail="\u5411\u91cf\u68c0\u7d22\u72b6\u6001\u5c31\u7eea",
                progress=0.16,
                metrics={"readinessStatus": readiness_status},
            )

            config_with_key = self.host.get_config_for_workflow("knowledge_qa")
            config: dict[str, Any] = {}
            api_key = ""
            if config_with_key:
                config, api_key = config_with_key

            recent_messages = workflow._recent_messages_for_rewrite(self.host, conversation_id)
            session_memory_context = build_session_context(
                self.session_store.get(conversation_id),
                question,
                recent_messages,
            )
            rewrite_reason = workflow._rewrite_trigger_reason(question, recent_messages)
            rewritten_query: str | None = None
            rewrite_summary = workflow._default_rewrite_summary(
                trigger_reason=rewrite_reason,
                original_query=question,
                recent_message_count=len(recent_messages),
            )
            if rewrite_reason:
                _emit_rag_progress(
                    self.host,
                    run_id,
                    "rewrite",
                    "running",
                    title="\u6539\u5199\u95ee\u9898",
                    detail="\u6b63\u5728\u6839\u636e\u4f1a\u8bdd\u4e0a\u4e0b\u6587\u6539\u5199\u68c0\u7d22\u95ee\u9898",
                    progress=0.2,
                    metrics={"recentMessageCount": len(recent_messages), "reason": rewrite_reason},
                )
                if config_with_key:
                    try:
                        rewrite_candidate = workflow._rewrite_query(config, api_key, question, recent_messages)
                        if rewrite_candidate.strip() != question.strip():
                            rewritten_query = rewrite_candidate
                            rewrite_summary = workflow._default_rewrite_summary(
                                "applied",
                                trigger_reason=rewrite_reason,
                                original_query=question,
                                rewritten_query=rewritten_query,
                                recent_message_count=len(recent_messages),
                            )
                        else:
                            rewrite_summary = workflow._default_rewrite_summary(
                                "same_as_original",
                                trigger_reason=rewrite_reason,
                                original_query=question,
                                rewritten_query=rewrite_candidate,
                                recent_message_count=len(recent_messages),
                            )
                    except Exception as exc:
                        if isinstance(exc, workflow.WorkflowCancelled):
                            raise
                        logger.warning("Knowledge QA agent rewrite failed: %s", exc)
                        rewrite_summary = workflow._default_rewrite_summary(
                            "failed",
                            trigger_reason=rewrite_reason,
                            original_query=question,
                            recent_message_count=len(recent_messages),
                        )
                else:
                    rewrite_summary = workflow._default_rewrite_summary(
                        "skipped_no_model",
                        trigger_reason=rewrite_reason,
                        original_query=question,
                        recent_message_count=len(recent_messages),
                    )
                _emit_rag_progress(
                    self.host,
                    run_id,
                    "rewrite",
                    "completed" if rewrite_summary.get("status") == "applied" else "skipped",
                    title="\u6539\u5199\u95ee\u9898",
                    detail=str(rewrite_summary.get("status") or "not_run"),
                    progress=0.26,
                    metrics={"status": rewrite_summary.get("status")},
                )
            else:
                _emit_rag_progress(
                    self.host,
                    run_id,
                    "rewrite",
                    "skipped",
                    title="\u6539\u5199\u95ee\u9898",
                    detail="\u5f53\u524d\u95ee\u9898\u4e0d\u9700\u8981\u6539\u5199",
                    progress=0.24,
                    metrics={"status": rewrite_summary.get("status")},
                )

            _emit_rag_progress(
                self.host,
                run_id,
                "retrieve",
                "running",
                title="\u68c0\u7d22\u6587\u6863",
                detail="\u6b63\u5728\u68c0\u7d22\u5019\u9009\u7247\u6bb5",
                progress=0.3,
                metrics={"documentCount": len(document_ids)},
            )
            first_retrieval = self._invoke_tool(
                "retrieve_evidence",
                {
                    "question": question,
                    "document_ids": document_ids,
                    "host_ref": self.host,
                },
            )
            candidate_chunks = list(first_retrieval["chunks"])
            retrieval_mode = str(first_retrieval["retrieval_mode"])

            if rewritten_query:
                rewrite_retrieval = self._invoke_tool(
                    "retrieve_evidence",
                    {
                        "question": question,
                        "document_ids": document_ids,
                        "host_ref": self.host,
                        "rewritten_query": rewritten_query,
                    },
                )
                candidate_chunks = workflow._merge_candidate_chunks(candidate_chunks, rewrite_retrieval["chunks"])
                retrieval_mode = workflow._combine_retrieval_modes(
                    retrieval_mode,
                    str(rewrite_retrieval["retrieval_mode"]),
                )
            _emit_rag_progress(
                self.host,
                run_id,
                "retrieve",
                "completed",
                title="\u68c0\u7d22\u6587\u6863",
                detail="\u5df2\u83b7\u53d6\u5019\u9009\u7247\u6bb5",
                progress=0.38,
                metrics={"chunkCount": len(candidate_chunks), "retrievalMode": retrieval_mode},
            )

            retrieval_state = self._prepare_retrieval_state(
                run_id,
                candidate_chunks,
                question,
                rewritten_query=rewritten_query,
                config=config if config_with_key else None,
                api_key=api_key,
                episodic_memory=session_memory_context,
            )

            second_retrieval_summary = workflow._default_second_retrieval_summary()
            if retrieval_state["gateDecision"] == "second_retrieval":
                second_query_status = "fallback_original"
                second_query_reason = str(retrieval_state["gateSummary"].get("reason") or "low_relevance")
                second_query = rewritten_query or question
                if not rewritten_query or rewritten_query == question:
                    try:
                        second_query = workflow._build_second_retrieval_query(
                            config if config_with_key else None,
                            api_key,
                            question,
                            rewritten_query,
                            recent_messages,
                        )
                        if second_query.strip() != question.strip():
                            second_query_status = "applied"
                    except Exception as exc:
                        if isinstance(exc, workflow.WorkflowCancelled):
                            raise
                        logger.warning("Knowledge QA agent second retrieval rewrite failed: %s", exc)
                        second_query = rewritten_query or question
                        second_query_status = "failed_fallback"
                else:
                    second_query_status = "reuse_rewrite"

                _emit_rag_progress(
                    self.host,
                    run_id,
                    "second_retrieval",
                    "running",
                    title="\u4e8c\u6b21\u68c0\u7d22",
                    detail="\u76f8\u5173\u6027\u4e0d\u8db3\uff0c\u6b63\u5728\u8865\u5145\u68c0\u7d22",
                    progress=0.6,
                    metrics={"reason": second_query_reason},
                )
                second_retrieval = self._invoke_tool(
                    "retrieve_evidence",
                    {
                        "question": question,
                        "document_ids": document_ids,
                        "host_ref": self.host,
                        "rewritten_query": second_query,
                    },
                )
                first_chunk_ids = {
                    workflow._chunk_id(chunk)
                    for chunk in retrieval_state["candidateChunks"]
                    if workflow._chunk_id(chunk)
                }
                additional_chunk_count = sum(
                    1
                    for chunk in second_retrieval["chunks"]
                    if workflow._chunk_id(chunk) and workflow._chunk_id(chunk) not in first_chunk_ids
                )
                merged_candidates = workflow._merge_candidate_chunks(
                    retrieval_state["candidateChunks"],
                    second_retrieval["chunks"],
                )
                retrieval_mode = workflow._combine_retrieval_modes(
                    retrieval_mode,
                    str(second_retrieval["retrieval_mode"]),
                )
                retrieval_state = self._prepare_retrieval_state(
                    run_id,
                    merged_candidates,
                    question,
                    rewritten_query=rewritten_query or second_query,
                    config=config if config_with_key else None,
                    api_key=api_key,
                    episodic_memory=session_memory_context,
                    is_second_retrieval=True,
                )
                second_retrieval_summary = {
                    "status": second_query_status,
                    "used": True,
                    "queryPreview": workflow._truncate_text(second_query, 80),
                    "additionalChunkCount": additional_chunk_count,
                    "reason": second_query_reason,
                }
                _emit_rag_progress(
                    self.host,
                    run_id,
                    "second_retrieval",
                    "completed",
                    title="\u4e8c\u6b21\u68c0\u7d22",
                    detail=str(second_query_status),
                    progress=0.7,
                    metrics={"additionalChunkCount": additional_chunk_count, "status": second_query_status},
                )
            else:
                _emit_rag_progress(
                    self.host,
                    run_id,
                    "second_retrieval",
                    "skipped",
                    title="\u4e8c\u6b21\u68c0\u7d22",
                    detail="\u9996\u8f6e\u68c0\u7d22\u5df2\u8db3\u591f\u56de\u7b54",
                    progress=0.7,
                    metrics={},
                )

            packed_chunks = retrieval_state["packedChunks"]
            expanded_contexts = retrieval_state["expandedContexts"]
            merge_summary = retrieval_state["mergeSummary"]
            packing_summary = retrieval_state["packingSummary"]
            rerank_summary = retrieval_state["rerankSummary"]
            gate_summary = retrieval_state["gateSummary"]

            _safe_save_checkpoint(
                self.host,
                run_id,
                "agent_qa",
                "retrieval_ready",
                {
                    "retrievalMode": retrieval_mode,
                    "chunkCount": len(packed_chunks),
                    "sessionMemoryUsed": bool(session_memory_context),
                    "gateDecision": retrieval_state["gateDecision"],
                },
            )

            if retrieval_state["gateDecision"] == "no_relevant_content" or not packed_chunks:
                _emit_rag_progress(
                    self.host,
                    run_id,
                    "generate",
                    "skipped",
                    title="\u751f\u6210\u56de\u7b54",
                    detail="\u672a\u627e\u5230\u8db3\u591f\u76f8\u5173\u7684\u6587\u6863\u5185\u5bb9",
                    progress=0.88,
                    metrics={"decision": retrieval_state["gateDecision"]},
                )
                trace_result = self._invoke_tool(
                    "build_rag_trace",
                    {
                        "readiness_status": readiness_status,
                        "retrieval_mode": retrieval_mode,
                        "chunks": packed_chunks,
                        "query_rewrite_used": rewritten_query is not None,
                        "rewrite_summary": rewrite_summary,
                        "merge_summary": merge_summary,
                        "packing_summary": packing_summary,
                        "rerank_summary": rerank_summary,
                        "gate_summary": gate_summary,
                        "second_retrieval_summary": second_retrieval_summary,
                        "audit_summary": workflow._default_audit_summary("not_run"),
                        "failure_reason": "relevance_gate_rejected",
                    },
                )
                return self._finalize_and_emit(
                    run_id,
                    workflow._status_answer(
                        "当前资料中没有足够证据回答这个问题。",
                        "no_hits",
                        retrieval_mode=retrieval_mode,
                        rag_trace=trace_result["rag_trace"],
                    ),
                    conversation_id=conversation_id,
                    question=question,
                    recent_messages=recent_messages,
                    session_memory_context=session_memory_context,
                )

            if not config_with_key:
                if retrieval_mode == "fts5":
                    _emit_rag_progress(
                        self.host,
                        run_id,
                        "generate",
                        "skipped",
                        title="\u751f\u6210\u56de\u7b54",
                        detail="\u672a\u914d\u7f6e\u56de\u7b54\u6a21\u578b\uff0c\u4ec5\u4fdd\u7559\u68c0\u7d22\u6458\u8981",
                        progress=0.88,
                        metrics={"retrievalMode": retrieval_mode},
                    )
                    trace_result = self._invoke_tool(
                        "build_rag_trace",
                        {
                            "readiness_status": readiness_status,
                            "retrieval_mode": retrieval_mode,
                            "chunks": packed_chunks,
                            "query_rewrite_used": rewritten_query is not None,
                            "rewrite_summary": rewrite_summary,
                            "merge_summary": merge_summary,
                            "packing_summary": packing_summary,
                            "rerank_summary": rerank_summary,
                            "gate_summary": gate_summary,
                            "second_retrieval_summary": second_retrieval_summary,
                            "audit_summary": workflow._default_audit_summary("not_run"),
                            "failure_reason": "model_not_configured",
                        },
                    )
                    return self._finalize_and_emit(
                        run_id,
                        workflow._status_answer(
                            "当前资料中没有足够证据回答这个问题。",
                            "no_hits",
                            retrieval_mode=retrieval_mode,
                            rag_trace=trace_result["rag_trace"],
                        ),
                        conversation_id=conversation_id,
                        question=question,
                        recent_messages=recent_messages,
                        session_memory_context=session_memory_context,
                    )
                raise RuntimeError("Knowledge Q&A model is not configured")

            if workflow._uses_degraded_lexical_fallback(retrieval_mode, packed_chunks):
                _emit_rag_progress(
                    self.host,
                    run_id,
                    "generate",
                    "skipped",
                    title="\u751f\u6210\u56de\u7b54",
                    detail="\u68c0\u7d22\u964d\u7ea7\uff0c\u8fd4\u56de\u6587\u6863\u6458\u5f55",
                    progress=0.88,
                    metrics={"retrievalMode": retrieval_mode},
                )
                trace_result = self._invoke_tool(
                    "build_rag_trace",
                    {
                        "readiness_status": readiness_status,
                        "retrieval_mode": retrieval_mode,
                        "chunks": packed_chunks,
                        "query_rewrite_used": rewritten_query is not None,
                        "rewrite_summary": rewrite_summary,
                        "merge_summary": merge_summary,
                        "packing_summary": packing_summary,
                        "rerank_summary": rerank_summary,
                        "gate_summary": gate_summary,
                        "second_retrieval_summary": second_retrieval_summary,
                        "audit_summary": workflow._default_audit_summary("not_run"),
                        "failure_reason": "contains_only_fallback",
                    },
                )
                return self._finalize_and_emit(
                    run_id,
                    workflow._excerpt_fallback_answer(
                        packed_chunks,
                        "contains_only_fallback",
                        retrieval_mode=retrieval_mode,
                        rag_trace=trace_result["rag_trace"],
                    ),
                    conversation_id=conversation_id,
                    question=question,
                    recent_messages=recent_messages,
                    session_memory_context=session_memory_context,
                )

            passages_text = workflow._build_passages(
                packed_chunks,
                expanded_contexts,
                episodic_memory=session_memory_context,
            )
            workflow._check_cancelled(self.host, run_id)
            _emit_rag_progress(
                self.host,
                run_id,
                "generate",
                "running",
                title="\u751f\u6210\u56de\u7b54",
                detail="\u6b63\u5728\u57fa\u4e8e\u68c0\u7d22\u7247\u6bb5\u751f\u6210\u56de\u7b54",
                progress=0.82,
                metrics={"passageCount": packing_summary.get("passageCount", 0)},
            )
            try:
                answer_data = workflow._try_langchain_qa(config, api_key, question, passages_text)
            except Exception as exc:
                if isinstance(exc, workflow.WorkflowCancelled):
                    raise
                _emit_rag_progress(
                    self.host,
                    run_id,
                    "generate",
                    "failed",
                    title="\u751f\u6210\u56de\u7b54",
                    detail="\u6a21\u578b\u751f\u6210\u5931\u8d25\uff0c\u5c06\u8fd4\u56de\u6587\u6863\u6458\u5f55",
                    progress=0.88,
                    metrics={"errorCategory": "model_error"},
                )
                trace_result = self._invoke_tool(
                    "build_rag_trace",
                    {
                        "readiness_status": readiness_status,
                        "retrieval_mode": retrieval_mode,
                        "chunks": packed_chunks,
                        "query_rewrite_used": rewritten_query is not None,
                        "rewrite_summary": rewrite_summary,
                        "merge_summary": merge_summary,
                        "packing_summary": packing_summary,
                        "rerank_summary": rerank_summary,
                        "gate_summary": gate_summary,
                        "second_retrieval_summary": second_retrieval_summary,
                        "audit_summary": workflow._default_audit_summary("clean"),
                        "failure_reason": f"model_error: {exc}",
                    },
                )
                return self._finalize_and_emit(
                    run_id,
                    workflow._excerpt_fallback_answer(
                        packed_chunks,
                        f"model_error: {exc}",
                        retrieval_mode=retrieval_mode,
                        rag_trace=trace_result["rag_trace"],
                    ),
                    conversation_id=conversation_id,
                    question=question,
                    recent_messages=recent_messages,
                    session_memory_context=session_memory_context,
                )

            _emit_rag_progress(
                self.host,
                run_id,
                "generate",
                "completed",
                title="\u751f\u6210\u56de\u7b54",
                detail="\u56de\u7b54\u6587\u672c\u5df2\u751f\u6210",
                progress=0.9,
                metrics={"answerMode": answer_data.get("answerMode")},
            )
            workflow._check_cancelled(self.host, run_id)
            raw_citations = answer_data.get("citations", [])
            _emit_rag_progress(
                self.host,
                run_id,
                "audit",
                "running",
                title="\u6821\u9a8c\u5f15\u7528",
                detail="\u6b63\u5728\u6821\u9a8c\u56de\u7b54\u5f15\u7528\u662f\u5426\u6765\u81ea\u68c0\u7d22\u7247\u6bb5",
                progress=0.92,
                metrics={"citationCount": len(raw_citations) if isinstance(raw_citations, list) else 0},
            )
            audit_result = self._invoke_tool(
                "audit_citations",
                {
                    "raw_citations": raw_citations,
                    "chunks": packed_chunks,
                },
            )
            _emit_rag_progress(
                self.host,
                run_id,
                "audit",
                "completed",
                title="\u6821\u9a8c\u5f15\u7528",
                detail=str((audit_result.get("audit_summary") or {}).get("auditStatus") or "completed"),
                progress=0.96,
                metrics={
                    "validCitations": (audit_result.get("audit_summary") or {}).get("validCitations", 0),
                    "rejectedCitations": (audit_result.get("audit_summary") or {}).get("rejectedCitations", 0),
                },
            )
            trace_result = self._invoke_tool(
                "build_rag_trace",
                {
                    "readiness_status": readiness_status,
                    "retrieval_mode": retrieval_mode,
                    "chunks": packed_chunks,
                    "query_rewrite_used": rewritten_query is not None,
                    "rewrite_summary": rewrite_summary,
                    "merge_summary": merge_summary,
                    "packing_summary": packing_summary,
                    "rerank_summary": rerank_summary,
                    "gate_summary": gate_summary,
                    "second_retrieval_summary": second_retrieval_summary,
                    "audit_summary": audit_result["audit_summary"],
                },
            )

            if answer_data.get("answerMode") == "no_relevant_content":
                return self._finalize_and_emit(
                    run_id,
                    {
                        "status": "completed",
                        "answer": {
                            "answer": str(answer_data.get("answer") or "当前资料中没有足够证据回答这个问题。").strip(),
                            "answerMode": "no_relevant_content",
                            "retrievalMode": retrieval_mode,
                            "retrievalStatus": "no_hits",
                            "citations": [],
                            "ragTrace": trace_result["rag_trace"],
                        },
                    },
                    conversation_id=conversation_id,
                    question=question,
                    recent_messages=recent_messages,
                    session_memory_context=session_memory_context,
                )

            citations = audit_result["citations"]
            if not citations:
                failed_trace = self._invoke_tool(
                    "build_rag_trace",
                    {
                        "readiness_status": readiness_status,
                        "retrieval_mode": retrieval_mode,
                        "chunks": packed_chunks,
                        "query_rewrite_used": rewritten_query is not None,
                        "rewrite_summary": rewrite_summary,
                        "merge_summary": merge_summary,
                        "packing_summary": packing_summary,
                        "rerank_summary": rerank_summary,
                        "gate_summary": gate_summary,
                        "second_retrieval_summary": second_retrieval_summary,
                        "audit_summary": audit_result["audit_summary"],
                        "failure_reason": "citation_audit_failed",
                    },
                )
                return self._finalize_and_emit(
                    run_id,
                    workflow._status_answer(
                        "当前资料中没有足够证据回答这个问题。",
                        "no_hits",
                        retrieval_mode=retrieval_mode,
                        rag_trace=failed_trace["rag_trace"],
                    ),
                    conversation_id=conversation_id,
                    question=question,
                    recent_messages=recent_messages,
                    session_memory_context=session_memory_context,
                )

            if config.get("id"):
                try:
                    self.host.record_workflow_cost(config["id"], workflow.estimate_workflow_cost(config))
                except Exception as exc:
                    logger.warning("Failed to record knowledge QA agent cost: %s", exc)

            return self._finalize_and_emit(
                run_id,
                {
                    "status": "completed",
                    "answer": {
                        "answer": str(answer_data.get("answer") or "").strip(),
                        "answerMode": "grounded",
                        "retrievalMode": retrieval_mode,
                        "retrievalStatus": "ready",
                        "citations": citations,
                        "ragTrace": trace_result["rag_trace"],
                    },
                },
                conversation_id=conversation_id,
                question=question,
                recent_messages=recent_messages,
                session_memory_context=session_memory_context,
            )
        except workflow.WorkflowCancelled:
            raise
        except Exception as exc:
            return self._fallback_to_deterministic(
                run_id,
                question,
                document_ids,
                conversation_id,
                recent_messages=locals().get("recent_messages", []),
                session_memory_context=locals().get("session_memory_context"),
                exc=exc,
            )
