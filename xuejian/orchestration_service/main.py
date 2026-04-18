#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

logging.basicConfig(level=logging.INFO, format="%(asctime)s [orchestration] %(message)s")
logger = logging.getLogger(__name__)

PROTOCOL_VERSION = "xuejian-orchestration/v1"
SERVICE_VERSION = "0.2.0"

# ── Host Gateway Client ────────────────────────────────────


class HostGatewayClient:
    """HTTP client for calling the Rust Host's ModelGateway and ToolGateway."""

    def __init__(self, base_url: str) -> None:
        self._base = base_url.rstrip("/")

    def _get(self, path: str) -> dict:
        url = f"{self._base}{path}"
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            logger.error("Host gateway %s returned %s: %s", path, exc.code, body)
            raise
        except urllib.error.URLError as exc:
            logger.error("Host gateway %s unreachable: %s", path, exc)
            raise

    def _post(self, path: str, payload: dict) -> dict:
        url = f"{self._base}{path}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url, data=data, headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            logger.error("Host gateway POST %s returned %s: %s", path, exc.code, body)
            raise
        except urllib.error.URLError as exc:
            logger.error("Host gateway POST %s unreachable: %s", path, exc)
            raise

    # ── ModelGateway ──────────────────────────────────

    def list_api_configs(self) -> list[dict]:
        return self._get("/model-gateway/configs").get("items", self._get("/model-gateway/configs"))

    def get_api_config(self, config_id: str) -> dict | None:
        try:
            return self._get(f"/model-gateway/configs/{config_id}")
        except urllib.error.HTTPError:
            return None

    def get_api_key(self, config_id: str) -> str:
        result = self._get(f"/model-gateway/api-key/{config_id}")
        return result.get("apiKey", "")

    def get_default_config_with_key(self) -> tuple[dict, str] | None:
        configs = self.list_api_configs()
        default = next((c for c in configs if c.get("isDefault") and c.get("isEnabled")), None)
        if not default:
            default = next((c for c in configs if c.get("isEnabled")), None)
        if not default:
            return None
        api_key = self.get_api_key(default["id"])
        if not api_key:
            return None
        return default, api_key

    # ── ToolGateway ────────────────────────────────────

    def get_document(self, document_id: str) -> dict | None:
        try:
            return self._get(f"/tool-gateway/documents/{document_id}")
        except urllib.error.HTTPError:
            return None

    def list_anchors(self, document_id: str) -> list[dict]:
        return self._get(f"/tool-gateway/anchors?documentId={document_id}")

    def list_chunks(self, document_id: str) -> list[dict]:
        return self._get(f"/tool-gateway/chunks?documentId={document_id}")

    def persist_candidates(self, run_id: str, document_id: str, candidates: list[dict]) -> dict:
        return self._post("/tool-gateway/candidates", {
            "runId": run_id,
            "documentId": document_id,
            "candidates": candidates,
        })

    def count_candidates(self, run_id: str) -> dict:
        return self._get(f"/tool-gateway/candidates/count?runId={run_id}")

    def search_chunks(self, query: str, document_ids: list[str] | None = None, limit: int = 10) -> list[dict]:
        return self._post("/tool-gateway/search-chunks", {
            "query": query,
            "documentIds": document_ids or [],
            "limit": limit,
        })


# ── Card Generation Workflow ───────────────────────────────

CARD_GENERATION_SYSTEM_PROMPT = """\
You are a flashcard generation assistant for a spaced-repetition learning app.
Given a text passage from a document, generate flashcard candidates.

Rules:
- Each card must have a concise "front" (question or prompt) and a substantive "back" (answer).
- Front should be 8-120 characters. Back should be 12-300 characters.
- Generate 1-3 cards per passage, depending on content density.
- Assign a confidence score between 0.0 and 1.0.
- Tag each card with relevant topic tags.
- Output valid JSON only: an array of objects with keys "front", "back", "confidence", "tags".
"""

CARD_GENERATION_USER_TEMPLATE = """\
Document: {title}
Page range: {page_range}
Source quote: {quote}

Generate flashcard candidates from this passage. Output a JSON array only.
"""


def _compute_dedupe_key(document_id: str, anchor_id: str | None, front: str, back: str) -> str:
    payload = f"{document_id}::{anchor_id or 'doc'}::{front.strip().lower()}::{back.strip().lower()}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _try_langchain_generation(
    config: dict, api_key: str, chunks: list[dict], anchors: list[dict],
    document: dict, run_id: str, max_candidates: int, host: HostGatewayClient,
) -> int:
    """Attempt LangChain-based generation. Returns number of candidates persisted."""
    try:
        from langchain_core.messages import HumanMessage, SystemMessage
        from langchain_openai import ChatOpenAI
    except ImportError:
        logger.warning("LangChain not installed, falling back to rule-based generation")
        return 0

    provider = config.get("provider", "openai")
    model_name = config.get("model") or ("gpt-4o-mini" if provider == "openai" else "claude-3-5-haiku-20241022")
    base_url = config.get("baseUrl")

    llm_kwargs: dict[str, Any] = {"model": model_name, "api_key": api_key, "temperature": 0.4}
    if base_url:
        llm_kwargs["base_url"] = base_url

    if provider == "anthropic":
        try:
            from langchain_anthropic import ChatAnthropic
            llm = ChatAnthropic(model=model_name, api_key=api_key, temperature=0.4, base_url=base_url)
        except ImportError:
            logger.warning("langchain-anthropic not installed, using OpenAI-compatible endpoint")
            llm = ChatOpenAI(**llm_kwargs)
    else:
        llm = ChatOpenAI(**llm_kwargs)

    anchor_by_hash = {a.get("hash", ""): a for a in anchors if a.get("hash")}
    total_persisted = 0

    for chunk in chunks:
        if total_persisted >= max_candidates:
            break

        # Find anchor for this chunk
        anchor = None
        metadata = chunk.get("metadata") or {}
        anchor_hashes = metadata.get("anchorHashes", []) if isinstance(metadata, dict) else []
        for h in anchor_hashes:
            if h in anchor_by_hash:
                anchor = anchor_by_hash[h]
                break

        quote = anchor.get("textQuote", chunk.get("content", ""))[:500] if anchor else chunk.get("content", "")[:500]
        page_range = f"{chunk.get('pageStart', '?')}-{chunk.get('pageEnd', '?')}"

        prompt = CARD_GENERATION_USER_TEMPLATE.format(
            title=document.get("title", "Untitled"),
            page_range=page_range,
            quote=quote,
        )

        try:
            response = llm.invoke([
                SystemMessage(content=CARD_GENERATION_SYSTEM_PROMPT),
                HumanMessage(content=prompt),
            ])
            raw = response.content
            # Extract JSON array from response
            match = re.search(r"\[.*\]", raw, re.DOTALL)
            if not match:
                logger.warning("No JSON array found in LLM response for chunk %s", chunk.get("chunkIndex"))
                continue
            items = json.loads(match.group())
        except Exception as exc:
            logger.error("LLM invocation failed for chunk %s: %s", chunk.get("chunkIndex"), exc)
            continue

        candidates = []
        for item in items[:max_candidates - total_persisted]:
            front = str(item.get("front", "")).strip()
            back = str(item.get("back", "")).strip()
            if len(front) < 8 or len(back) < 12:
                continue
            confidence = float(item.get("confidence", 0.7))
            confidence = max(0.0, min(1.0, confidence))
            tags = item.get("tags", [])
            if isinstance(tags, str):
                tags = [t.strip() for t in tags.split(",") if t.strip()]
            tags = [str(t) for t in tags][:8]
            if anchor:
                tags.append(f"page-{anchor.get('page', '?')}")

            dedupe_key = _compute_dedupe_key(
                document["id"], anchor.get("id") if anchor else None, front, back,
            )
            candidates.append({
                "anchorId": anchor.get("id") if anchor else None,
                "front": front,
                "back": back,
                "confidence": round(confidence, 3),
                "tags": tags,
                "dedupeKey": dedupe_key,
            })

        if candidates:
            result = host.persist_candidates(run_id, document["id"], candidates)
            total_persisted += result.get("insertedCount", 0)
            logger.info(
                "Persisted %d candidates for chunk %s (%d duplicates skipped)",
                result.get("insertedCount", 0),
                chunk.get("chunkIndex"),
                result.get("duplicateCount", 0),
            )

    return total_persisted


def _rule_based_generation(
    chunks: list[dict], anchors: list[dict], document: dict,
    run_id: str, max_candidates: int, host: HostGatewayClient,
) -> int:
    """Fallback: rule-based candidate generation (mirrors Rust local rules)."""
    anchor_by_hash = {a.get("hash", ""): a for a in anchors if a.get("hash")}
    total_persisted = 0

    for chunk in chunks:
        if total_persisted >= max_candidates:
            break

        metadata = chunk.get("metadata") or {}
        anchor_hashes = metadata.get("anchorHashes", []) if isinstance(metadata, dict) else []

        chunk_anchors = [anchor_by_hash[h] for h in anchor_hashes if h in anchor_by_hash]
        if not chunk_anchors:
            # Fallback: find anchors in chunk page range
            page_start = chunk.get("pageStart")
            page_end = chunk.get("pageEnd")
            for a in anchors:
                if page_start and a.get("page", 0) < page_start:
                    continue
                if page_end and a.get("page", 0) > page_end:
                    continue
                chunk_anchors.append(a)
            chunk_anchors.sort(key=lambda a: (a.get("page", 0), a.get("paragraph") or 0))

        candidates = []
        for anchor in chunk_anchors[:max_candidates - total_persisted]:
            text = (anchor.get("textQuote") or "").strip()
            if len(text) < 18:
                continue
            front, back, confidence = _extract_flashcard(text, anchor)
            if not front:
                continue
            dedupe_key = _compute_dedupe_key(
                document["id"], anchor.get("id"), front, back,
            )
            tags = [f"page-{anchor.get('page', '?')}"]
            if anchor.get("paragraph"):
                tags.append(f"paragraph-{anchor['paragraph']}")
            candidates.append({
                "anchorId": anchor.get("id"),
                "front": front,
                "back": back,
                "confidence": round(confidence, 3),
                "tags": tags,
                "dedupeKey": dedupe_key,
            })

        if candidates:
            result = host.persist_candidates(run_id, document["id"], candidates)
            total_persisted += result.get("insertedCount", 0)

    return total_persisted


def _extract_flashcard(text: str, anchor: dict) -> tuple[str, str, float]:
    """Rule-based flashcard extraction (mirrors Rust build_flashcard_from_anchor)."""
    # Chinese definition patterns
    for marker in ["是指", "指的是", "叫做", "意味着", "是"]:
        if marker in text:
            parts = text.split(marker, 1)
            term = parts[0].strip()
            definition = parts[1].strip()
            if 2 <= len(term) <= 32 and len(definition) >= 12:
                return f"What is {term}?", _truncate(definition, 220), 0.82

    # English "is" definition
    if " is " in text:
        parts = text.split(" is ", 1)
        term = parts[0].strip()
        definition = parts[1].strip()
        if 2 <= len(term) <= 32 and len(definition) >= 12:
            return f"What is {term}?", _truncate(definition, 220), 0.82

    # "contains" pattern
    if "contains" in text or "包括" in text or "包含" in text:
        topic = text.split("。")[0].split(".")[0].strip()[:18] or "this passage"
        return f"What are the key points about {topic}?", _truncate(text, 220), 0.71

    # Default: location-based question
    page = anchor.get("page", "?")
    paragraph = anchor.get("paragraph")
    location = f"Page {page}" + (f", paragraph {paragraph}" if paragraph else "")
    focus = text.split("。")[0].split(".")[0].strip()[:18] or "this passage"
    return f"{location}: what is the key idea about {focus}?", _truncate(text, 220), 0.64


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


# ── Card Animation Workflow ────────────────────────────────

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
      "emphasis": ["<word1>", "<word2>"],  // only for keyword_emphasis type
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

    # Rule-based fallback
    script_json = _build_rule_based_animation_script(anim_type, front, back, tags)
    return {"status": "completed", "scriptJson": script_json}


def _try_langchain_animation(
    config: dict, api_key: str, front: str, back: str,
    tags: list[str], anim_type: str,
) -> str:
    """Use LLM to generate an AnimationScript JSON string."""
    try:
        from langchain_core.messages import HumanMessage, SystemMessage
        from langchain_openai import ChatOpenAI
    except ImportError:
        raise RuntimeError("LangChain not installed")

    provider = config.get("provider", "openai")
    model_name = config.get("model") or ("gpt-4o-mini" if provider == "openai" else "claude-3-5-haiku-20241022")
    base_url = config.get("baseUrl")

    llm_kwargs: dict[str, Any] = {"model": model_name, "api_key": api_key, "temperature": 0.5}
    if base_url:
        llm_kwargs["base_url"] = base_url

    if provider == "anthropic":
        try:
            from langchain_anthropic import ChatAnthropic
            llm = ChatAnthropic(model=model_name, api_key=api_key, temperature=0.5, base_url=base_url)
        except ImportError:
            llm = ChatOpenAI(**llm_kwargs)
    else:
        llm = ChatOpenAI(**llm_kwargs)

    tags_str = ", ".join(tags[:5]) if tags else "none"
    prompt = CARD_ANIMATION_USER_TEMPLATE.format(
        front=front[:300], back=back[:500], tags=tags_str, anim_type=anim_type,
    )
    response = llm.invoke([
        SystemMessage(content=CARD_ANIMATION_SYSTEM_PROMPT),
        HumanMessage(content=prompt),
    ])
    raw = str(response.content)

    # Extract the first JSON object from the response
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise ValueError(f"LLM did not return valid JSON: {raw[:200]}")

    script_obj = json.loads(match.group())
    # Validate required keys
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
        # Emphasise first 3 words of the front as keywords
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


# ── Podcast Workflow ─────────────────────────────────────

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

    # Rule-based fallback
    script_json = _build_rule_based_podcast_script(title, context)
    return {"status": "completed", "scriptJson": script_json}


def _try_langchain_podcast(
    config: dict, api_key: str, title: str, context: str,
) -> str:
    """Use LLM to generate a PodcastScript JSON string."""
    try:
        from langchain_core.messages import HumanMessage, SystemMessage
        from langchain_openai import ChatOpenAI
    except ImportError:
        raise RuntimeError("LangChain not installed")

    provider = config.get("provider", "openai")
    model_name = config.get("model") or ("gpt-4o-mini" if provider == "openai" else "claude-3-5-haiku-20241022")
    base_url = config.get("baseUrl")

    llm_kwargs: dict[str, Any] = {"model": model_name, "api_key": api_key, "temperature": 0.7}
    if base_url:
        llm_kwargs["base_url"] = base_url

    if provider == "anthropic":
        try:
            from langchain_anthropic import ChatAnthropic
            llm = ChatAnthropic(model=model_name, api_key=api_key, temperature=0.7, base_url=base_url)
        except ImportError:
            llm = ChatOpenAI(**llm_kwargs)
    else:
        llm = ChatOpenAI(**llm_kwargs)

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


def run_card_generation_workflow(
    run_id: str, document_id: str, max_candidates: int, host: HostGatewayClient,
) -> dict:
    """Execute the card_generation preset workflow."""
    document = host.get_document(document_id)
    if not document:
        return {"status": "failed", "error": f"Document {document_id} not found"}

    chunks = host.list_chunks(document_id)
    anchors = host.list_anchors(document_id)
    if not chunks:
        return {"status": "failed", "error": "Document has no parsed chunks"}

    # Try AI-based generation first
    config_with_key = host.get_default_config_with_key()
    ai_count = 0
    if config_with_key:
        config, api_key = config_with_key
        logger.info(
            "Using AI model %s (%s) for card generation",
            config.get("model", "default"),
            config.get("provider", "openai"),
        )
        try:
            ai_count = _try_langchain_generation(
                config, api_key, chunks, anchors, document, run_id, max_candidates, host,
            )
        except Exception as exc:
            logger.error("AI generation failed, falling back to rules: %s", exc)

    # If AI produced nothing, fall back to rule-based
    if ai_count == 0:
        logger.info("Using rule-based generation (AI unavailable or produced 0 candidates)")
        ai_count = _rule_based_generation(chunks, anchors, document, run_id, max_candidates, host)

    counts = host.count_candidates(run_id)
    return {
        "status": "completed",
        "generatedCount": ai_count,
        "totalCandidates": counts.get("total", 0),
        "pendingCount": counts.get("pending", 0),
    }


# ── Knowledge Q&A Workflow ─────────────────────────────────

KNOWLEDGE_QA_SYSTEM_PROMPT = """\
You are a knowledge Q&A assistant for a learning app. Given a user's question and
retrieved text passages from their documents, provide a concise, accurate answer.

Rules:
- Base your answer ONLY on the provided passages. If the passages don't contain
  enough information, say so clearly.
- After your answer, list the citations used: for each one, output a JSON object
  with keys "chunkId" (string), "documentId" (string), and "snippet" (string,
  the relevant excerpt from that passage, max 120 chars).
- Output your response in this JSON format:
  {"answer": "...", "citations": [{"chunkId": "...", "documentId": "...", "snippet": "..."}]}
"""

KNOWLEDGE_QA_USER_TEMPLATE = """\
Question: {question}

Retrieved passages:
{passages}

Provide an answer based on these passages, with citations. Output JSON only.
"""


def run_knowledge_qa_workflow(
    run_id: str, question: str, document_ids: list[str],
    host: HostGatewayClient,
) -> dict:
    """Execute the knowledge_qa preset workflow using FTS5 search + LLM."""
    # Step 1: Retrieve relevant chunks via FTS5
    chunks = host.search_chunks(question, document_ids if document_ids else None, limit=8)
    if not chunks:
        return {
            "status": "completed",
            "answer": {
                "answer": "No relevant content found for your question in the selected documents.",
                "retrievalMode": "fts5",
                "citations": [],
            },
        }

    # Step 2: Build context from chunks
    passages = []
    for i, chunk in enumerate(chunks):
        snippet = (chunk.get("snippet") or chunk.get("content", ""))[:500]
        passages.append(
            f"[Passage {i + 1}] (doc={chunk.get('documentId', '?')[:8]}, "
            f"chunk={chunk.get('id', '?')[:8]}, "
            f"pages={chunk.get('pageStart', '?')}-{chunk.get('pageEnd', '?')})\n{snippet}"
        )
    passages_text = "\n\n".join(passages)

    # Step 3: Try LLM-based Q&A
    config_with_key = host.get_default_config_with_key()
    if config_with_key:
        config, api_key = config_with_key
        try:
            answer_data = _try_langchain_qa(config, api_key, question, passages_text, chunks)
            return {
                "status": "completed",
                "answer": {
                    "answer": answer_data.get("answer", ""),
                    "retrievalMode": "fts5",
                    "citations": answer_data.get("citations", []),
                },
            }
        except Exception as exc:
            logger.error("LLM Q&A failed, falling back to excerpt-based answer: %s", exc)

    # Step 4: Fallback — return top chunks as the answer
    top_chunk = chunks[0]
    excerpt = (top_chunk.get("snippet") or top_chunk.get("content", ""))[:300]
    return {
        "status": "completed",
        "answer": {
            "answer": f"Based on your documents, here is the most relevant excerpt:\n\n{excerpt}",
            "retrievalMode": "fts5",
            "citations": [{
                "chunkId": top_chunk.get("id", ""),
                "documentId": top_chunk.get("documentId", ""),
                "snippet": excerpt[:120],
            }],
        },
    }


def _try_langchain_qa(
    config: dict, api_key: str, question: str, passages_text: str, chunks: list[dict],
) -> dict:
    """Attempt LangChain-based Q&A. Returns dict with answer + citations."""
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_openai import ChatOpenAI

    provider = config.get("provider", "openai")
    model_name = config.get("model") or ("gpt-4o-mini" if provider == "openai" else "claude-3-5-haiku-20241022")
    base_url = config.get("baseUrl")

    llm_kwargs: dict[str, Any] = {"model": model_name, "api_key": api_key, "temperature": 0.3}
    if base_url:
        llm_kwargs["base_url"] = base_url

    if provider == "anthropic":
        try:
            from langchain_anthropic import ChatAnthropic
            llm = ChatAnthropic(model=model_name, api_key=api_key, temperature=0.3, base_url=base_url)
        except ImportError:
            llm = ChatOpenAI(**llm_kwargs)
    else:
        llm = ChatOpenAI(**llm_kwargs)

    prompt = KNOWLEDGE_QA_USER_TEMPLATE.format(question=question, passages=passages_text)
    response = llm.invoke([
        SystemMessage(content=KNOWLEDGE_QA_SYSTEM_PROMPT),
        HumanMessage(content=prompt),
    ])
    raw = response.content

    # Parse JSON response
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        result = json.loads(match.group())
        # Validate citations reference real chunks
        valid_chunk_ids = {c.get("id") for c in chunks}
        citations = []
        for cit in result.get("citations", []):
            chunk_id = cit.get("chunkId", "")
            if chunk_id in valid_chunk_ids:
                citations.append(cit)
        result["citations"] = citations
        return result

    # If LLM didn't return valid JSON, use the raw text as the answer
    return {"answer": raw.strip(), "citations": []}


# ── Knowledge Graph Workflow ───────────────────────────────


def run_knowledge_graph_workflow(
    run_id: str,
    document_ids: list[str],
    host: HostGatewayClient,
) -> dict:
    """Extract entities and relations from documents. Returns {nodes: [...], edges: [...]}."""
    config_with_key = host.get_default_config_with_key()

    if config_with_key:
        config, api_key = config_with_key
        try:
            return _run_knowledge_graph_llm(run_id, document_ids, host, config, api_key)
        except Exception as exc:
            logger.warning("LLM knowledge-graph extraction failed, using fallback: %s", exc)

    return _build_fallback_graph(document_ids)


def _run_knowledge_graph_llm(
    run_id: str,
    document_ids: list[str],
    host: HostGatewayClient,
    config: dict,
    api_key: str,
) -> dict:
    """Use LLM to extract entities and relations from document chunks."""
    # Gather document chunks
    all_chunks: list[dict] = []
    for doc_id in document_ids:
        try:
            chunks = host.list_document_chunks(doc_id)
            all_chunks.extend(chunks)
        except Exception as exc:
            logger.warning("Could not fetch chunks for doc %s: %s", doc_id[:8], exc)

    if not all_chunks:
        return _build_fallback_graph(document_ids)

    # Build a combined text excerpt (limited to avoid token explosion)
    text_parts = []
    for chunk in all_chunks[:20]:
        content = chunk.get("content", "")
        if content:
            text_parts.append(content)
    combined_text = "\n\n".join(text_parts)[:8000]

    prompt = f"""Analyze the following learning material and extract knowledge entities and their relationships.

Return a JSON object with:
- "nodes": array of objects with "label" (string), "type" (one of: concept, person, event, formula, term), "aliases" (string array)
- "edges": array of objects with "fromLabel" (string), "toLabel" (string), "relation" (string describing the relationship), "confidence" (number 0-1)

Only extract entities and relationships that are clearly supported by the text. Do not infer unsupported facts.

Material:
{combined_text}"""

    provider = config.get("provider", "openai")
    model = config.get("model", "gpt-4o")
    base_url = config.get("baseUrl") or "https://api.openai.com/v1"
    base_url = base_url.rstrip("/")

    import urllib.request
    import urllib.error

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a knowledge extraction assistant. Return only valid JSON."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }).encode("utf-8")

    chat_url = f"{base_url}/chat/completions"
    req = urllib.request.Request(chat_url, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read())

    raw = result.get("choices", [{}])[0].get("message", {}).get("content", "{}")
    parsed = json.loads(raw)

    raw_nodes = parsed.get("nodes", [])
    raw_edges = parsed.get("edges", [])

    # Build label -> index map for edge resolution
    nodes = []
    label_map: dict[str, int] = {}
    for i, n in enumerate(raw_nodes):
        label = n.get("label", "").strip()
        if not label:
            continue
        node_type = n.get("type", "concept")
        if node_type not in ("concept", "person", "event", "formula", "term"):
            node_type = "concept"
        nodes.append({
            "label": label,
            "type": node_type,
            "aliases": n.get("aliases", []),
            "sourceIds": document_ids,
            "metadata": {},
        })
        label_map[label.lower()] = i

    edges = []
    for e in raw_edges:
        from_label = e.get("fromLabel", "").strip().lower()
        to_label = e.get("toLabel", "").strip().lower()
        if from_label not in label_map or to_label not in label_map:
            continue
        edges.append({
            "fromNodeId": f"pending:{label_map[from_label]}",
            "toNodeId": f"pending:{label_map[to_label]}",
            "relation": e.get("relation", "related_to"),
            "confidence": max(0.0, min(1.0, float(e.get("confidence", 0.5)))),
            "sourceIds": document_ids,
        })

    return {"nodes": nodes, "edges": edges}


def _build_fallback_graph(document_ids: list[str]) -> dict:
    """Build a minimal placeholder graph when LLM is unavailable."""
    nodes = [
        {
            "label": f"Document {doc_id[:8]}",
            "type": "concept",
            "aliases": [],
            "sourceIds": [doc_id],
            "metadata": {"fallback": True},
        }
        for doc_id in document_ids
    ]
    return {"nodes": nodes, "edges": []}


# ── HTTP Server ────────────────────────────────────────────

_host_gateway: HostGatewayClient | None = None


def build_handler(start_time: float):
    class Handler(BaseHTTPRequestHandler):
        server_version = "XueJianOrchestration/0.2"
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
                        "capabilities": ["health-check", "preset-workflows", "card-generation", "knowledge-qa", "card-animation", "podcast", "knowledge-graph"],
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
