#!/usr/bin/env python3
"""XueJian orchestration service — HTTP server entry point.

This module is the thin server shell. All business logic lives in submodules:
- clients/   — HostGatewayClient
- providers/  — model runtime helpers
- workflows/  — card_generation, knowledge_qa
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .clients.host_gateway import HostGatewayClient
from .logging_config import configure_logging

configure_logging()
logger = logging.getLogger(__name__)

PROTOCOL_VERSION = "xuejian-orchestration/v1"
SERVICE_VERSION = "0.4.0"

# ── HTTP Server ────────────────────────────────────────────

_host_gateway: HostGatewayClient | None = None


def _string_list(value: object) -> list[str]:
    if isinstance(value, str):
        text = value.strip()
        return [text] if text else []
    if isinstance(value, list):
        return [item.strip() for item in value if isinstance(item, str) and item.strip()]
    return []


def _int_or_zero(value: object) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _resolve_agent_task_model(host: HostGatewayClient, provider_config_id: str | None) -> tuple[dict, str, str]:
    if provider_config_id:
        get_config = getattr(host, "get_config", None)
        config = get_config(provider_config_id) if callable(get_config) else None
        if not config or not config.get("isEnabled", True):
            return {}, "", str(provider_config_id)
        get_api_key = getattr(host, "get_api_key", None)
        api_key = "" if config.get("authMode") == "adc" or not callable(get_api_key) else get_api_key(provider_config_id)
        return config, api_key, str(provider_config_id)

    get_config_for_workflow = getattr(host, "get_config_for_workflow", None)
    if not callable(get_config_for_workflow):
        return {}, "", ""
    for workflow_type in ("agent_task", "multi_agent", "card_generation"):
        resolved = get_config_for_workflow(workflow_type)
        if resolved:
            config, api_key = resolved
            return config, api_key, str(config.get("id") or "")
    return {}, "", ""


def _classify_workflow_exception(exc: Exception) -> str:
    message = str(exc).casefold()
    if "timeout" in message or "timed out" in message:
        return "provider_timeout"
    if "json" in message:
        return "provider_invalid_json"
    if "validation" in message or "field required" in message or "extra inputs" in message:
        return "provider_validation_failed"
    if "host gateway" in message or "host" in message:
        return "host_gateway_error"
    return "workflow_exception"


def _quality_envelope_for_error(error_category: str) -> dict:
    return {
        "groundingStatus": "not_applicable",
        "auditStatus": "failed",
        "confidence": 0.0,
        "riskLevel": "high",
        "reviewRequired": True,
        "blockingReasons": [error_category],
    }


def _failed_card_graph_payload(run_id: str, exc: Exception) -> dict:
    error_category = _classify_workflow_exception(exc)
    return {
        "runtime": "langgraph_card",
        "graphVersion": "card-graph-v1",
        "fallbackUsed": False,
        "status": "failed",
        "summary": f"CardGraph failed before cards could be created: {error_category}.",
        "submittedCount": 0,
        "cardArtifactRefs": {},
        "artifactRefs": {"card_candidate": [], "formal_card_write": [], "trace": []},
        "createdCardIds": [],
        "qualityEnvelope": _quality_envelope_for_error(error_category),
        "errorCategory": error_category,
        "candidates": [],
        "discardedCandidates": [],
        "artifacts": {},
        "writeResponse": {},
    }


def _failed_supervisor_payload(run_id: str, exc: Exception) -> dict:
    error_category = _classify_workflow_exception(exc)
    return {
        "runtime": "langgraph_multi_agent",
        "graphVersion": "supervisor-graph-v1",
        "fallbackUsed": False,
        "status": "failed",
        "summary": f"Supervisor failed before completing the task: {error_category}.",
        "artifactRefs": {"trace": []},
        "qualityEnvelope": _quality_envelope_for_error(error_category),
        "errorCategory": error_category,
        "decisionRecords": [],
        "budgetCounters": {},
        "artifacts": {},
    }


def _failed_knowledge_qa_payload(run_id: str, exc: Exception) -> dict:
    error_category = _classify_workflow_exception(exc)
    quality = _quality_envelope_for_error(error_category)
    return {
        "runtime": "langgraph_rag",
        "graphVersion": "knowledge-graph-v1",
        "fallbackUsed": False,
        "status": "failed",
        "summary": f"Knowledge QA failed before an answer could be produced: {error_category}.",
        "answer": {
            "answer": "",
            "answerMode": "no_relevant_content",
            "retrievalMode": "hybrid",
            "retrievalStatus": error_category,
            "citations": [],
            "ragTrace": {
                "failureReason": error_category,
                "runtime": "langgraph_rag",
                "graphVersion": "knowledge-graph-v1",
            },
            "queryEmbeddingStatus": error_category,
        },
        "artifactRefs": {"evidence": [], "answer": "", "trace": [f"knowledge-qa://runs/{run_id}/trace"]},
        "qualityEnvelope": quality,
        "errorCategory": error_category,
        "artifacts": {
            f"knowledge-qa://runs/{run_id}/trace": {
                "artifactType": "trace",
                "createdBy": "langgraph_rag",
                "summary": str(exc)[:240],
                "qualityEnvelope": quality,
                "errorCategory": error_category,
            }
        },
    }


def _failed_animation_payload(run_id: str, exc: Exception) -> dict:
    error_category = _classify_workflow_exception(exc)
    return {
        "status": "failed",
        "runtime": "card_animation",
        "graphVersion": "card-animation-v1",
        "fallbackUsed": False,
        "scriptJson": None,
        "videoPath": None,
        "posterPath": None,
        "renderLogPath": None,
        "errorCode": error_category,
        "errorMessage": f"Card animation workflow failed: {error_category}.",
        "errorCategory": error_category,
        "qualityEnvelope": _quality_envelope_for_error(error_category),
        "retryable": True,
    }


def _failed_podcast_payload(run_id: str, exc: Exception) -> dict:
    error_category = _classify_workflow_exception(exc)
    return {
        "status": "failed",
        "runtime": "podcast_generation",
        "graphVersion": "podcast-generation-v1",
        "fallbackUsed": False,
        "scriptJson": None,
        "outlineJson": None,
        "evaluationJson": None,
        "audioPath": None,
        "durationMs": 0,
        "currentStage": 0,
        "completedSegments": 0,
        "totalSegments": 0,
        "errorCode": error_category,
        "errorMessage": f"Podcast workflow failed: {error_category}.",
        "errorCategory": error_category,
        "qualityEnvelope": _quality_envelope_for_error(error_category),
    }


def _failed_ai_card_payload(exc: Exception) -> dict:
    error_category = _classify_workflow_exception(exc)
    return {
        "status": "failed",
        "cards": [],
        "discardedCount": 0,
        "error": str(exc),
        "errorCategory": error_category,
        "qualityEnvelope": _quality_envelope_for_error(error_category),
    }


def build_handler(start_time: float):
    class Handler(BaseHTTPRequestHandler):
        server_version = "XueJianOrchestration/0.3"
        protocol_version = "HTTP/1.1"

        def log_message(self, format: str, *args) -> None:  # noqa: A003
            return

        def _write_json(self, status_code: int, payload: dict) -> None:
            self._last_status_code = status_code
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _request_id(self) -> str:
            return self.headers.get("X-Request-Id") or uuid.uuid4().hex

        def _log_request(self, request_id: str, started_at: float) -> None:
            status_code = getattr(self, "_last_status_code", 0)
            level = logging.ERROR if status_code >= 500 else logging.INFO
            logger.log(
                level,
                "HTTP %s %s -> %s",
                self.command,
                self.path,
                status_code,
                extra={
                    "request_id": request_id,
                    "path": self.path,
                    "duration_ms": round((time.monotonic() - started_at) * 1000, 3),
                },
            )

        def _read_body(self) -> bytes:
            length = int(self.headers.get("Content-Length", 0))
            return self.rfile.read(length) if length > 0 else b""

        def do_GET(self) -> None:  # noqa: N802
            request_id = self._request_id()
            started_at = time.monotonic()
            try:
                if self.path == "/health":
                    self._write_json(
                        200,
                        {
                            "status": "healthy",
                            "protocolVersion": PROTOCOL_VERSION,
                            "serviceVersion": SERVICE_VERSION,
                            "pid": os.getpid(),
                            "uptimeSeconds": round(time.monotonic() - start_time, 3),
                        },
                    )
                    return

                if self.path == "/handshake":
                    self._write_json(
                        200,
                        {
                            "protocolVersion": PROTOCOL_VERSION,
                            "serviceVersion": SERVICE_VERSION,
                            "service": "python-orchestration",
                            "capabilities": [
                                "health-check",
                                "preset-workflows",
                                "card-generation",
                                "ai-card-generation",
                                "agent-card-generation",
                                "agent-task",
                                "card-animation",
                                "podcast-generation",
                                "document-parse",
                                "document-embedding",
                                "knowledge-qa",
                                "ragas-evaluation",
                                "anki-export",
                                "anki-import",
                                "annotated-pdf-export",
                            ],
                        },
                    )
                    return

                self._write_json(404, {"error": "not_found"})
            except Exception:
                logger.exception("Unhandled GET request error", extra={"request_id": request_id, "path": self.path})
                self._write_json(500, {"error": "internal_server_error"})
            finally:
                self._log_request(request_id, started_at)

        def do_POST(self) -> None:  # noqa: N802
            request_id = self._request_id()
            started_at = time.monotonic()
            try:
                if self.path == "/workflows/card-generation":
                    self._handle_card_generation()
                    return

                if self.path == "/workflows/ai-card-generation":
                    self._handle_ai_card_generation()
                    return

                if self.path == "/workflows/agent-card-generation":
                    self._handle_agent_card_generation()
                    return

                if self.path == "/workflows/agent-task":
                    self._handle_agent_task()
                    return

                if self.path == "/workflows/agent-task/pause":
                    self._handle_agent_task_pause()
                    return

                if self.path == "/workflows/agent-task/resume":
                    self._handle_agent_task_resume()
                    return

                if self.path == "/workflows/agent-task/cancel":
                    self._handle_agent_task_cancel()
                    return

                if self.path == "/workflows/agent-task/continue":
                    self._handle_agent_task_continue()
                    return

                if self.path == "/workflows/card-animation":
                    self._handle_card_animation()
                    return

                if self.path == "/workflows/podcast":
                    self._handle_podcast()
                    return

                if self.path == "/workflows/document-parse":
                    self._handle_document_parse()
                    return

                if self.path == "/workflows/document-embedding":
                    self._handle_document_embedding()
                    return

                if self.path == "/workflows/knowledge-qa":
                    self._handle_knowledge_qa()
                    return

                if self.path == "/evals/ragas-knowledge-qa":
                    self._handle_ragas_knowledge_qa_eval()
                    return

                if self.path == "/evals/cardgraph-quality":
                    self._handle_cardgraph_quality_eval()
                    return

                if self.path == "/evals/studygraph-recommendation":
                    self._handle_studygraph_recommendation_eval()
                    return

                if self.path == "/evals/supervisor-golden-tasks":
                    self._handle_supervisor_golden_tasks_eval()
                    return

                if self.path == "/evals/regression-suite":
                    self._handle_regression_suite()
                    return

                if self.path == "/exports/apkg":
                    self._handle_export_apkg()
                    return

                if self.path == "/exports/annotated-pdf":
                    self._handle_export_annotated_pdf()
                    return

                if self.path == "/imports/apkg":
                    self._handle_import_apkg()
                    return

                self._write_json(404, {"error": "not_found"})
            except Exception:
                logger.exception("Unhandled POST request error", extra={"request_id": request_id, "path": self.path})
                self._write_json(500, {"error": "internal_server_error"})
            finally:
                self._log_request(request_id, started_at)

        def _handle_card_generation(self) -> None:
            if _host_gateway is None:
                self._write_json(503, {"error": "host_gateway_unavailable"})
                return

            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"error": "invalid_json"})
                return

            run_id = body.get("runId")
            document_id = body.get("documentId")
            max_candidates = int(body.get("maxCandidates", 24))

            if not run_id or not document_id:
                self._write_json(400, {"error": "missing runId or documentId"})
                return

            logger.info(
                "Starting card generation: run=%s doc=%s max=%d",
                run_id[:8], document_id[:8], max_candidates,
            )
            try:
                from .workflows.card_generation import run_card_generation_workflow

                result = run_card_generation_workflow(
                    run_id, document_id, max_candidates, _host_gateway,
                )
                self._write_json(200, result)
            except Exception as exc:
                logger.error("Card generation workflow failed: %s", exc, exc_info=True)
                self._write_json(200, _failed_ai_card_payload(exc))

        def _handle_ai_card_generation(self) -> None:
            if _host_gateway is None:
                self._write_json(503, {"status": "failed", "error": "host_gateway_unavailable"})
                return

            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"status": "failed", "error": "invalid_json"})
                return

            job_id = body.get("jobId")
            document_id = body.get("documentId")
            group_id = body.get("groupId")
            density = body.get("density", "medium")
            provider_config_id = body.get("providerConfigId")
            checkpoint = body.get("checkpoint")
            chunk = body.get("chunk")

            if not job_id or not document_id or not group_id or not provider_config_id:
                self._write_json(
                    400,
                    {
                        "status": "failed",
                        "error": "missing jobId, documentId, groupId or providerConfigId",
                    },
                )
                return

            try:
                from .workflows.litellm_card_generation import (
                    JobCancelled,
                    WorkflowError,
                    generate_chunk_cards,
                    run_litellm_card_generation,
                )
            except Exception as exc:
                logger.error("AI card generation workflow failed to load: %s", exc, exc_info=True)
                self._write_json(200, _failed_ai_card_payload(exc))
                return

            try:
                page_start = body.get("pageStart")
                page_end = body.get("pageEnd")
                if isinstance(chunk, dict):
                    result = generate_chunk_cards(
                        job_id=job_id,
                        document_id=document_id,
                        group_id=group_id,
                        density=str(density),
                        provider_config_id=provider_config_id,
                        chunk=chunk,
                        host=_host_gateway,
                    )
                    self._write_json(200, result)
                    return

                result = run_litellm_card_generation(
                    job_id=job_id,
                    document_id=document_id,
                    group_id=group_id,
                    page_start=int(page_start) if page_start is not None else None,
                    page_end=int(page_end) if page_end is not None else None,
                    density=str(density),
                    provider_config_id=provider_config_id,
                    checkpoint=checkpoint if isinstance(checkpoint, dict) else None,
                    host=_host_gateway,
                )
                self._write_json(
                    200,
                    {
                        "status": "ok",
                        "cards": [
                            card.model_dump(by_alias=True)
                            for card in result.cards
                        ],
                        "discardedCount": result.discarded_count,
                    },
                )
            except JobCancelled:
                self._write_json(200, {"status": "cancelled", "cards": [], "discardedCount": 0})
            except WorkflowError as exc:
                self._write_json(200, {"status": "failed", "error": str(exc)})
            except Exception as exc:
                logger.error("AI card generation workflow failed: %s", exc, exc_info=True)
                self._write_json(200, _failed_ai_card_payload(exc))

        def _handle_agent_card_generation(self) -> None:
            if _host_gateway is None:
                self._write_json(503, {"status": "failed", "error": "host_gateway_unavailable"})
                return

            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"status": "failed", "error": "invalid_json"})
                return

            run_id = body.get("runId")
            document_id = body.get("documentId")
            document_ids = _string_list(body.get("documentIds")) or ([str(document_id)] if document_id else [])
            source_chunk_ids = _string_list(body.get("sourceChunkIds"))
            evidence_artifact_refs = _string_list(body.get("evidenceArtifactRefs"))
            evidence_artifacts = body.get("evidenceArtifacts") or []
            density = str(body.get("density") or "medium")
            difficulty = str(body.get("difficulty") or density)
            write_mode = str(body.get("writeMode") or "candidate")
            card_count_hint = _int_or_zero(body.get("cardCountHint") or body.get("maxCandidates"))
            provider_config_id = body.get("providerConfigId")

            if not run_id or not document_ids or not provider_config_id:
                self._write_json(
                    400,
                    {
                        "status": "failed",
                        "error": "missing runId, documentId/documentIds or providerConfigId",
                    },
                )
                return

            logger.info(
                "Starting agent card generation: run=%s doc=%s density=%s",
                run_id[:8],
                str(document_ids[0])[:8],
                density,
            )
            try:
                from .graphs.card_graph import CardGraphRunner

                result = CardGraphRunner(_host_gateway).run(
                    str(run_id),
                    document_ids=document_ids,
                    source_chunk_ids=source_chunk_ids,
                    evidence_artifact_refs=evidence_artifact_refs,
                    evidence_artifacts=[item for item in evidence_artifacts if isinstance(item, dict)],
                    card_count_hint=card_count_hint,
                    difficulty=difficulty,
                    write_mode=write_mode,
                    provider_config_id=str(provider_config_id),
                )
                self._write_json(200, result)
            except Exception as exc:
                logger.error("Agent card generation workflow failed: %s", exc, exc_info=True)
                self._write_json(200, _failed_card_graph_payload(str(run_id or ""), exc))

        def _handle_agent_task(self) -> None:
            if _host_gateway is None:
                self._write_json(503, {"status": "failed", "error": "host_gateway_unavailable"})
                return

            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"status": "failed", "error": "invalid_json"})
                return

            run_id = str(body.get("runId") or "").strip()
            task_type = str(body.get("taskType") or "").strip()
            user_request = str(body.get("userRequest") or "").strip()
            document_ids = _string_list(body.get("documentIds"))
            card_group_ids = _string_list(body.get("cardGroupIds"))
            options = body.get("options") if isinstance(body.get("options"), dict) else {}

            if not run_id or not user_request:
                self._write_json(400, {"status": "failed", "error": "missing runId or userRequest"})
                return

            try:
                provider_config_id = str(options.get("providerConfigId") or "").strip()
                planner_config, planner_api_key, resolved_provider_config_id = _resolve_agent_task_model(
                    _host_gateway,
                    provider_config_id or None,
                )

                from .graphs.supervisor_graph import SupervisorGraphRunner

                result = SupervisorGraphRunner(_host_gateway).run(
                    run_id,
                    task_type=task_type,
                    user_request=user_request,
                    document_ids=document_ids,
                    card_group_ids=card_group_ids,
                    options=options,
                    provider_config_id=resolved_provider_config_id,
                    planner_config=planner_config,
                    planner_api_key=planner_api_key,
                )
                self._write_json(200, result)
            except Exception as exc:
                logger.error("Agent task workflow failed: %s", exc, exc_info=True)
                self._write_json(200, _failed_supervisor_payload(run_id, exc))

        def _handle_agent_task_pause(self) -> None:
            if _host_gateway is None:
                self._write_json(503, {"status": "failed", "error": "host_gateway_unavailable"})
                return
            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"status": "failed", "error": "invalid_json"})
                return
            run_id = str(body.get("runId") or "").strip()
            if not run_id:
                self._write_json(400, {"status": "failed", "error": "missing runId"})
                return
            try:
                # Phase 10: pause is handled by the Rust host command layer.
                # The Python endpoint only needs to acknowledge because the
                # orchestration service itself does not hold in-memory state.
                self._write_json(200, {"status": "paused", "runId": run_id})
            except Exception as exc:
                logger.error("Agent task pause failed: %s", exc, exc_info=True)
                self._write_json(200, {"status": "failed", "error": str(exc)})

        def _handle_agent_task_resume(self) -> None:
            if _host_gateway is None:
                self._write_json(503, {"status": "failed", "error": "host_gateway_unavailable"})
                return
            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"status": "failed", "error": "invalid_json"})
                return
            run_id = str(body.get("runId") or "").strip()
            user_request = str(body.get("userRequest") or "").strip()
            if not run_id or not user_request:
                self._write_json(400, {"status": "failed", "error": "missing runId or userRequest"})
                return
            document_ids = _string_list(body.get("documentIds"))
            card_group_ids = _string_list(body.get("cardGroupIds"))
            options = body.get("options") if isinstance(body.get("options"), dict) else {}
            try:
                provider_config_id = str(options.get("providerConfigId") or "").strip()
                planner_config, planner_api_key, resolved_provider_config_id = _resolve_agent_task_model(
                    _host_gateway,
                    provider_config_id or None,
                )
                from .graphs.supervisor_graph import SupervisorGraphRunner
                result = SupervisorGraphRunner(_host_gateway).run_from_checkpoint(
                    run_id,
                    task_type=body.get("taskType") or "compound_study_task",
                    user_request=user_request,
                    document_ids=document_ids,
                    card_group_ids=card_group_ids,
                    options=options,
                    provider_config_id=resolved_provider_config_id,
                    planner_config=planner_config,
                    planner_api_key=planner_api_key,
                )
                self._write_json(200, result)
            except Exception as exc:
                logger.error("Agent task resume failed: %s", exc, exc_info=True)
                self._write_json(200, _failed_supervisor_payload(run_id, exc))

        def _handle_agent_task_cancel(self) -> None:
            if _host_gateway is None:
                self._write_json(503, {"status": "failed", "error": "host_gateway_unavailable"})
                return
            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"status": "failed", "error": "invalid_json"})
                return
            run_id = str(body.get("runId") or "").strip()
            if not run_id:
                self._write_json(400, {"status": "failed", "error": "missing runId"})
                return
            try:
                _host_gateway.cancel_run(run_id)
                self._write_json(200, {"status": "cancelled", "runId": run_id})
            except Exception as exc:
                logger.error("Agent task cancel failed: %s", exc, exc_info=True)
                self._write_json(200, {"status": "failed", "error": str(exc)})

        def _handle_agent_task_continue(self) -> None:
            if _host_gateway is None:
                self._write_json(503, {"status": "failed", "error": "host_gateway_unavailable"})
                return
            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"status": "failed", "error": "invalid_json"})
                return
            run_id = str(body.get("runId") or "").strip()
            user_request = str(body.get("userRequest") or "").strip()
            parent_run_id = str(body.get("parentRunId") or "").strip()
            follow_up_message = str(body.get("followUpMessage") or "").strip()
            if not run_id or not user_request:
                self._write_json(400, {"status": "failed", "error": "missing runId or userRequest"})
                return
            document_ids = _string_list(body.get("documentIds"))
            card_group_ids = _string_list(body.get("cardGroupIds"))
            options = body.get("options") if isinstance(body.get("options"), dict) else {}
            try:
                provider_config_id = str(options.get("providerConfigId") or "").strip()
                planner_config, planner_api_key, resolved_provider_config_id = _resolve_agent_task_model(
                    _host_gateway,
                    provider_config_id or None,
                )
                from .graphs.supervisor_graph import SupervisorGraphRunner
                result = SupervisorGraphRunner(_host_gateway).run(
                    run_id,
                    task_type=body.get("taskType") or "compound_study_task",
                    user_request=user_request,
                    document_ids=document_ids,
                    card_group_ids=card_group_ids,
                    options=options,
                    provider_config_id=resolved_provider_config_id,
                    planner_config=planner_config,
                    planner_api_key=planner_api_key,
                    parent_run_id=parent_run_id,
                    follow_up_message=follow_up_message,
                )
                self._write_json(200, result)
            except Exception as exc:
                logger.error("Agent task continue failed: %s", exc, exc_info=True)
                self._write_json(200, _failed_supervisor_payload(run_id, exc))

        def _handle_card_animation(self) -> None:
            if _host_gateway is None:
                self._write_json(503, _failed_animation_payload("", RuntimeError("host_gateway_unavailable")))
                return

            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"status": "failed", "error": "invalid_json"})
                return

            run_id = str(body.get("runId") or "").strip()
            card_id = str(body.get("cardId") or "").strip()
            front = str(body.get("front") or "").strip()
            back = str(body.get("back") or "").strip()
            tags = _string_list(body.get("tags"))
            anim_type = str(body.get("animType") or "flashcard_reveal").strip()
            mode = str(body.get("mode") or "quick_preview").strip()

            if not run_id or not card_id or not front or not back:
                self._write_json(
                    400,
                    {
                        "status": "failed",
                        "error": "missing runId, cardId, front or back",
                    },
                )
                return

            try:
                from .workflows.card_animation import run_card_animation_workflow

                result = run_card_animation_workflow(
                    run_id,
                    card_id,
                    front,
                    back,
                    tags,
                    anim_type,
                    mode,
                    _host_gateway,
                )
                self._write_json(200, result)
            except Exception as exc:
                logger.error("Card animation workflow failed: %s", exc, exc_info=True)
                self._write_json(200, _failed_animation_payload(run_id, exc))

        def _handle_podcast(self) -> None:
            if _host_gateway is None:
                self._write_json(503, _failed_podcast_payload("", RuntimeError("host_gateway_unavailable")))
                return

            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"status": "failed", "error": "invalid_json"})
                return

            run_id = str(body.get("runId") or "").strip()
            episode_id = str(body.get("episodeId") or "").strip()
            title = str(body.get("title") or "").strip()
            document_ids = _string_list(body.get("documentIds"))
            prompt = str(body.get("prompt") or "").strip()
            style = str(body.get("style") or "interview").strip()
            language = str(body.get("language") or "zh-CN").strip()
            duration_tier = str(body.get("durationTier") or "medium").strip()
            tts_provider = str(body.get("ttsProvider") or "auto").strip()
            audio_format = str(body.get("audioFormat") or "mp3").strip()

            if not run_id or not episode_id or not document_ids:
                self._write_json(
                    400,
                    {
                        "status": "failed",
                        "error": "missing runId, episodeId or documentIds",
                    },
                )
                return

            try:
                from .workflows.podcast import run_podcast_workflow

                result = run_podcast_workflow(
                    run_id,
                    episode_id,
                    title,
                    document_ids,
                    prompt,
                    style,
                    language,
                    duration_tier,
                    tts_provider,
                    audio_format,
                    _host_gateway,
                )
                self._write_json(200, result)
            except Exception as exc:
                logger.error("Podcast workflow failed: %s", exc, exc_info=True)
                self._write_json(200, _failed_podcast_payload(run_id, exc))

        def _handle_document_parse(self) -> None:
            if _host_gateway is None:
                self._write_json(503, {"error": "host_gateway_unavailable"})
                return

            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"error": "invalid_json"})
                return

            run_id = body.get("runId", "")
            document_id = body.get("documentId")

            if not document_id:
                self._write_json(400, {"error": "missing documentId"})
                return

            logger.info(
                "Starting document parse: run=%s doc=%s",
                run_id[:8] if run_id else "none", document_id[:8],
            )
            try:
                from .parsing.docling_pipeline import run_document_parse_workflow

                result = run_document_parse_workflow(
                    run_id, document_id, _host_gateway,
                )
                self._write_json(200, result)
            except Exception as exc:
                logger.error("Document parse workflow failed: %s", exc, exc_info=True)
                self._write_json(
                    200,
                    {
                        "status": "failed",
                        "error": str(exc),
                        "errorCategory": _classify_workflow_exception(exc),
                        "qualityEnvelope": _quality_envelope_for_error(_classify_workflow_exception(exc)),
                    },
                )

        def _handle_document_embedding(self) -> None:
            if _host_gateway is None:
                self._write_json(503, {"error": "host_gateway_unavailable"})
                return

            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"error": "invalid_json"})
                return

            run_id = body.get("runId", "")
            document_id = body.get("documentId")

            if not document_id:
                self._write_json(400, {"error": "missing documentId"})
                return

            logger.info(
                "Starting document embedding: run=%s doc=%s",
                run_id[:8] if run_id else "none", document_id[:8],
            )
            try:
                from .workflows.document_embedding import run_document_embedding_workflow

                result = run_document_embedding_workflow(
                    run_id, document_id, _host_gateway,
                )
                self._write_json(200, result)
            except Exception as exc:
                logger.error("Document embedding workflow failed: %s", exc, exc_info=True)
                self._write_json(
                    200,
                    {
                        "status": "failed",
                        "error": str(exc),
                        "errorCategory": _classify_workflow_exception(exc),
                        "qualityEnvelope": _quality_envelope_for_error(_classify_workflow_exception(exc)),
                    },
                )

        def _handle_knowledge_qa(self) -> None:
            if _host_gateway is None:
                self._write_json(503, {"error": "host_gateway_unavailable"})
                return

            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"error": "invalid_json"})
                return

            run_id = body.get("runId")
            question = body.get("question", "").strip()
            document_ids = body.get("documentIds") or []
            conversation_id = body.get("conversationId")

            if not run_id or not question:
                self._write_json(400, {"error": "missing runId or question"})
                return

            logger.info(
                "Starting knowledge QA: run=%s question=%s docs=%d",
                run_id[:8], question[:40], len(document_ids),
            )
            runtime = str(os.getenv("XUEJIAN_AGENT_RUNTIME", "langgraph_rag") or "langgraph_rag").strip().lower()
            try:
                if runtime in {"langgraph", "langgraph_rag"}:
                    from .graphs.knowledge_graph import KnowledgeGraphRunner

                    result = KnowledgeGraphRunner(_host_gateway).run(
                        run_id,
                        question,
                        document_ids,
                        conversation_id=conversation_id,
                    )
                    self._write_json(200, result)
                    return

                if runtime == "agent":
                    logger.error("Deprecated knowledge QA runtime 'agent' is no longer supported")
                    self._write_json(
                        400,
                        {
                            "error": (
                                "runtime 'agent' has been removed; use XUEJIAN_AGENT_RUNTIME=langgraph_rag"
                            )
                        },
                    )
                    return

                logger.error("Unsupported knowledge QA runtime: %s", runtime)
                self._write_json(
                    400,
                    {
                        "error": f"unsupported knowledge QA runtime: {runtime}",
                        "supportedRuntime": "langgraph_rag",
                    },
                )
                return
            except Exception as exc:
                logger.error("Knowledge QA workflow failed: %s", exc, exc_info=True)
                self._write_json(200, _failed_knowledge_qa_payload(str(run_id or ""), exc))

        def _handle_ragas_knowledge_qa_eval(self) -> None:
            """POST /evals/ragas-knowledge-qa - run offline Ragas diagnostics.

            This endpoint is intended for local development. It runs inside the
            Python sidecar so it can reuse the already configured HostGatewayClient
            and does not expose the host gateway token to the caller.
            """
            if _host_gateway is None:
                self._write_json(503, {"status": "failed", "error": "host_gateway_unavailable"})
                return

            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"status": "failed", "error": "invalid_json"})
                return

            document_ids = body.get("documentIds") or body.get("document_ids") or ""
            if isinstance(document_ids, list):
                document_ids_arg = ",".join(str(item) for item in document_ids)
            else:
                document_ids_arg = str(document_ids)

            from .evals.ragas_knowledge_qa_eval import DEFAULT_SIZE

            size = int(body.get("size") or DEFAULT_SIZE)
            output_dir = body.get("out") or body.get("outputDir")
            cache_dir = body.get("cacheDir") or body.get("cache_dir") or "test-results/ragas/datasets"
            refresh_dataset = bool(body.get("refreshDataset") or body.get("refresh_dataset") or False)
            max_chunk_chars = int(body.get("maxChunkChars") or body.get("max_chunk_chars") or 1800)

            try:
                from argparse import Namespace
                from .evals.ragas_knowledge_qa_eval import run_with_host

                result_dir = run_with_host(
                    _host_gateway,
                    Namespace(
                        document_ids=document_ids_arg,
                        size=size,
                        out=str(output_dir) if output_dir else None,
                        cache_dir=str(cache_dir),
                        refresh_dataset=refresh_dataset,
                        max_chunk_chars=max_chunk_chars,
                        gateway_url="",
                    ),
                )
                self._write_json(
                    200,
                    {
                        "status": "ok",
                        "outputDir": str(result_dir),
                        "summaryPath": str(result_dir / "summary.md"),
                        "scoresPath": str(result_dir / "scores.csv"),
                        "rawResultsPath": str(result_dir / "raw_results.json"),
                        "datasetPath": str(result_dir / "dataset.jsonl"),
                    },
                )
            except Exception as exc:
                logger.error("Ragas Knowledge QA evaluation failed: %s", exc, exc_info=True)
                self._write_json(
                    200,
                    {
                        "status": "failed",
                        "error": str(exc),
                        "errorCategory": _classify_workflow_exception(exc),
                        "qualityEnvelope": _quality_envelope_for_error(_classify_workflow_exception(exc)),
                    },
                )

        def _handle_cardgraph_quality_eval(self) -> None:
            """POST /evals/cardgraph-quality — run CardGraph quality regression eval."""
            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"status": "failed", "error": "invalid_json"})
                return

            try:
                from .evals.cardgraph_quality_eval import run_all_cases
                from .evals.regression_report import run_regression

                suite = run_all_cases()
                output_dir_str = body.get("out") or body.get("outputDir")
                output_dir = Path(output_dir_str) if output_dir_str else None
                payload = run_regression(
                    suites=[suite],
                    runtime="langgraph_card",
                    graph_version=suite.graph_version,
                    output_dir=output_dir,
                )
                self._write_json(200, {"status": "ok", "report": payload})
            except Exception as exc:
                logger.error("CardGraph quality eval failed: %s", exc, exc_info=True)
                self._write_json(500, {"status": "failed", "error": str(exc)})

        def _handle_studygraph_recommendation_eval(self) -> None:
            """POST /evals/studygraph-recommendation — run StudyGraph regression eval."""
            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"status": "failed", "error": "invalid_json"})
                return

            try:
                from .evals.regression_report import run_regression
                from .evals.studygraph_recommendation_eval import run_all_cases

                suite = run_all_cases()
                output_dir_str = body.get("out") or body.get("outputDir")
                output_dir = Path(output_dir_str) if output_dir_str else None
                payload = run_regression(
                    suites=[suite],
                    runtime="langgraph_study",
                    graph_version=suite.graph_version,
                    output_dir=output_dir,
                )
                self._write_json(200, {"status": "ok", "report": payload})
            except Exception as exc:
                logger.error("StudyGraph recommendation eval failed: %s", exc, exc_info=True)
                self._write_json(500, {"status": "failed", "error": str(exc)})

        def _handle_supervisor_golden_tasks_eval(self) -> None:
            """POST /evals/supervisor-golden-tasks — run Supervisor regression eval."""
            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"status": "failed", "error": "invalid_json"})
                return

            try:
                from .evals.regression_report import run_regression
                from .evals.supervisor_golden_tasks_eval import run_all_cases

                suite = run_all_cases()
                output_dir_str = body.get("out") or body.get("outputDir")
                output_dir = Path(output_dir_str) if output_dir_str else None
                payload = run_regression(
                    suites=[suite],
                    runtime="langgraph_multi_agent",
                    graph_version=suite.graph_version,
                    output_dir=output_dir,
                )
                self._write_json(200, {"status": "ok", "report": payload})
            except Exception as exc:
                logger.error("Supervisor golden tasks eval failed: %s", exc, exc_info=True)
                self._write_json(500, {"status": "failed", "error": str(exc)})

        def _handle_regression_suite(self) -> None:
            """POST /evals/regression-suite — run all four eval suites and return unified report."""
            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"status": "failed", "error": "invalid_json"})
                return

            try:
                from .evals.regression_report import run_all_eval_suites, run_regression

                suites = run_all_eval_suites()
                output_dir_str = body.get("out") or body.get("outputDir")
                output_dir = Path(output_dir_str) if output_dir_str else None
                payload = run_regression(
                    suites=suites,
                    runtime="xuejian-orchestration",
                    graph_version="v1",
                    output_dir=output_dir,
                )
                self._write_json(
                    200,
                    {
                        "status": "blocked" if payload.get("blockingFailureCount", 0) else "passed",
                        "report": payload,
                    },
                )
            except Exception as exc:
                logger.error("Regression suite failed: %s", exc, exc_info=True)
                self._write_json(500, {"status": "failed", "error": str(exc)})

        def _handle_export_apkg(self) -> None:
            """POST /exports/apkg — export cards to an Anki .apkg file.

            Request body:
              outputPath  str   required — absolute path where the .apkg should be written
              deckName    str   optional — Anki deck name (default: "XueJian Export")
              documentId  str   optional — filter to cards from this document
              groupId     str   optional — filter to cards from this group

            Response:
              200 { deckName, cardCount, outputPath, exportedAt }
              400 missing outputPath
              500 genanki not installed or other error
            """
            if _host_gateway is None:
                self._write_json(503, {"error": "host_gateway_unavailable"})
                return

            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"error": "invalid_json"})
                return

            output_path = (body.get("outputPath") or "").strip()
            if not output_path:
                self._write_json(400, {"error": "missing outputPath"})
                return

            deck_name = (body.get("deckName") or "XueJian Export").strip()
            document_id = (body.get("documentId") or "").strip() or None
            group_id = (body.get("groupId") or "").strip() or None

            logger.info(
                "Export apkg: deck=%s doc=%s group=%s -> %s",
                deck_name, document_id or "all", group_id or "all", output_path,
            )

            try:
                from .exports.genanki_exporter import export_cards_to_apkg

                cards = _host_gateway.list_cards(
                    document_id=document_id,
                    group_id=group_id,
                    limit=5000,
                )
                result = export_cards_to_apkg(cards, output_path, deck_name=deck_name)
                self._write_json(200, result)
            except ImportError as exc:
                logger.error("genanki not installed: %s", exc)
                self._write_json(500, {"error": "genanki_not_installed", "detail": str(exc)})
            except ValueError as exc:
                self._write_json(400, {"error": str(exc)})
            except Exception as exc:
                logger.error("Anki export failed: %s", exc, exc_info=True)
                self._write_json(500, {"error": str(exc)})

        def _handle_export_annotated_pdf(self) -> None:
            """POST /exports/annotated-pdf — export annotated PDF copy.

            Request body:
              filePath    str   required — source PDF absolute path
              outputPath  str   required — destination PDF absolute path
              highlights  list  optional — highlight payloads from Rust host

            Response:
              200 { outputPath, highlightCount }
              400 invalid/missing inputs
              500 export failure
            """
            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"error": "invalid_json"})
                return

            file_path = (body.get("filePath") or "").strip()
            output_path = (body.get("outputPath") or "").strip()
            highlights = body.get("highlights") or []

            if not file_path or not output_path:
                self._write_json(400, {"error": "missing filePath or outputPath"})
                return

            logger.info(
                "Export annotated pdf: source=%s highlights=%d -> %s",
                file_path,
                len(highlights),
                output_path,
            )

            try:
                from .exports.annotated_pdf_exporter import export_annotated_pdf

                result = export_annotated_pdf(file_path, output_path, highlights)
                self._write_json(200, result)
            except ImportError as exc:
                logger.error("PyMuPDF not installed: %s", exc)
                self._write_json(500, {"error": "pymupdf_not_installed", "detail": str(exc)})
            except FileNotFoundError as exc:
                self._write_json(400, {"error": str(exc)})
            except ValueError as exc:
                self._write_json(400, {"error": str(exc)})
            except Exception as exc:
                logger.error("Annotated PDF export failed: %s", exc, exc_info=True)
                self._write_json(500, {"error": str(exc)})

        def _handle_import_apkg(self) -> None:
            """POST /imports/apkg — import cards from an Anki .apkg file.

            Request body:
              filePath  str  required — absolute path to the .apkg file

            Response:
              200 { deckName, cards, cardCount }
              400 missing filePath or invalid file
              500 parse error
            """
            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"error": "invalid_json"})
                return

            file_path = (body.get("filePath") or "").strip()
            if not file_path:
                self._write_json(400, {"error": "missing filePath"})
                return

            logger.info("Import apkg: %s", file_path)

            try:
                from .exports.apkg_importer import import_apkg

                result = import_apkg(file_path)
                self._write_json(200, result)
            except FileNotFoundError as exc:
                self._write_json(400, {"error": str(exc)})
            except ValueError as exc:
                self._write_json(400, {"error": str(exc)})
            except Exception as exc:
                logger.error("Anki import failed: %s", exc, exc_info=True)
                self._write_json(500, {"error": str(exc)})

    return Handler


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="XueJian Python orchestration service")
    parser.add_argument("--port", type=int, required=True, help="Local port to bind")
    parser.add_argument("--host-port", type=int, default=None, help="Host HTTP gateway port")
    return parser.parse_args()


def main() -> None:
    global _host_gateway

    args = parse_args()
    start_time = time.monotonic()

    if args.host_port:
        _host_gateway = HostGatewayClient(f"http://127.0.0.1:{args.host_port}")
        logger.info("Host gateway client configured at port %d", args.host_port)
    else:
        logger.warning("No --host-port provided; workflow endpoints will return 503")

    server = ThreadingHTTPServer(("127.0.0.1", args.port), build_handler(start_time))
    logger.info("Orchestration service listening on 127.0.0.1:%d", args.port)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
