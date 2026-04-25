from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

SENSITIVE_KEYS = ("key", "secret", "token", "authorization", "password", "credential")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname.lower(),
            "source": "python-orchestration",
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "line": record.lineno,
        }

        for key in ("request_id", "run_id", "document_id", "workflow", "path", "duration_ms"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(sanitize(payload), ensure_ascii=False)


def configure_logging() -> None:
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.handlers.clear()

    formatter = JsonFormatter()
    stderr_handler = logging.StreamHandler()
    stderr_handler.setFormatter(formatter)
    root.addHandler(stderr_handler)

    log_dir = os.environ.get("XUEJIAN_LOG_DIR")
    if not log_dir:
        return

    path = Path(log_dir)
    path.mkdir(parents=True, exist_ok=True)
    file_handler = RotatingFileHandler(
        path / "orchestration.log",
        maxBytes=2_000_000,
        backupCount=10,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    root.addHandler(file_handler)


def sanitize(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "[redacted]" if is_sensitive_key(str(key)) else sanitize(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [sanitize(item) for item in value[:20]]
    if isinstance(value, str) and len(value) > 2000:
        return f"{value[:2000]}...[truncated]"
    return value


def is_sensitive_key(key: str) -> bool:
    normalized = key.lower()
    return any(part in normalized for part in SENSITIVE_KEYS)
