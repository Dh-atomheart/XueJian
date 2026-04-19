#!/usr/bin/env python3
"""XueJian orchestration service — HTTP server entry point.

This module is the thin server shell. All business logic lives in submodules:
- clients/   — HostGatewayClient
- providers/  — model runtime helpers
- workflows/  — card_generation, knowledge_qa, card_animation, podcast, knowledge_graph
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .clients.host_gateway import HostGatewayClient
from .workflows.card_animation import run_card_animation_workflow
from .workflows.card_generation import run_card_generation_workflow
from .workflows.knowledge_graph import run_knowledge_graph_workflow
from .workflows.knowledge_qa import run_knowledge_qa_workflow
from .workflows.podcast import run_podcast_workflow

logging.basicConfig(level=logging.INFO, format="%(asctime)s [orchestration] %(message)s")
logger = logging.getLogger(__name__)

PROTOCOL_VERSION = "xuejian-orchestration/v1"
SERVICE_VERSION = "0.3.0"

# ── HTTP Server ────────────────────────────────────────────

_host_gateway: HostGatewayClient | None = None


def build_handler(start_time: float):
    class Handler(BaseHTTPRequestHandler):
        server_version = "XueJianOrchestration/0.3"
        protocol_version = "HTTP/1.1"

        def log_message(self, format: str, *args) -> None:  # noqa: A003
            return

        def _write_json(self, status_code: int, payload: dict) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _read_body(self) -> bytes:
            length = int(self.headers.get("Content-Length", 0))
            return self.rfile.read(length) if length > 0 else b""

        def do_GET(self) -> None:  # noqa: N802
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
                            "knowledge-qa",
                            "card-animation",
                            "podcast",
                            "knowledge-graph",
                        ],
                    },
                )
                return

            self._write_json(404, {"error": "not_found"})

        def do_POST(self) -> None:  # noqa: N802
            if self.path == "/workflows/card-generation":
                self._handle_card_generation()
                return

            if self.path == "/workflows/knowledge-qa":
                self._handle_knowledge_qa()
                return

            if self.path == "/workflows/card-animation":
                self._handle_card_animation()
                return

            if self.path == "/workflows/podcast":
                self._handle_podcast()
                return

            if self.path == "/workflows/knowledge-graph":
                self._handle_knowledge_graph()
                return

            self._write_json(404, {"error": "not_found"})

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
                result = run_card_generation_workflow(
                    run_id, document_id, max_candidates, _host_gateway,
                )
                self._write_json(200, result)
            except Exception as exc:
                logger.error("Card generation workflow failed: %s", exc, exc_info=True)
                self._write_json(500, {"error": str(exc)})

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

            if not run_id or not question:
                self._write_json(400, {"error": "missing runId or question"})
                return

            logger.info(
                "Starting knowledge QA: run=%s question=%s docs=%d",
                run_id[:8], question[:40], len(document_ids),
            )
            try:
                result = run_knowledge_qa_workflow(
                    run_id, question, document_ids, _host_gateway,
                )
                self._write_json(200, result)
            except Exception as exc:
                logger.error("Knowledge QA workflow failed: %s", exc, exc_info=True)
                self._write_json(500, {"error": str(exc)})

        def _handle_card_animation(self) -> None:
            if _host_gateway is None:
                self._write_json(503, {"error": "host_gateway_unavailable"})
                return

            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"error": "invalid_json"})
                return

            run_id = body.get("runId", "")
            card_id = body.get("cardId", "").strip()
            front = body.get("front", "").strip()
            back = body.get("back", "").strip()
            tags = body.get("tags") or []
            anim_type = body.get("animType", "flashcard_reveal").strip()

            if not card_id or not front:
                self._write_json(400, {"error": "missing cardId or front"})
                return

            logger.info(
                "Starting card animation: run=%s card=%s type=%s",
                run_id[:8] if run_id else "none", card_id[:8], anim_type,
            )
            try:
                result = run_card_animation_workflow(
                    run_id, card_id, front, back, tags, anim_type, _host_gateway,
                )
                self._write_json(200, result)
            except Exception as exc:
                logger.error("Card animation workflow failed: %s", exc, exc_info=True)
                self._write_json(500, {"error": str(exc)})

        def _handle_podcast(self) -> None:
            if _host_gateway is None:
                self._write_json(503, {"error": "host_gateway_unavailable"})
                return

            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"error": "invalid_json"})
                return

            run_id = body.get("runId", "")
            episode_id = body.get("episodeId", "")
            title = body.get("title", "").strip()
            context = body.get("context", "").strip()

            if not title:
                self._write_json(400, {"error": "missing title"})
                return

            logger.info(
                "Starting podcast generation: run=%s episode=%s title=%s",
                run_id[:8] if run_id else "none",
                episode_id[:8] if episode_id else "none",
                title[:40],
            )
            try:
                result = run_podcast_workflow(
                    run_id, episode_id, title, context, _host_gateway,
                )
                self._write_json(200, result)
            except Exception as exc:
                logger.error("Podcast workflow failed: %s", exc, exc_info=True)
                self._write_json(500, {"error": str(exc)})

        def _handle_knowledge_graph(self) -> None:
            if _host_gateway is None:
                self._write_json(503, {"error": "host_gateway_unavailable"})
                return

            try:
                body = json.loads(self._read_body())
            except (json.JSONDecodeError, ValueError):
                self._write_json(400, {"error": "invalid_json"})
                return

            run_id = body.get("runId", "")
            document_ids = body.get("documentIds", [])

            if not document_ids:
                self._write_json(400, {"error": "missing documentIds"})
                return

            logger.info(
                "Starting knowledge graph build: run=%s docs=%d",
                run_id[:8] if run_id else "none",
                len(document_ids),
            )
            try:
                result = run_knowledge_graph_workflow(
                    run_id, document_ids, _host_gateway,
                )
                self._write_json(200, result)
            except Exception as exc:
                logger.error("Knowledge graph workflow failed: %s", exc, exc_info=True)
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
