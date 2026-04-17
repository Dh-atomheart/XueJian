#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


PROTOCOL_VERSION = "xuejian-orchestration/v1"
SERVICE_VERSION = "0.1.0"


def build_handler(start_time: float):
    class Handler(BaseHTTPRequestHandler):
        server_version = "XueJianOrchestration/0.1"
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
                        "capabilities": ["health-check", "preset-workflows"],
                    },
                )
                return

            self._write_json(404, {"error": "not_found"})

    return Handler


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="XueJian Python orchestration service")
    parser.add_argument("--port", type=int, required=True, help="Local port to bind")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    start_time = time.monotonic()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), build_handler(start_time))

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
