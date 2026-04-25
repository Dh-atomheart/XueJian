"""Card animation workflow with quick preview and structured video-render fallback."""
from __future__ import annotations

import json
import logging
import os
import re
from typing import TYPE_CHECKING

from ..providers.runtime import build_langchain_chat_model, estimate_workflow_cost

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)

CARD_ANIMATION_SYSTEM_PROMPT = """\
You are an animation script generator for a flashcard learning app.
Given a flashcard's front (question) and back (answer), generate an AnimationScript
that will be rendered by Framer Motion to create an engaging visual review experience.

The script must be valid JSON with this exact shape:
{
  "type": "flashcard_reveal" | "keyword_emphasis",
  "title": "<short descriptive title>",
  "palette": "default" | "warm" | "cool",
  "steps": [
    {
      "id": "<unique step id like 's1'>",
      "type": "text" | "reveal" | "emphasis",
      "content": "<text to display>",
      "emphasis": ["<word1>", "<word2>"],
      "delay_ms": <milliseconds as integer>
    }
  ]
}

Rules:
- Use "flashcard_reveal" for factual Q&A cards.
- Use "keyword_emphasis" for concept and definition cards.
- Keep steps concise.
- Output JSON only.
"""

CARD_ANIMATION_USER_TEMPLATE = """\
Front (question): {front}
Back (answer): {back}
Tags: {tags}
Animation type: {anim_type}

Generate an AnimationScript. Output JSON only.
"""


def _try_langchain_animation(
    config: dict,
    api_key: str,
    front: str,
    back: str,
    tags: list[str],
    anim_type: str,
) -> str:
    try:
        from langchain_core.messages import HumanMessage, SystemMessage
    except ImportError as exc:
        raise RuntimeError("LangChain not installed") from exc

    llm = build_langchain_chat_model(config, api_key, 0.5)
    tags_str = ", ".join(tags[:5]) if tags else "none"
    prompt = CARD_ANIMATION_USER_TEMPLATE.format(
        front=front[:300],
        back=back[:500],
        tags=tags_str,
        anim_type=anim_type,
    )
    response = llm.invoke(
        [
            SystemMessage(content=CARD_ANIMATION_SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ]
    )
    raw = str(response.content)

    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise ValueError(f"LLM did not return valid JSON: {raw[:200]}")

    script_obj = json.loads(match.group())
    for key in ("type", "title", "palette", "steps"):
        if key not in script_obj:
            raise ValueError(f"Missing key '{key}' in LLM script")

    return json.dumps(script_obj, ensure_ascii=False)


def _build_rule_based_animation_script(
    anim_type: str,
    front: str,
    back: str,
    tags: list[str],
) -> str:
    tag_set = {tag.lower() for tag in tags}
    if {"history", "arts", "art"} & tag_set:
        palette = "warm"
    elif {"science", "tech", "physics", "chemistry"} & tag_set:
        palette = "cool"
    else:
        palette = "default"

    title = front[:60]
    if anim_type == "keyword_emphasis":
        emphasis = front.split()[:3]
        script = {
            "type": "keyword_emphasis",
            "title": title,
            "palette": palette,
            "steps": [
                {"id": "s1", "type": "text", "content": front, "emphasis": emphasis, "delay_ms": 0},
                {"id": "s2", "type": "text", "content": back, "emphasis": [], "delay_ms": 400},
            ],
        }
    else:
        script = {
            "type": "flashcard_reveal",
            "title": title,
            "palette": palette,
            "steps": [
                {"id": "s1", "type": "text", "content": front, "emphasis": [], "delay_ms": 0},
                {"id": "s2", "type": "reveal", "content": back, "emphasis": [], "delay_ms": 600},
            ],
        }

    return json.dumps(script, ensure_ascii=False)


def _resolve_animations_root(host: HostGatewayClient) -> str:
    runtime_paths = host.get_runtime_paths() or {}
    animations_dir = runtime_paths.get("animationsDir")
    if not animations_dir:
        app_data_dir = runtime_paths.get("appDataDir") or os.getcwd()
        animations_dir = os.path.join(app_data_dir, "animations")
    os.makedirs(animations_dir, exist_ok=True)
    return animations_dir


def _write_render_log(path: str, lines: list[str]) -> str:
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines).strip() + "\n")
    return path


def run_card_animation_workflow(
    run_id: str,
    card_id: str,
    front: str,
    back: str,
    tags: list[str],
    anim_type: str,
    mode: str,
    host: HostGatewayClient,
) -> dict:
    config_with_key = host.get_config_for_workflow("card_animation")
    script_json: str

    if config_with_key:
        config, api_key = config_with_key
        try:
            script_json = _try_langchain_animation(config, api_key, front, back, tags, anim_type)
            host.record_workflow_cost(config["id"], estimate_workflow_cost(config))
        except Exception as exc:  # noqa: BLE001
            logger.error("LLM animation generation failed, using rule-based fallback: %s", exc)
            script_json = _build_rule_based_animation_script(anim_type, front, back, tags)
    else:
        script_json = _build_rule_based_animation_script(anim_type, front, back, tags)

    if mode == "quick_preview":
        return {
            "status": "ready",
            "scriptJson": script_json,
            "videoPath": None,
            "posterPath": None,
            "renderLogPath": None,
            "errorCode": None,
            "errorMessage": None,
            "retryable": True,
        }

    animations_root = _resolve_animations_root(host)
    episode_dir = os.path.join(animations_root, card_id)
    os.makedirs(episode_dir, exist_ok=True)
    render_log_path = os.path.join(episode_dir, "render.log")
    _write_render_log(
        render_log_path,
        [
            f"run_id={run_id or 'none'}",
            f"card_id={card_id}",
            f"mode={mode}",
            "video renderer is not installed in the current environment",
            "expected renderer: manim or a compatible local pipeline",
        ],
    )

    return {
        "status": "failed",
        "scriptJson": script_json,
        "videoPath": None,
        "posterPath": None,
        "renderLogPath": render_log_path,
        "errorCode": "renderer_unavailable",
        "errorMessage": "Video renderer is unavailable in the current environment.",
        "retryable": False,
    }
