from __future__ import annotations

import threading
import time
from typing import TypedDict


class SessionMemoryState(TypedDict, total=False):
    summary: str
    compression_point: int
    turn_count: int
    last_updated_at: float


class SessionStore:
    def __init__(self) -> None:
        self._items: dict[str, SessionMemoryState] = {}
        self._lock = threading.Lock()

    def get(self, conversation_id: str | None) -> SessionMemoryState | None:
        if not conversation_id:
            return None
        with self._lock:
            state = self._items.get(conversation_id)
            return dict(state) if state else None

    def put(self, conversation_id: str | None, state: SessionMemoryState) -> None:
        if not conversation_id:
            return
        with self._lock:
            self._items[conversation_id] = dict(state)

    def expire_old(self, max_age_seconds: int = 3600) -> int:
        now = time.time()
        removed = 0
        with self._lock:
            expired_ids = [
                conversation_id
                for conversation_id, state in self._items.items()
                if now - float(state.get("last_updated_at") or 0.0) > max_age_seconds
            ]
            for conversation_id in expired_ids:
                removed += 1
                del self._items[conversation_id]
        return removed

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


SESSION_STORE = SessionStore()