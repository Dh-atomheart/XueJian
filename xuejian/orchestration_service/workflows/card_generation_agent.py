from __future__ import annotations

from dataclasses import dataclass
import logging
import time
from typing import TYPE_CHECKING, Any

from ..tools import TOOL_REGISTRY, ToolInputValidationError, ToolNotRegisteredError

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)


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
        logger.warning("Failed to emit card workflow event for run %s: %s", run_id[:8], exc)


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
        logger.warning("Failed to save card checkpoint for run %s: %s", run_id[:8], exc)


@dataclass
class CardToolInvocation:
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


class CardGenerationAgentRunner:
    def __init__(self, host: HostGatewayClient) -> None:
        self.host = host
        self.agent_trace: list[CardToolInvocation] = []

    def _summarize_input(self, tool_key: str, payload: dict[str, Any]) -> dict[str, Any]:
        if tool_key == "content_map":
            return {"chunkCount": len(payload.get("chunks") or [])}
        if tool_key == "generate_card_candidates":
            return {
                "conceptCount": len(payload.get("concepts") or []),
                "chunkCount": len(payload.get("chunks") or []),
                "density": payload.get("density"),
            }
        if tool_key in {"critique_card_candidates", "dedupe_card_candidates", "audit_card_source_quotes", "submit_card_candidates"}:
            return {"candidateCount": len(payload.get("candidates") or [])}
        return {}

    def _summarize_output(self, tool_key: str, result: dict[str, Any]) -> dict[str, Any]:
        if tool_key == "content_map":
            return {"conceptCount": len(result.get("concepts") or [])}
        if tool_key == "generate_card_candidates":
            return {
                "candidateCount": len(result.get("candidates") or []),
                "discardedCount": result.get("discarded_count"),
            }
        if tool_key == "critique_card_candidates":
            return {"candidateCount": len(result.get("critiqued_candidates") or [])}
        if tool_key == "dedupe_card_candidates":
            return dict(result.get("dedupe_summary") or {})
        if tool_key == "audit_card_source_quotes":
            return dict(result.get("audit_summary") or {})
        if tool_key == "submit_card_candidates":
            return {"submittedCount": result.get("submitted_count")}
        return {}

    def _result_error_category(self, tool_key: str, result: dict[str, Any]) -> str | None:
        if tool_key == "audit_card_source_quotes" and (result.get("failed_candidates") or []):
            return "citation_invalid"
        return None

    def _invoke_tool(self, tool_key: str, payload: dict[str, Any]) -> dict[str, Any]:
        started_at = time.monotonic()
        input_summary = self._summarize_input(tool_key, payload)
        try:
            result = TOOL_REGISTRY.invoke(tool_key, payload, caller="card_generation_agent")
        except ToolNotRegisteredError as exc:
            self.agent_trace.append(
                CardToolInvocation(
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
                CardToolInvocation(
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
                CardToolInvocation(
                    tool_key=tool_key,
                    duration_ms=(time.monotonic() - started_at) * 1000,
                    input_summary=input_summary,
                    output_summary={},
                    error_category="tool_execution_failed",
                )
            )
            raise

        self.agent_trace.append(
            CardToolInvocation(
                tool_key=tool_key,
                duration_ms=(time.monotonic() - started_at) * 1000,
                input_summary=input_summary,
                output_summary=self._summarize_output(tool_key, result),
                error_category=self._result_error_category(tool_key, result),
            )
        )
        return result

    def _emit_completed(self, run_id: str, submitted_count: int, candidate_count: int) -> None:
        _safe_emit_event(
            self.host,
            run_id,
            "completed",
            f"制卡完成，提交 {submitted_count} 张候选",
            progress=1.0,
            payload={
                "submittedCount": submitted_count,
                "candidateCount": candidate_count,
                "toolCount": len(self.agent_trace),
            },
        )

    def run(
        self,
        run_id: str,
        document_id: str,
        *,
        density: str,
        provider_config_id: str,
    ) -> dict[str, Any]:
        document = self.host.get_document(document_id) or {}
        chunks = [
            chunk
            for chunk in (self.host.list_chunks(document_id) or [])
            if isinstance(chunk, dict)
            and str(chunk.get("content") or chunk.get("text") or chunk.get("snippet") or "").strip()
            and chunk.get("chunkKind") in {None, "child"}
        ]
        _safe_emit_event(
            self.host,
            run_id,
            "started",
            "制卡 Agent 开始",
            progress=0.05,
            payload={
                "documentId": document_id,
                "chunkCount": len(chunks),
                "density": density,
            },
        )
        if not chunks:
            _safe_save_checkpoint(
                self.host,
                run_id,
                "card_generation_agent",
                "no_chunks",
                {"documentId": document_id, "chunkCount": 0, "submittedCount": 0},
            )
            self._emit_completed(run_id, 0, 0)
            return {
                "status": "completed",
                "submittedCount": 0,
                "candidates": [],
                "document": {"id": document_id, "title": document.get("title")},
                "agentTrace": [],
            }

        try:
            content_map_result = self._invoke_tool(
                "content_map",
                {"document_id": document_id, "chunks": chunks},
            )
            generated_result = self._invoke_tool(
                "generate_card_candidates",
                {
                    "run_id": run_id,
                    "document_id": document_id,
                    "concepts": content_map_result["concepts"],
                    "chunks": chunks,
                    "density": density,
                    "provider_config_id": provider_config_id,
                    "host_ref": self.host,
                },
            )
            critique_result = self._invoke_tool(
                "critique_card_candidates",
                {"candidates": generated_result["candidates"]},
            )
            dedupe_result = self._invoke_tool(
                "dedupe_card_candidates",
                {"candidates": critique_result["critiqued_candidates"]},
            )
            audit_result = self._invoke_tool(
                "audit_card_source_quotes",
                {"candidates": dedupe_result["deduplicated_candidates"], "chunks": chunks},
            )
            submit_result = self._invoke_tool(
                "submit_card_candidates",
                {
                    "run_id": run_id,
                    "document_id": document_id,
                    "candidates": audit_result["passed_candidates"],
                    "host_ref": self.host,
                },
            )
            _safe_save_checkpoint(
                self.host,
                run_id,
                "card_generation_agent",
                "submitted_candidates",
                {
                    "documentId": document_id,
                    "submittedCount": submit_result["submitted_count"],
                    "candidateCount": len(audit_result["passed_candidates"]),
                    "discardedCount": len(dedupe_result["discarded_candidates"] + audit_result["failed_candidates"]),
                },
            )
            self._emit_completed(
                run_id,
                submit_result["submitted_count"],
                len(audit_result["passed_candidates"]),
            )
            return {
                "status": "completed",
                "submittedCount": submit_result["submitted_count"],
                "candidates": audit_result["passed_candidates"],
                "discardedCandidates": dedupe_result["discarded_candidates"] + audit_result["failed_candidates"],
                "document": {"id": document_id, "title": document.get("title")},
                "agentTrace": [item.to_payload() for item in self.agent_trace],
            }
        except Exception as exc:
            logger.warning("Card generation agent failed: %s", exc)
            _safe_emit_event(
                self.host,
                run_id,
                "failed",
                str(exc),
                progress=1.0,
                payload={"documentId": document_id, "toolCount": len(self.agent_trace)},
            )
            return {
                "status": "failed",
                "error": str(exc),
                "submittedCount": 0,
                "candidates": [],
                "document": {"id": document_id, "title": document.get("title")},
                "agentTrace": [item.to_payload() for item in self.agent_trace],
            }