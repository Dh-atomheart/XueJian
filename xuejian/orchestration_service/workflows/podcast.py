"""Podcast workflow — LLM-based and rule-based podcast script generation."""
from __future__ import annotations

import json
import logging
import re
from typing import TYPE_CHECKING

from ..providers.runtime import build_langchain_chat_model

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)

PODCAST_SYSTEM_PROMPT = """\
You are a podcast script generator for a learning app.
Given a topic and context text, generate a dialogue-style podcast script between
a "主持人" (host) and a "专家" (expert) that explains the key concepts in an
engaging conversational style.

The script must be valid JSON with this exact shape:
{
  "title": "<podcast title>",
  "description": "<one-sentence description>",
  "speakers": ["主持人", "专家"],
  "segments": [
    {
      "id": "seg1",
      "speaker": "主持人" | "专家",
      "text": "<what the speaker says>",
      "durationMs": <estimated milliseconds as integer, typically 3000-15000>
    }
  ]
}

Rules:
- Generate 4-8 dialogue segments alternating between 主持人 and 专家.
- 主持人 should introduce the topic, ask questions, and summarize.
- 专家 should provide explanations, examples, and insights based on the context.
- Each segment's text should be 1-3 natural sentences in Chinese.
- Estimate durationMs as roughly 150ms per Chinese character.
- Keep total duration between 30s and 120s.
- Output JSON ONLY. No explanations.
"""

PODCAST_USER_TEMPLATE = """\
Topic: {title}
Context:
{context}

Generate a podcast dialogue script. Output JSON only.
"""


def _try_langchain_podcast(
    config: dict, api_key: str, title: str, context: str,
) -> str:
    """Use LLM to generate a PodcastScript JSON string."""
    try:
        from langchain_core.messages import HumanMessage, SystemMessage
    except ImportError:
        raise RuntimeError("LangChain not installed")

    llm = build_langchain_chat_model(config, api_key, 0.7)

    prompt = PODCAST_USER_TEMPLATE.format(title=title[:200], context=context[:2000])
    response = llm.invoke([
        SystemMessage(content=PODCAST_SYSTEM_PROMPT),
        HumanMessage(content=prompt),
    ])
    raw = str(response.content)

    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise ValueError(f"LLM did not return valid JSON: {raw[:200]}")

    script_obj = json.loads(match.group())
    for key in ("title", "speakers", "segments"):
        if key not in script_obj:
            raise ValueError(f"Missing key '{key}' in LLM podcast script")

    return json.dumps(script_obj, ensure_ascii=False)


def _build_rule_based_podcast_script(title: str, context: str) -> str:
    """Deterministic fallback: build a simple podcast dialogue script."""
    short_context = context[:200] if len(context) > 200 else context

    script = {
        "title": title,
        "description": f"AI 生成的学习播客 — {title}",
        "speakers": ["主持人", "专家"],
        "outline": [
            f"话题介绍：{title}",
            "核心概念讲解",
            "实例与总结",
        ],
        "segments": [
            {
                "id": "seg1",
                "speaker": "主持人",
                "text": f"大家好，欢迎收听今天的学习播客！今天我们要聊一聊关于「{title}」的话题。",
                "durationMs": 8000,
            },
            {
                "id": "seg2",
                "speaker": "专家",
                "text": f"谢谢主持人。这个话题非常有趣。根据学习材料：{short_context}",
                "durationMs": 12000,
            },
            {
                "id": "seg3",
                "speaker": "主持人",
                "text": "能不能给我们的听众举个具体的例子呢？",
                "durationMs": 5000,
            },
            {
                "id": "seg4",
                "speaker": "专家",
                "text": "当然可以。让我结合刚才提到的内容，做一个简单的总结和延伸。学习这个概念的关键是理解其核心原理。",
                "durationMs": 10000,
            },
            {
                "id": "seg5",
                "speaker": "主持人",
                "text": "非常感谢今天的分享！希望大家通过这期播客对这个知识点有了更深入的理解。我们下期再见！",
                "durationMs": 8000,
            },
        ],
    }
    return json.dumps(script, ensure_ascii=False)


def run_podcast_workflow(
    run_id: str,
    episode_id: str,
    title: str,
    context: str,
    host: HostGatewayClient,
) -> dict:
    """Execute the podcast generation workflow. Returns {scriptJson: str}."""
    config_with_key = host.get_default_config_with_key()

    if config_with_key:
        config, api_key = config_with_key
        try:
            script_json = _try_langchain_podcast(config, api_key, title, context)
            return {"status": "completed", "scriptJson": script_json}
        except Exception as exc:
            logger.error("LLM podcast generation failed, using rule-based fallback: %s", exc)

    script_json = _build_rule_based_podcast_script(title, context)
    return {"status": "completed", "scriptJson": script_json}
