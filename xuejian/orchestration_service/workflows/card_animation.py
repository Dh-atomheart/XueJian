"""Card animation workflow — LLM-based and rule-based animation script generation."""
from __future__ import annotations

import json
import logging
import re
from typing import TYPE_CHECKING

from ..providers.runtime import build_langchain_chat_model

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
- Use "flashcard_reveal" type for factual Q&A cards (2-4 steps: show question, reveal answer).
- Use "keyword_emphasis" type for definition or concept cards (2-3 steps: highlight key terms).
- Keep step content concise. Each step should be the full sentence or phrase.
- Emphasis words must appear verbatim in the step's content string.
- Delay increases should be 400-800ms between steps.
- Choose palette based on topic: "warm" for history/arts, "cool" for science/tech, "default" otherwise.
- Output JSON ONLY. No explanations.
"""

CARD_ANIMATION_USER_TEMPLATE = """\
Front (question): {front}
Back (answer): {back}
Tags: {tags}
Animation type: {anim_type}

Generate an AnimationScript. Output JSON only.
"""


def _try_langchain_animation(
    config: dict, api_key: str, front: str, back: str,
    tags: list[str], anim_type: str,
) -> str:
    """Use LLM to generate an AnimationScript JSON string."""
    try:
        from langchain_core.messages import HumanMessage, SystemMessage
    except ImportError:
        raise RuntimeError("LangChain not installed")

    llm = build_langchain_chat_model(config, api_key, 0.5)

    tags_str = ", ".join(tags[:5]) if tags else "none"
    prompt = CARD_ANIMATION_USER_TEMPLATE.format(
        front=front[:300], back=back[:500], tags=tags_str, anim_type=anim_type,
    )
    response = llm.invoke([
        SystemMessage(content=CARD_ANIMATION_SYSTEM_PROMPT),
        HumanMessage(content=prompt),
    ])
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
    anim_type: str, front: str, back: str, tags: list[str],
) -> str:
    """Deterministic fallback: build a simple AnimationScript."""
    tag_set = set(t.lower() for t in tags)
    if "history" in tag_set or "arts" in tag_set or "art" in tag_set:
        palette = "warm"
    elif "science" in tag_set or "tech" in tag_set or "physics" in tag_set or "chemistry" in tag_set:
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


def run_card_animation_workflow(
    run_id: str,
    card_id: str,
    front: str,
    back: str,
    tags: list[str],
    anim_type: str,
    host: HostGatewayClient,
) -> dict:
    """Execute the card_animation workflow. Returns {scriptJson: str}."""
    config_with_key = host.get_default_config_with_key()

    if config_with_key:
        config, api_key = config_with_key
        try:
            script_json = _try_langchain_animation(config, api_key, front, back, tags, anim_type)
            return {"status": "completed", "scriptJson": script_json}
        except Exception as exc:
            logger.error("LLM animation generation failed, using rule-based fallback: %s", exc)

    script_json = _build_rule_based_animation_script(anim_type, front, back, tags)
    return {"status": "completed", "scriptJson": script_json}
