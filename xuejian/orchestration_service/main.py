#!/usr/bin/env python3
"""Backward-compatible entry point for the orchestration service.

The Rust host invokes this file directly:
    python main.py --port <port> --host-port <host-port>

All business logic now lives in submodules (clients/, providers/, workflows/).
This shim bootstraps the package context so relative imports work, then
delegates to ``orchestration_service.server.main()``.
"""
from __future__ import annotations

import importlib
import os
import sys


def _bootstrap_and_run() -> None:
    # Ensure the parent directory of this package is on sys.path so that
    # ``import orchestration_service`` resolves correctly for submodules
    # that use relative imports (e.g. ``from ..providers.runtime import ...``).
    package_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(package_dir)
    if parent_dir not in sys.path:
        sys.path.insert(0, parent_dir)

    # Import and run the real server entry-point via the package path.
    server_mod = importlib.import_module("orchestration_service.server")
    server_mod.main()


if __name__ == "__main__":
    _bootstrap_and_run()


# 鈹€鈹€ Legacy monolithic code below (kept for reference, will be removed) 鈹€鈹€


class _REMOVED:
    pass


# The original monolithic HostGatewayClient, workflow implementations, and
# HTTP server code has been extracted into:
#   clients/host_gateway.py
#   providers/runtime.py
#   workflows/card_generation.py
#   workflows/knowledge_qa.py
#   server.py
#
# This file is now a thin shim. The old code is preserved in git history.
# To revert, check out the commit before this change.

# Legacy symbol kept only so ``from orchestration_service.main import HostGatewayClient``
# doesn't break downstream during transition.
from orchestration_service.clients.host_gateway import HostGatewayClient as HostGatewayClient
