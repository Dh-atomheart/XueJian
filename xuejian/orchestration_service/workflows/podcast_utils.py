"""Shared helpers for the podcast workflow."""
from __future__ import annotations

import json
import logging
import re
import math
from pathlib import Path
from typing import Any, TypedDict, TypeVar

from pydantic import BaseModel

from ..providers.runtime import build_langchain_chat_model

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

TOP_K_BY_DURATION = {
    "short": 6,
    "medium": 12,
    "long": 20,
    "ultra_long": 30,
}

SEGMENT_RANGE_BY_DURATION = {
    "short": (2, 4),
    "medium": (4, 8),
    "long": (8, 15),
    "ultra_long": (15, 30),
}

ROLE_PRESETS: dict[str, list[dict[str, str]]] = {
    "deep_dive": [
        {"speaker_id": "host", "name": "分析师", "role": "主持人", "personality": "理性追问机制和原理"},
        {"speaker_id": "expert", "name": "专家", "role": "专家", "personality": "深入解释并给出因果链路"},
    ],
    "lecture": [
        {"speaker_id": "narrator", "name": "讲师", "role": "讲师", "personality": "系统讲解并串联知识框架"},
    ],
    "interview": [
        {"speaker_id": "host", "name": "主持人", "role": "主持人", "personality": "负责提问、串场和总结"},
        {"speaker_id": "expert", "name": "嘉宾", "role": "嘉宾", "personality": "给出专业回答和案例"},
    ],
    "casual": [
        {"speaker_id": "host", "name": "朋友A", "role": "朋友A", "personality": "好奇、轻松、愿意追问"},
        {"speaker_id": "expert", "name": "朋友B", "role": "朋友B", "personality": "自然分享观点和例子"},
    ],
    "exam_prep": [
        {"speaker_id": "narrator", "name": "播报员", "role": "播报员", "personality": "精炼播报考点、强调重点"},
    ],
}

STYLE_PROMPTS: dict[str, dict[str, str]] = {
    "deep_dive": {
        "outline_system": "你是深度探讨播客的提纲规划师，强调机制、因果和递进。",
        "script_system": "你是深度探讨播客的编剧，要求对话追问清晰、解释深入。",
    },
    "lecture": {
        "outline_system": "你是知识讲解播客的提纲规划师，强调结构化梳理和总结。",
        "script_system": "你是知识讲解播客的编剧，语气专业、条理分明。",
    },
    "interview": {
        "outline_system": "你是访谈播客的提纲规划师，强调问题驱动和层层展开。",
        "script_system": "你是访谈播客的编剧，主持人负责提问，嘉宾负责回答。",
    },
    "casual": {
        "outline_system": "你是轻松闲聊播客的提纲规划师，强调自然对话和低压节奏。",
        "script_system": "你是轻松闲聊播客的编剧，允许口语化但不能失真。",
    },
    "exam_prep": {
        "outline_system": "你是考点速记播客的提纲规划师，强调覆盖率和提炼。",
        "script_system": "你是考点速记播客的编剧，内容必须高度凝练。",
    },
}

TARGET_DURATION_BY_TIER_MS = {
    "short": 4 * 60 * 1000,
    "medium": 10 * 60 * 1000,
    "long": 22 * 60 * 1000,
    "ultra_long": 36 * 60 * 1000,
}

MACRO_SEGMENT_TARGET_MS = 18 * 60 * 1000


class MacroSegment(TypedDict):
    index: int
    target_duration_ms: int
    status: str
    audio_path: str | None
    script_json: str | None
    segment_start_index: int
    segment_end_index: int


def select_retrieval_limit(duration_tier: str) -> int:
    return TOP_K_BY_DURATION.get(duration_tier, TOP_K_BY_DURATION["medium"])


def target_segment_count(duration_tier: str) -> int:
    low, high = SEGMENT_RANGE_BY_DURATION.get(duration_tier, SEGMENT_RANGE_BY_DURATION["medium"])
    return (low + high) // 2


def build_roles(style: str) -> list[dict[str, str]]:
    return ROLE_PRESETS.get(style, ROLE_PRESETS["interview"])


def make_episode_dir(podcasts_root: str | Path, episode_id: str) -> Path:
    directory = Path(podcasts_root) / episode_id
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def approximate_duration_ms(text: str, language: str = "zh-CN") -> int:
    multiplier = 170 if language.startswith("zh") else 190
    return max(1000, len(text.strip()) * multiplier)


def extract_json_object(raw_text: str) -> dict[str, Any]:
    match = re.search(r"\{.*\}", raw_text, re.DOTALL)
    if not match:
        raise ValueError("Model response did not contain JSON")
    return json.loads(match.group())


def invoke_structured_model(
    config: dict,
    api_key: str,
    system_prompt: str,
    user_prompt: str,
    schema_cls: type[T],
    temperature: float = 0.3,
) -> T:
    from langchain_core.messages import HumanMessage, SystemMessage

    llm = build_langchain_chat_model(config, api_key, temperature)
    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ])
    payload = extract_json_object(str(response.content))
    return schema_cls.model_validate(payload)


def estimate_text_tokens(*texts: str) -> int:
    total = 0
    for text in texts:
        normalized = (text or "").strip()
        if not normalized:
            continue
        if re.search(r"[\u4e00-\u9fff]", normalized):
            total += len(normalized)
        else:
            total += max(1, math.ceil(len(normalized.split()) * 1.4))
    return total


def create_macro_segments(duration_tier: str, total_duration_ms: int, segment_count: int) -> list[MacroSegment]:
    if duration_tier != "ultra_long" or segment_count <= 0:
        return [
            {
                "index": 0,
                "target_duration_ms": total_duration_ms,
                "status": "pending",
                "audio_path": None,
                "script_json": None,
                "segment_start_index": 0,
                "segment_end_index": max(0, segment_count - 1),
            }
        ]

    target_total = max(total_duration_ms, TARGET_DURATION_BY_TIER_MS["ultra_long"])
    macro_count = max(2, math.ceil(target_total / MACRO_SEGMENT_TARGET_MS))
    macro_count = min(macro_count, max(2, segment_count))
    base_size = max(1, segment_count // macro_count)
    remainder = segment_count % macro_count
    macro_segments: list[MacroSegment] = []
    cursor = 0

    for index in range(macro_count):
        group_size = base_size + (1 if index < remainder else 0)
        start_index = cursor
        end_index = min(segment_count - 1, start_index + group_size - 1)
        cursor = end_index + 1
        segment_span = max(1, end_index - start_index + 1)
        macro_segments.append(
            {
                "index": index,
                "target_duration_ms": math.ceil(target_total / macro_count),
                "status": "pending",
                "audio_path": None,
                "script_json": None,
                "segment_start_index": start_index,
                "segment_end_index": end_index,
            }
        )
        if cursor >= segment_count:
            break

    return macro_segments


def stitch_audio_segments(
    segment_files: list[str],
    output_path: str,
    crossfade_ms: int = 300,
    speaker_gap_ms: int = 500,
    output_format: str = "mp3",
) -> dict[str, int | str]:
    if not segment_files:
        raise ValueError("No audio segments to stitch")

    try:
        from pydub import AudioSegment
        from pydub.effects import normalize
    except ImportError:
        first = Path(segment_files[0])
        Path(output_path).write_bytes(first.read_bytes())
        return {
            "file_path": output_path,
            "duration_ms": 0,
            "file_size_bytes": Path(output_path).stat().st_size,
        }

    merged = AudioSegment.silent(duration=0)
    for index, segment_file in enumerate(segment_files):
        segment_audio = AudioSegment.from_file(segment_file)
        if index == 0:
            merged = segment_audio
            continue
        gap = AudioSegment.silent(duration=speaker_gap_ms)
        merged = merged.append(gap + segment_audio, crossfade=min(crossfade_ms, len(segment_audio) // 2))

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    merged = normalize(merged)
    merged.export(output_path, format=output_format)
    return {
        "file_path": output_path,
        "duration_ms": len(merged),
        "file_size_bytes": Path(output_path).stat().st_size,
    }
