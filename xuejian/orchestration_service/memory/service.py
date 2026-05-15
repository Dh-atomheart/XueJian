from __future__ import annotations

import re
import time

from .session_store import SessionMemoryState

SESSION_CONTEXT_RECENT_LIMIT = 4
SUMMARY_MAX_CHARS = 420


def _truncate_text(value: str | None, limit: int) -> str:
    if not value:
        return ""
    normalized = " ".join(str(value).split())
    return normalized[:limit]


def _format_recent_messages(messages: list[dict[str, str]] | None) -> list[str]:
    if not messages:
        return []
    lines: list[str] = []
    for message in messages[-SESSION_CONTEXT_RECENT_LIMIT:]:
        role = "用户" if message.get("role") == "user" else "助手"
        content = _truncate_text(message.get("content"), 96)
        if content:
            lines.append(f"{role}: {content}")
    return lines


def build_session_context(
    state: SessionMemoryState | None,
    question: str,
    recent_messages: list[dict[str, str]] | None = None,
) -> str | None:
    summary = _truncate_text((state or {}).get("summary"), SUMMARY_MAX_CHARS)
    recent_lines = _format_recent_messages(recent_messages)
    if not summary and not recent_lines:
        return None

    sections = [
        "以下内容是单会话记忆，只用于理解当前问题中的意图、指代和延续关系，不是文档证据，不能作为 citation source。",
    ]
    if summary:
        sections.append(f"会话摘要:\n{summary}")
    if recent_lines:
        sections.append("最近对话:\n" + "\n".join(recent_lines))
    sections.append(f"当前问题: {_truncate_text(question, 120)}")
    return "\n\n".join(sections)


def _extract_focus(question: str, recent_messages: list[dict[str, str]] | None) -> str:
    user_messages = [
        _truncate_text(message.get("content"), 72)
        for message in (recent_messages or [])
        if message.get("role") == "user"
    ]
    user_messages = [message for message in user_messages if message]
    focus_items = user_messages[-2:]
    current = _truncate_text(question, 72)
    if current:
        focus_items.append(current)
    unique_items: list[str] = []
    seen: set[str] = set()
    for item in focus_items:
        if item and item not in seen:
            seen.add(item)
            unique_items.append(item)
    if not unique_items:
        return "暂无明确主题"
    return "；".join(unique_items)


def _extract_reference_hint(question: str, recent_messages: list[dict[str, str]] | None) -> str:
    normalized = "".join((question or "").split())
    if re.search(r"它|这个|那个|前面|刚才|上面|这点|那点", normalized):
        last_user = ""
        for message in reversed(recent_messages or []):
            if message.get("role") == "user":
                last_user = _truncate_text(message.get("content"), 72)
                break
        if last_user:
            return f"当前问题存在指代，优先关联上一条用户问题：{last_user}"
        return "当前问题存在指代，需要结合最近对话理解。"
    return "暂无明显指代线索。"


def update_session_state(
    state: SessionMemoryState | None,
    question: str,
    answer_text: str | None,
    recent_messages: list[dict[str, str]] | None = None,
) -> SessionMemoryState:
    previous = dict(state or {})
    previous_summary = _truncate_text(previous.get("summary"), 180)
    answer_preview = _truncate_text(answer_text, 120)
    lines: list[str] = [
        f"本会话最近关注的问题：{_extract_focus(question, recent_messages)}。",
        f"最近的指代线索：{_extract_reference_hint(question, recent_messages)}",
    ]
    if answer_preview:
        lines.append(f"最近一次回答概览：{answer_preview}。")
    if previous_summary:
        lines.append(f"既有摘要延续：{previous_summary}")
    lines.append("注意：以上为对话记忆，不是文档证据；回答必须重新检索。")
    summary = _truncate_text("\n".join(lines), SUMMARY_MAX_CHARS)
    turn_count = int(previous.get("turn_count") or 0) + 1
    return {
        "summary": summary,
        "compression_point": turn_count,
        "turn_count": turn_count,
        "last_updated_at": time.time(),
    }