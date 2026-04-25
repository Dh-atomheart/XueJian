"""Podcast workflow — multi-stage retrieval, script, evaluation, and TTS orchestration."""
from __future__ import annotations

import asyncio
import json
import logging
import shutil
from pathlib import Path
from typing import TYPE_CHECKING, Any, TypeVar

from pydantic import BaseModel, Field

from ..providers.embedding_runtime import embed_texts
from ..providers.runtime import estimate_workflow_cost
from ..providers.tts_router import TTSRouter
from ..schemas.podcast import DialogueLine, PodcastOutlineSchema, PodcastScriptSchema, ScriptEvaluationSchema
from .podcast_utils import (
    STYLE_PROMPTS,
    approximate_duration_ms,
    build_roles,
    create_macro_segments,
    estimate_text_tokens,
    invoke_structured_model,
    make_episode_dir,
    select_retrieval_limit,
    stitch_audio_segments,
    target_segment_count,
)

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

DEFAULT_LLM_COST_PER_1K_TOKENS = 0.0025
TTS_COST_PER_1K_CHARS = {
    "auto": 0.015,
    "google": 0.012,
    "openai": 0.015,
    "edge_tts": 0.0,
    "elevenlabs": 0.03,
    "fish_audio": 0.02,
}


class SegmentDialogueBatch(BaseModel):
    segments: list[DialogueLine] = Field(min_length=1)


class RevisedScriptEnvelope(BaseModel):
    revised_script: PodcastScriptSchema


def _serialize_json(payload: BaseModel | dict[str, Any]) -> str:
    def snake_to_camel(key: str) -> str:
        parts = key.split("_")
        return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])

    def convert_keys(value: Any) -> Any:
        if isinstance(value, list):
            return [convert_keys(item) for item in value]
        if isinstance(value, dict):
            return {snake_to_camel(str(key)): convert_keys(item) for key, item in value.items()}
        return value

    if isinstance(payload, BaseModel):
        return json.dumps(convert_keys(payload.model_dump()), ensure_ascii=False)
    return json.dumps(convert_keys(payload), ensure_ascii=False)


def _deserialize_json(raw_json: str | None, schema_cls: type[T]) -> T | None:
    def camel_to_snake(key: str) -> str:
        output = []
        for char in key:
            if char.isupper():
                output.append("_")
                output.append(char.lower())
            else:
                output.append(char)
        return "".join(output)

    def convert_keys(value: Any) -> Any:
        if isinstance(value, list):
            return [convert_keys(item) for item in value]
        if isinstance(value, dict):
            return {camel_to_snake(str(key)): convert_keys(item) for key, item in value.items()}
        return value

    if not raw_json:
        return None
    try:
        return schema_cls.model_validate(convert_keys(json.loads(raw_json)))
    except Exception:
        return None


def _safe_emit_event(
    host: HostGatewayClient,
    run_id: str,
    event_type: str,
    message: str,
    progress: float | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    if not run_id:
        return
    try:
        host.emit_workflow_event(run_id, event_type, message=message, progress=progress, payload=payload)
    except Exception as exc:
        logger.warning("Failed to emit workflow event for run %s: %s", run_id[:8], exc)


def _safe_save_checkpoint(
    host: HostGatewayClient,
    run_id: str,
    checkpoint_ref: str,
    step_key: str,
    payload: dict[str, Any],
) -> None:
    if not run_id:
        return
    try:
        host.save_checkpoint(
            run_id,
            {
                "checkpointRef": checkpoint_ref,
                "stepKey": step_key,
                "payload": payload,
            },
        )
    except Exception as exc:
        logger.warning("Failed to save checkpoint for run %s: %s", run_id[:8], exc)


def _is_cancelled(host: HostGatewayClient, run_id: str) -> bool:
    return bool(run_id and host.is_run_cancelled(run_id))


def _load_app_settings(host: HostGatewayClient) -> dict[str, Any]:
    try:
        return host.get_app_settings() or {}
    except Exception as exc:
        logger.warning("Failed to load podcast app settings: %s", exc)
        return {}


def _resolve_podcasts_root(host: HostGatewayClient) -> str:
    try:
        runtime_paths = host.get_runtime_paths() or {}
        podcasts_dir = runtime_paths.get("podcastsDir")
        if isinstance(podcasts_dir, str) and podcasts_dir.strip():
            return podcasts_dir.strip()
    except Exception as exc:
        logger.warning("Failed to resolve podcast runtime paths: %s", exc)

    fallback_dir = Path.cwd() / "runtime" / "podcasts"
    fallback_dir.mkdir(parents=True, exist_ok=True)
    return str(fallback_dir)


def _estimate_total_cost_usd(llm_tokens: int, tts_characters: int, provider_id: str) -> float:
    llm_cost = (max(0, llm_tokens) / 1000.0) * DEFAULT_LLM_COST_PER_1K_TOKENS
    tts_rate = TTS_COST_PER_1K_CHARS.get(provider_id, TTS_COST_PER_1K_CHARS["auto"])
    tts_cost = (max(0, tts_characters) / 1000.0) * tts_rate
    return round(llm_cost + tts_cost, 6)


def _apply_budget_usage(
    app_settings: dict[str, Any],
    budget_state: dict[str, float],
    *,
    provider_id: str,
    llm_tokens_delta: int = 0,
    tts_characters_delta: int = 0,
) -> None:
    next_llm_tokens = int(budget_state.get("llmTokens", 0)) + max(0, llm_tokens_delta)
    next_tts_characters = int(budget_state.get("ttsCharacters", 0)) + max(0, tts_characters_delta)
    next_cost = _estimate_total_cost_usd(next_llm_tokens, next_tts_characters, provider_id)

    max_llm_tokens = int(app_settings.get("podcastMaxLlmTokens") or 0)
    if max_llm_tokens > 0 and next_llm_tokens > max_llm_tokens:
        raise RuntimeError(
            f"Podcast budget exceeded: estimated LLM tokens {next_llm_tokens} > {max_llm_tokens}"
        )

    max_tts_characters = int(app_settings.get("podcastMaxTtsCharacters") or 0)
    if max_tts_characters > 0 and next_tts_characters > max_tts_characters:
        raise RuntimeError(
            "Podcast budget exceeded: estimated TTS characters "
            f"{next_tts_characters} > {max_tts_characters}"
        )

    max_estimated_cost = float(app_settings.get("podcastMaxEstimatedCostUsd") or 0)
    if max_estimated_cost > 0 and next_cost > max_estimated_cost:
        raise RuntimeError(
            f"Podcast budget exceeded: estimated cost ${next_cost:.4f} > ${max_estimated_cost:.4f}"
        )

    budget_state["llmTokens"] = float(next_llm_tokens)
    budget_state["ttsCharacters"] = float(next_tts_characters)
    budget_state["estimatedCostUsd"] = next_cost


def _cleanup_episode_artifacts(host: HostGatewayClient, episode_id: str, podcasts_root: str) -> None:
    try:
        host.delete_podcast_audio_segments(episode_id)
    except Exception as exc:
        logger.warning("Failed to clear podcast audio segments for %s: %s", episode_id[:8], exc)

    episode_dir = Path(podcasts_root) / episode_id
    if episode_dir.exists():
        shutil.rmtree(episode_dir, ignore_errors=True)


def _speaker_lookup(style: str) -> tuple[list[dict[str, str]], dict[str, str], dict[str, str]]:
    roles = build_roles(style)
    speaker_id_to_name = {item["speaker_id"]: item["name"] for item in roles}
    speaker_name_to_role = {item["name"]: item["speaker_id"] for item in roles}
    speaker_name_to_role.update({item["speaker_id"]: item["speaker_id"] for item in roles})
    return roles, speaker_id_to_name, speaker_name_to_role


def _normalize_script(script: PodcastScriptSchema, style: str) -> PodcastScriptSchema:
    roles, speaker_id_to_name, speaker_name_to_role = _speaker_lookup(style)
    normalized_segments: list[DialogueLine] = []
    fallback_speaker_name = roles[0]["name"]
    valid_names = {item["name"] for item in roles}
    for index, segment in enumerate(script.segments):
        normalized_key = speaker_name_to_role.get(segment.speaker)
        if normalized_key is None:
            normalized_key = speaker_name_to_role.get(segment.speaker.lower())
        speaker = speaker_id_to_name.get(normalized_key or "", segment.speaker)
        if speaker not in valid_names:
            speaker = fallback_speaker_name
        normalized_segments.append(
            DialogueLine(
                id=segment.id or f"seg-{index + 1}",
                speaker=speaker,
                text=segment.text.strip(),
                duration_ms=max(1000, segment.duration_ms),
            )
        )

    return PodcastScriptSchema(
        title=script.title.strip(),
        description=script.description.strip(),
        speakers=[item["name"] for item in roles],
        outline=script.outline,
        segments=normalized_segments,
    )


def _build_query_text(title: str, prompt: str, documents: list[dict[str, Any]]) -> str:
    doc_titles = [str(item.get("title") or item.get("displayTitle") or "").strip() for item in documents]
    doc_titles = [value for value in doc_titles if value]
    parts = [title.strip(), prompt.strip(), " ".join(doc_titles[:3]).strip()]
    return " ".join([part for part in parts if part]).strip()


def _load_documents(host: HostGatewayClient, document_ids: list[str]) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    for document_id in document_ids:
        try:
            document = host.get_document(document_id)
        except Exception as exc:
            logger.warning("Failed to load document %s: %s", document_id[:8], exc)
            document = None
        if document is not None:
            documents.append(document)
    return documents


def _retrieve_chunks(
    host: HostGatewayClient,
    query_text: str,
    document_ids: list[str],
    duration_tier: str,
) -> tuple[list[dict[str, Any]], str]:
    limit = select_retrieval_limit(duration_tier)
    active_profile = host.get_active_embedding_profile()
    if active_profile is not None:
        try:
            query_embedding = embed_texts(
                host,
                active_profile,
                [query_text],
                task_type="RETRIEVAL_QUERY",
            )[0]
            return (
                host.search_hybrid(
                    query_text,
                    query_embedding=query_embedding,
                    document_ids=document_ids or None,
                    limit=limit,
                ),
                "hybrid_rrf",
            )
        except Exception as exc:
            logger.warning("Hybrid retrieval unavailable for podcast workflow: %s", exc)

    return host.search_chunks(query_text, document_ids or None, limit=limit), "fts5"


def _build_outline_fallback(
    title: str,
    style: str,
    duration_tier: str,
    language: str,
    chunks: list[dict[str, Any]],
) -> PodcastOutlineSchema:
    roles, _, _ = _speaker_lookup(style)
    desired_count = max(1, min(target_segment_count(duration_tier), len(chunks) or 3))
    selected_chunks = chunks[:desired_count] if chunks else [{} for _ in range(desired_count)]
    target_duration_ms = {
        "short": 180000,
        "medium": 480000,
        "long": 900000,
        "ultra_long": 1500000,
    }.get(duration_tier, 480000)
    segment_duration = max(45000, target_duration_ms // max(1, len(selected_chunks)))

    segments = []
    for index, chunk in enumerate(selected_chunks):
        snippet = str(chunk.get("snippet") or chunk.get("content") or "核心知识梳理")
        topic = snippet.split("。", 1)[0].split("\n", 1)[0].strip()[:40] or f"第 {index + 1} 部分"
        key_points = [line.strip() for line in snippet.replace("\n", " ").split("。") if line.strip()][:3]
        if not key_points:
            key_points = [f"围绕 {title} 的关键知识点展开"]
        segments.append(
            {
                "segment_index": index,
                "topic": topic,
                "key_points": key_points,
                "target_duration_ms": segment_duration,
                "speaker_assignments": [
                    {"speaker_id": item["speaker_id"], "role": item["role"]}
                    for item in roles
                ],
            }
        )

    return PodcastOutlineSchema.model_validate(
        {
            "title": title,
            "description": f"{language} 学习播客，围绕 {title} 进行结构化讲解。",
            "total_target_duration_ms": segment_duration * len(segments),
            "segments": segments,
        }
    )


def _generate_outline(
    config_with_key: tuple[dict, str] | None,
    title: str,
    prompt: str,
    style: str,
    language: str,
    duration_tier: str,
    chunks: list[dict[str, Any]],
) -> PodcastOutlineSchema:
    if not config_with_key:
        return _build_outline_fallback(title, style, duration_tier, language, chunks)

    config, api_key = config_with_key
    roles = build_roles(style)
    style_config = STYLE_PROMPTS.get(style, STYLE_PROMPTS["interview"])
    supporting_text = "\n\n".join(
        [
            f"[Chunk {index + 1}] {str(chunk.get('snippet') or chunk.get('content') or '')[:500]}"
            for index, chunk in enumerate(chunks)
        ]
    )

    user_prompt = f"""
主题: {title}
用户补充要求: {prompt or '无'}
语言: {language}
时长档位: {duration_tier}
播客风格: {style}
角色设定: {json.dumps(roles, ensure_ascii=False)}

参考材料:
{supporting_text}

请生成播客大纲，并严格输出 JSON。
输出字段:
- title: 播客标题
- description: 一句话摘要
- total_target_duration_ms: 总时长目标
- segments: 数组，每项包含
  - segment_index: 从 0 开始
  - topic: 本段主题
  - key_points: 2-4 个要点
  - target_duration_ms: 该段目标时长
  - speaker_assignments: 数组，每项包含 speaker_id 和 role
"""
    try:
        return invoke_structured_model(
            config,
            api_key,
            style_config["outline_system"],
            user_prompt,
            PodcastOutlineSchema,
            temperature=0.25,
        )
    except Exception as exc:
        logger.warning("Outline generation failed, using fallback: %s", exc)
        return _build_outline_fallback(title, style, duration_tier, language, chunks)


def _build_segment_fallback(
    segment_index: int,
    segment: dict[str, Any],
    style: str,
    language: str,
) -> SegmentDialogueBatch:
    roles, speaker_id_to_name, _ = _speaker_lookup(style)
    primary_name = roles[0]["name"]
    secondary_name = speaker_id_to_name.get("expert", primary_name)
    topic = str(segment.get("topic") or f"第 {segment_index + 1} 部分")
    key_points = segment.get("key_points") or [topic]
    first_text = f"这一部分我们聚焦 {topic}。先把框架讲清楚：{'；'.join(key_points[:2])}。"
    lines = [
        DialogueLine(
            id=f"seg-{segment_index + 1}-1",
            speaker=primary_name,
            text=first_text,
            duration_ms=approximate_duration_ms(first_text, language),
        )
    ]
    if len(roles) > 1:
        second_text = f"可以把它理解为：{'；'.join(key_points[:3])}。真正要记住的是它们之间的联系。"
        lines.append(
            DialogueLine(
                id=f"seg-{segment_index + 1}-2",
                speaker=secondary_name,
                text=second_text,
                duration_ms=approximate_duration_ms(second_text, language),
            )
        )
    return SegmentDialogueBatch(segments=lines)


def _generate_segment_dialogue(
    config_with_key: tuple[dict, str] | None,
    outline: PodcastOutlineSchema,
    segment_index: int,
    style: str,
    language: str,
    prompt: str,
    supporting_chunks: list[dict[str, Any]],
    prior_segments: list[DialogueLine],
) -> SegmentDialogueBatch:
    segment = outline.segments[segment_index]
    if not config_with_key:
        return _build_segment_fallback(segment_index, segment.model_dump(), style, language)

    config, api_key = config_with_key
    roles = build_roles(style)
    style_config = STYLE_PROMPTS.get(style, STYLE_PROMPTS["interview"])
    supporting_text = "\n\n".join(
        [
            f"[Chunk {index + 1}] {str(chunk.get('snippet') or chunk.get('content') or '')[:400]}"
            for index, chunk in enumerate(supporting_chunks[:4])
        ]
    )
    previous_context = "\n".join(
        [f"{item.speaker}: {item.text}" for item in prior_segments[-4:]]
    )
    user_prompt = f"""
播客标题: {outline.title}
语言: {language}
风格: {style}
用户补充要求: {prompt or '无'}
角色设定: {json.dumps(roles, ensure_ascii=False)}
当前段落主题: {segment.topic}
当前段落要点: {json.dumps(segment.key_points, ensure_ascii=False)}
当前段落目标时长: {segment.target_duration_ms}

已生成的上文:
{previous_context or '无'}

参考材料:
{supporting_text}

请只为当前段落生成 2-4 条对话。输出 JSON，字段为:
- segments: 数组
  - id: 唯一字符串
  - speaker: 必须是角色名称之一
  - text: 自然、准确、只基于材料的台词
  - duration_ms: 该条台词估算时长
"""
    try:
        return invoke_structured_model(
            config,
            api_key,
            style_config["script_system"],
            user_prompt,
            SegmentDialogueBatch,
            temperature=0.45,
        )
    except Exception as exc:
        logger.warning("Segment script generation failed, using fallback: %s", exc)
        return _build_segment_fallback(segment_index, segment.model_dump(), style, language)


def _evaluate_script(
    config_with_key: tuple[dict, str] | None,
    outline: PodcastOutlineSchema,
    script: PodcastScriptSchema,
    style: str,
    language: str,
) -> ScriptEvaluationSchema:
    if not config_with_key:
        return ScriptEvaluationSchema(
            coherence=8.0,
            accuracy=7.5,
            style_consistency=8.0,
            naturalness=7.5,
            overall_score=7.8,
            issues=[],
            suggestions=["未使用模型评估，建议人工快速抽查准确性。"],
            revised=False,
        )

    config, api_key = config_with_key
    style_config = STYLE_PROMPTS.get(style, STYLE_PROMPTS["interview"])
    user_prompt = f"""
请评估下面的播客脚本，并输出 JSON。

语言: {language}
风格: {style}
标题: {outline.title}
大纲: {json.dumps(outline.model_dump(), ensure_ascii=False)}
脚本: {json.dumps(script.model_dump(), ensure_ascii=False)}

输出字段:
- coherence: 1-10
- accuracy: 1-10
- style_consistency: 1-10
- naturalness: 1-10
- overall_score: 1-10
- issues: 字符串数组
- suggestions: 字符串数组
- revised: false
"""
    try:
        return invoke_structured_model(
            config,
            api_key,
            f"{style_config['script_system']} 你现在是播客脚本评审员。",
            user_prompt,
            ScriptEvaluationSchema,
            temperature=0.2,
        )
    except Exception as exc:
        logger.warning("Script evaluation failed, using heuristic fallback: %s", exc)
        return ScriptEvaluationSchema(
            coherence=8.0,
            accuracy=7.0,
            style_consistency=7.5,
            naturalness=7.5,
            overall_score=7.5,
            issues=[],
            suggestions=["模型评估失败，建议人工抽查。"],
            revised=False,
        )


def _revise_script(
    config_with_key: tuple[dict, str] | None,
    outline: PodcastOutlineSchema,
    script: PodcastScriptSchema,
    evaluation: ScriptEvaluationSchema,
    style: str,
    language: str,
) -> tuple[PodcastScriptSchema, ScriptEvaluationSchema]:
    if not config_with_key or evaluation.overall_score >= 7.0:
        return script, evaluation

    config, api_key = config_with_key
    style_config = STYLE_PROMPTS.get(style, STYLE_PROMPTS["interview"])
    user_prompt = f"""
请根据评审意见修改播客脚本，输出 JSON。

语言: {language}
风格: {style}
大纲: {json.dumps(outline.model_dump(), ensure_ascii=False)}
当前脚本: {json.dumps(script.model_dump(), ensure_ascii=False)}
评审意见: {json.dumps(evaluation.model_dump(), ensure_ascii=False)}

输出字段:
- revised_script: 一个完整的 PodcastScriptSchema 对象
"""

    try:
        envelope = invoke_structured_model(
            config,
            api_key,
            f"{style_config['script_system']} 根据评审意见重写脚本，保留事实准确性。",
            user_prompt,
            RevisedScriptEnvelope,
            temperature=0.35,
        )
        revised_script = _normalize_script(envelope.revised_script, style)
        revised_evaluation = evaluation.model_copy(update={"revised": True})
        return revised_script, revised_evaluation
    except Exception as exc:
        logger.warning("Script revision failed, keeping original script: %s", exc)
        return script, evaluation


async def _render_audio_segments(
    host: HostGatewayClient,
    run_id: str,
    episode_id: str,
    language: str,
    requested_provider: str,
    audio_format: str,
    style: str,
    script: PodcastScriptSchema,
    podcasts_root: str,
    existing_segments: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], str, int, str, str | None]:
    router = TTSRouter(host)
    provider = router.get_provider(requested_provider)
    fallback_warning: str | None = None
    actual_provider_id = str(getattr(provider, "provider_id", "") or requested_provider or "auto")
    if requested_provider not in {"", "auto"} and actual_provider_id != requested_provider:
        fallback_warning = (
            f"Requested TTS provider '{requested_provider}' was unavailable; "
            f"fell back to '{actual_provider_id}'."
        )
    _, _, speaker_name_to_role = _speaker_lookup(style)

    episode_dir = make_episode_dir(podcasts_root, episode_id)
    segment_paths: list[str] = []
    rendered_segments: list[dict[str, Any]] = []
    existing_by_dialogue_id: dict[str, dict[str, Any]] = {}

    for item in existing_segments or []:
        dialogue_segment_id = str(item.get("dialogueSegmentId") or "").strip()
        file_path = str(item.get("filePath") or "").strip()
        if dialogue_segment_id and file_path and Path(file_path).exists():
            existing_by_dialogue_id[dialogue_segment_id] = item

    for index, segment in enumerate(script.segments):
        if _is_cancelled(host, run_id):
            raise RuntimeError("Workflow cancelled")

        existing_segment = existing_by_dialogue_id.get(segment.id)
        if existing_segment is not None:
            rendered_segments.append(existing_segment)
            segment_paths.append(str(existing_segment["filePath"]))
            continue

        role = speaker_name_to_role.get(segment.speaker, "narrator")
        voice_id = router.resolve_voice(provider, language, role)
        segment_ext = "wav" if getattr(provider, "provider_id", "") == "google" else "mp3"
        segment_path = episode_dir / f"segment-{index + 1:03d}.{segment_ext}"
        result = await provider.synthesize(
            text=segment.text,
            voice_id=voice_id,
            language=language,
            output_path=str(segment_path),
            speed=1.0,
        )

        segment_record = {
            "id": f"{episode_id}-audio-{index + 1}",
            "episodeId": episode_id,
            "dialogueSegmentId": segment.id,
            "speaker": segment.speaker,
            "filePath": result["file_path"],
            "durationMs": int(result["duration_ms"]),
            "ttsProvider": result["provider"],
            "voiceId": result["voice_id"],
        }
        host.save_podcast_audio_segment(segment_record)
        rendered_segments.append(segment_record)
        segment_paths.append(result["file_path"])

        progress = 0.72 + ((index + 1) / max(1, len(script.segments))) * 0.18
        _safe_emit_event(
            host,
            run_id,
            "progress",
            f"已生成第 {index + 1}/{len(script.segments)} 条语音片段",
            progress=min(progress, 0.90),
            payload={
                "stage": 5,
                "completedSegments": len(rendered_segments),
                "totalSegments": len(script.segments),
            },
        )
        _safe_save_checkpoint(
            host,
            run_id,
            "podcast-audio-segments",
            f"audio-segment-{index + 1}",
            {
                "completedSegments": len(rendered_segments),
                "totalSegments": len(script.segments),
                "lastDialogueSegmentId": segment.id,
            },
        )
        host.update_podcast_episode(
            episode_id,
            {
                "status": "generating_audio",
                "currentStage": 5,
                "completedSegments": len(rendered_segments),
                "totalSegments": len(script.segments),
            },
        )

    host.update_podcast_episode(
        episode_id,
        {
            "status": "stitching",
            "currentStage": 5,
            "completedSegments": len(script.segments),
            "totalSegments": len(script.segments),
        },
    )
    output_path = episode_dir / f"episode.{audio_format}"
    actual_audio_format = audio_format
    export_warning: str | None = fallback_warning
    try:
        stitched = stitch_audio_segments(segment_paths, str(output_path), output_format=audio_format)
        final_output_path = str(output_path)
    except Exception as exc:
        if audio_format != "mp3":
            raise
        logger.warning("Podcast mp3 export failed, falling back to wav: %s", exc)
        actual_audio_format = "wav"
        mp3_warning = f"MP3 export failed, fell back to WAV: {exc}"
        export_warning = f"{export_warning} {mp3_warning}".strip() if export_warning else mp3_warning
        output_path = episode_dir / "episode.wav"
        stitched = stitch_audio_segments(segment_paths, str(output_path), output_format="wav")
        final_output_path = str(output_path)
    return (
        rendered_segments,
        final_output_path,
        int(stitched.get("duration_ms") or 0),
        actual_audio_format,
        export_warning,
    )


def _cancel_result(
    host: HostGatewayClient,
    episode_id: str,
    run_id: str,
    podcasts_root: str,
) -> dict[str, Any]:
    _cleanup_episode_artifacts(host, episode_id, podcasts_root)
    host.update_podcast_episode(
        episode_id,
        {
            "status": "cancelled",
            "errorMessage": "Cancelled by user",
        },
    )
    _safe_emit_event(host, run_id, "cancelled", "播客工作流已取消", progress=1.0)
    return {
        "status": "cancelled",
        "currentStage": 0,
        "completedSegments": 0,
        "totalSegments": 0,
    }


def run_podcast_workflow(
    run_id: str,
    episode_id: str,
    title: str,
    document_ids: list[str],
    prompt: str,
    style: str,
    language: str,
    duration_tier: str,
    tts_provider: str,
    audio_format: str,
    host: HostGatewayClient,
) -> dict[str, Any]:
    """Execute the podcast generation workflow with retrieval, scripting, review scoring, and TTS."""
    if not episode_id:
        raise ValueError("episode_id is required")
    if not document_ids:
        raise ValueError("document_ids is required")

    podcasts_root = _resolve_podcasts_root(host)
    if _is_cancelled(host, run_id):
        return _cancel_result(host, episode_id, run_id, podcasts_root)

    episode = host.get_podcast_episode(episode_id) or {}
    checkpoint = host.load_checkpoint(run_id) if run_id else None
    checkpoint_payload = checkpoint.get("payload") if isinstance(checkpoint, dict) else None
    if not isinstance(checkpoint_payload, dict):
        checkpoint_payload = {}
    app_settings = _load_app_settings(host)
    resolved_title = title.strip() or str(episode.get("title") or "AI 学习播客").strip() or "AI 学习播客"
    resolved_style = style or str(episode.get("style") or "interview")
    resolved_language = language or str(episode.get("language") or "zh-CN")
    resolved_duration_tier = duration_tier or str(episode.get("durationTier") or "medium")
    configured_tts_provider = str(app_settings.get("podcastTtsProvider") or "auto")
    configured_audio_format = str(app_settings.get("podcastOutputFormat") or "mp3")
    resolved_tts_provider = tts_provider or str(episode.get("ttsProvider") or configured_tts_provider or "auto")
    if resolved_tts_provider == "auto" and configured_tts_provider != "auto":
        resolved_tts_provider = configured_tts_provider
    resolved_audio_format = audio_format or str(episode.get("audioFormat") or configured_audio_format or "mp3")
    skip_review = True
    existing_stage = int(episode.get("currentStage") or 0)
    budget_state: dict[str, float] = {
        "llmTokens": 0.0,
        "ttsCharacters": 0.0,
        "estimatedCostUsd": 0.0,
    }

    existing_outline = _deserialize_json(episode.get("outlineJson"), PodcastOutlineSchema)
    existing_script = _deserialize_json(episode.get("scriptJson"), PodcastScriptSchema)
    existing_eval = _deserialize_json(episode.get("evaluationJson"), ScriptEvaluationSchema)

    host.update_podcast_episode(
        episode_id,
        {
            "title": resolved_title,
            "documentIds": document_ids,
            "runId": run_id or episode.get("runId"),
            "style": resolved_style,
            "language": resolved_language,
            "durationTier": resolved_duration_tier,
            "ttsProvider": resolved_tts_provider,
            "audioFormat": resolved_audio_format,
            "status": "retrieving" if existing_stage < 1 else episode.get("status") or "retrieving",
        },
    )

    _safe_emit_event(host, run_id, "progress", "开始播客工作流", progress=0.02, payload={"stage": 1})

    documents = _load_documents(host, document_ids)
    query_text = _build_query_text(resolved_title, prompt, documents)
    if not query_text:
        query_text = resolved_title
    _apply_budget_usage(
        app_settings,
        budget_state,
        provider_id=resolved_tts_provider,
        llm_tokens_delta=estimate_text_tokens(
            query_text,
            prompt,
            *[
                str(item.get("title") or item.get("displayTitle") or "")
                for item in documents
            ],
        ),
    )

    config_with_key = host.get_config_for_workflow("podcast_generation")

    if existing_stage < 1 or existing_outline is None:
        chunks, retrieval_mode = _retrieve_chunks(host, query_text, document_ids, resolved_duration_tier)
        if not chunks:
            message = "没有检索到足够的文档内容，无法生成播客。"
            host.update_podcast_episode(
                episode_id,
                {
                    "status": "failed",
                    "currentStage": 1,
                    "errorMessage": message,
                },
            )
            _safe_emit_event(host, run_id, "failed", message, progress=1.0)
            return {
                "status": "failed",
                "currentStage": 1,
                "errorMessage": message,
            }

        host.update_podcast_episode(
            episode_id,
            {
                "status": "retrieving",
                "currentStage": 1,
                "completedSegments": 0,
                "totalSegments": 0,
            },
        )
        _safe_save_checkpoint(
            host,
            run_id,
            "podcast-retrieval",
            "stage-1",
            {
                "query": query_text,
                "retrievalMode": retrieval_mode,
                "chunkCount": len(chunks),
            },
        )
        _safe_emit_event(
            host,
            run_id,
            "progress",
            f"已完成资料检索，共命中 {len(chunks)} 条片段",
            progress=0.18,
            payload={"stage": 1, "chunkCount": len(chunks), "retrievalMode": retrieval_mode},
        )
        _apply_budget_usage(
            app_settings,
            budget_state,
            provider_id=resolved_tts_provider,
            llm_tokens_delta=estimate_text_tokens(
                *[
                    str(chunk.get("snippet") or chunk.get("content") or "")[:500]
                    for chunk in chunks
                ]
            ),
        )

        outline = _generate_outline(
            config_with_key,
            resolved_title,
            prompt,
            resolved_style,
            resolved_language,
            resolved_duration_tier,
            chunks,
        )
        macro_segments = create_macro_segments(
            resolved_duration_tier,
            outline.total_target_duration_ms,
            len(outline.segments),
        )
        existing_outline = outline
        _apply_budget_usage(
            app_settings,
            budget_state,
            provider_id=resolved_tts_provider,
            llm_tokens_delta=estimate_text_tokens(_serialize_json(outline)),
        )
        host.update_podcast_episode(
            episode_id,
            {
                "status": "generating_outline",
                "currentStage": 2,
                "outlineJson": _serialize_json(outline),
                "completedSegments": 0,
                "totalSegments": len(outline.segments),
            },
        )
        _safe_save_checkpoint(
            host,
            run_id,
            "podcast-outline",
            "stage-2",
            {
                **outline.model_dump(),
                "macroSegments": macro_segments,
                "budget": budget_state,
            },
        )

    if _is_cancelled(host, run_id):
        return _cancel_result(host, episode_id, run_id, podcasts_root)

    if existing_outline is None:
        raise RuntimeError("Podcast outline generation failed")

    script = existing_script
    script_checkpoint_completed = int(
        episode.get("completedSegments")
        or checkpoint_payload.get("completedSegments")
        or 0
    )
    if existing_stage < 3 or script is None or script_checkpoint_completed < len(existing_outline.segments):
        generated_segments: list[DialogueLine] = []
        start_outline_index = 0
        if (
            existing_stage == 3
            and script is not None
            and 0 < script_checkpoint_completed < len(existing_outline.segments)
        ):
            generated_segments = list(script.segments)
            start_outline_index = script_checkpoint_completed
            _safe_emit_event(
                host,
                run_id,
                "resumed",
                f"从第 {start_outline_index + 1} 个段落继续生成脚本",
                progress=0.30,
                payload={"stage": 3, "completedSegments": start_outline_index},
            )

        for index in range(start_outline_index, len(existing_outline.segments)):
            if _is_cancelled(host, run_id):
                return _cancel_result(host, episode_id, run_id, podcasts_root)

            segment = existing_outline.segments[index]
            topic_query = f"{segment.topic} {' '.join(segment.key_points)}"
            supporting_chunks, _ = _retrieve_chunks(host, topic_query, document_ids, resolved_duration_tier)
            generated_batch = _generate_segment_dialogue(
                config_with_key,
                existing_outline,
                index,
                resolved_style,
                resolved_language,
                prompt,
                supporting_chunks,
                generated_segments,
            )
            normalized_batch = [
                line.model_copy(
                    update={
                        "id": f"seg-{index + 1}-{line_index + 1}",
                        "duration_ms": max(1000, line.duration_ms),
                    }
                )
                for line_index, line in enumerate(generated_batch.segments)
            ]
            generated_segments.extend(normalized_batch)
            script = PodcastScriptSchema(
                title=existing_outline.title,
                description=existing_outline.description,
                speakers=[role["name"] for role in build_roles(resolved_style)],
                outline=[outline_segment.topic for outline_segment in existing_outline.segments],
                segments=generated_segments,
            )
            script = _normalize_script(script, resolved_style)
            _apply_budget_usage(
                app_settings,
                budget_state,
                provider_id=resolved_tts_provider,
                llm_tokens_delta=estimate_text_tokens(
                    topic_query,
                    *[
                        str(chunk.get("snippet") or chunk.get("content") or "")[:400]
                        for chunk in supporting_chunks[:4]
                    ],
                    *[line.text for line in normalized_batch],
                ),
            )
            host.update_podcast_episode(
                episode_id,
                {
                    "status": "generating_script",
                    "currentStage": 3,
                    "scriptJson": _serialize_json(script),
                    "completedSegments": index + 1,
                    "totalSegments": len(existing_outline.segments),
                },
            )
            _safe_save_checkpoint(
                host,
                run_id,
                "podcast-script",
                f"segment-{index + 1}",
                {
                    "completedSegments": index + 1,
                    "totalSegments": len(existing_outline.segments),
                    "script": script.model_dump(),
                    "budget": budget_state,
                },
            )
            progress = 0.30 + ((index + 1) / max(1, len(existing_outline.segments))) * 0.30
            _safe_emit_event(
                host,
                run_id,
                "progress",
                f"已完成第 {index + 1}/{len(existing_outline.segments)} 个脚本段落",
                progress=min(progress, 0.60),
                payload={"stage": 3, "completedSegments": index + 1, "totalSegments": len(existing_outline.segments)},
            )
    else:
        script = _normalize_script(script, resolved_style)

    if script is None:
        raise RuntimeError("Podcast script generation failed")

    if _is_cancelled(host, run_id):
        return _cancel_result(host, episode_id, run_id, podcasts_root)

    evaluation = existing_eval
    if existing_stage < 4 or evaluation is None:
        evaluation = _evaluate_script(config_with_key, existing_outline, script, resolved_style, resolved_language)
        script, evaluation = _revise_script(config_with_key, existing_outline, script, evaluation, resolved_style, resolved_language)
        _apply_budget_usage(
            app_settings,
            budget_state,
            provider_id=resolved_tts_provider,
            llm_tokens_delta=estimate_text_tokens(
                _serialize_json(existing_outline),
                _serialize_json(script),
                _serialize_json(evaluation),
            ),
        )
        host.update_podcast_episode(
            episode_id,
            {
                "status": "evaluating",
                "currentStage": 4,
                "scriptJson": _serialize_json(script),
                "evaluationJson": _serialize_json(evaluation),
                "completedSegments": len(existing_outline.segments),
                "totalSegments": len(existing_outline.segments),
            },
        )
        _safe_save_checkpoint(
            host,
            run_id,
            "podcast-evaluation",
            "stage-4",
            {
                "script": script.model_dump(),
                "evaluation": evaluation.model_dump(),
                "budget": budget_state,
            },
        )
        _safe_emit_event(
            host,
            run_id,
            "progress",
            f"脚本评估完成，综合得分 {evaluation.overall_score:.1f}",
            progress=0.68,
            payload={"stage": 4, "overallScore": evaluation.overall_score, "revised": evaluation.revised},
        )

    if _is_cancelled(host, run_id):
        return _cancel_result(host, episode_id, run_id, podcasts_root)

    if not skip_review and existing_stage < 5 and episode.get("audioPath") in {None, ""}:
        host.update_podcast_episode(
            episode_id,
            {
                "status": "awaiting_review",
                "currentStage": 4,
                "scriptJson": _serialize_json(script),
                "evaluationJson": _serialize_json(evaluation),
                "outlineJson": _serialize_json(existing_outline),
                "completedSegments": len(existing_outline.segments),
                "totalSegments": len(existing_outline.segments),
                "errorMessage": None,
            },
        )
        _safe_save_checkpoint(
            host,
            run_id,
            "podcast-awaiting-review",
            "stage-4-review",
            {
                "script": script.model_dump(),
                "evaluation": evaluation.model_dump(),
                "outline": existing_outline.model_dump(),
                "budget": budget_state,
            },
        )
        _safe_emit_event(
            host,
            run_id,
            "waiting_confirmation",
            "脚本已生成，等待人工审阅后继续音频阶段",
            progress=0.7,
            payload={"stage": 4, "awaitingReview": True},
        )
        return {
            "status": "awaiting_review",
            "title": script.title,
            "outlineJson": _serialize_json(existing_outline),
            "scriptJson": _serialize_json(script),
            "evaluationJson": _serialize_json(evaluation),
            "currentStage": 4,
            "completedSegments": len(existing_outline.segments),
            "totalSegments": len(existing_outline.segments),
        }

    total_tts_characters = sum(len(segment.text) for segment in script.segments)
    _apply_budget_usage(
        app_settings,
        budget_state,
        provider_id=resolved_tts_provider,
        tts_characters_delta=total_tts_characters,
    )

    existing_audio_segments: list[dict[str, Any]] = []
    if existing_stage >= 5 and episode.get("audioPath") in {None, ""}:
        try:
            existing_audio_segments = host.list_podcast_audio_segments(episode_id)
        except Exception as exc:
            logger.warning("Failed to load existing podcast audio segments for resume: %s", exc)
    else:
        _cleanup_episode_artifacts(host, episode_id, podcasts_root)

    host.update_podcast_episode(
        episode_id,
        {
            "status": "generating_audio",
            "currentStage": 5,
            "completedSegments": len(existing_audio_segments),
            "totalSegments": len(script.segments),
            "scriptJson": _serialize_json(script),
            "evaluationJson": _serialize_json(evaluation),
            "outlineJson": _serialize_json(existing_outline),
        },
    )
    _safe_emit_event(host, run_id, "progress", "开始生成语音片段", progress=0.72, payload={"stage": 5})

    rendered_segments, final_audio_path, duration_ms, actual_audio_format, audio_warning = asyncio.run(
        _render_audio_segments(
            host,
            run_id,
            episode_id,
            resolved_language,
            resolved_tts_provider,
            resolved_audio_format,
            resolved_style,
            script,
            podcasts_root,
            existing_audio_segments,
        )
    )

    host.update_podcast_episode(
        episode_id,
        {
            "status": "ready",
            "currentStage": 6,
            "audioPath": final_audio_path,
            "audioFormat": actual_audio_format,
            "durationMs": duration_ms,
            "completedSegments": len(script.segments),
            "totalSegments": len(script.segments),
            "scriptJson": _serialize_json(script),
            "outlineJson": _serialize_json(existing_outline),
            "evaluationJson": _serialize_json(evaluation),
            "errorMessage": audio_warning,
        },
    )
    _safe_save_checkpoint(
        host,
        run_id,
        "podcast-audio",
        "stage-6",
        {
            "audioPath": final_audio_path,
            "audioFormat": actual_audio_format,
            "durationMs": duration_ms,
            "audioSegments": rendered_segments,
            "warning": audio_warning,
            "budget": budget_state,
        },
    )
    _safe_emit_event(
        host,
        run_id,
        "completed",
        "播客音频已生成完成",
        progress=1.0,
        payload={
            "stage": 6,
            "audioPath": final_audio_path,
            "audioFormat": actual_audio_format,
            "durationMs": duration_ms,
            "audioSegmentCount": len(rendered_segments),
            "estimatedCostUsd": budget_state["estimatedCostUsd"],
            "warning": audio_warning,
        },
    )

    if config_with_key is not None:
        config, _api_key = config_with_key
        if config.get("id"):
            try:
                host.record_workflow_cost(config["id"], estimate_workflow_cost(config))
            except Exception as exc:
                logger.warning("Failed to record podcast cost: %s", exc)

    return {
        "status": "ready",
        "title": script.title,
        "outlineJson": _serialize_json(existing_outline),
        "scriptJson": _serialize_json(script),
        "evaluationJson": _serialize_json(evaluation),
        "audioPath": final_audio_path,
        "audioFormat": actual_audio_format,
        "durationMs": duration_ms,
        "currentStage": 6,
        "completedSegments": len(script.segments),
        "totalSegments": len(script.segments),
        "audioSegments": rendered_segments,
        "estimatedCostUsd": budget_state["estimatedCostUsd"],
        "warning": audio_warning,
    }
