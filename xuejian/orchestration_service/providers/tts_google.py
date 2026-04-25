"""Google Gemini native TTS provider implementation."""
from __future__ import annotations

import asyncio
import base64
import math
from pathlib import Path
from typing import Any

from .tts_base import TTSResult, VoiceInfo


VOICE_MAP: dict[str, dict[str, str]] = {
    "zh-CN": {"host": "Kore", "expert": "Puck", "narrator": "Kore"},
    "en-US": {"host": "Kore", "expert": "Puck", "narrator": "Aoede"},
    "ja-JP": {"host": "Kore", "expert": "Puck", "narrator": "Aoede"},
    "ko-KR": {"host": "Kore", "expert": "Puck", "narrator": "Aoede"},
}


def _extract_audio_bytes(response: Any) -> bytes:
    candidates = getattr(response, "candidates", None) or []
    for candidate in candidates:
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) or []
        for part in parts:
            inline_data = getattr(part, "inline_data", None)
            if inline_data is None:
                continue
            data = getattr(inline_data, "data", None)
            if isinstance(data, bytes):
                return data
            if isinstance(data, memoryview):
                return data.tobytes()
            if isinstance(data, str):
                return base64.b64decode(data)

            mime_type = getattr(inline_data, "mime_type", "")
            blob = getattr(part, "text", None)
            if mime_type.startswith("audio/") and isinstance(blob, str):
                return base64.b64decode(blob)

    raise RuntimeError("Google TTS response did not include inline audio data")


class GoogleTTSProvider:
    provider_id = "google"

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash-preview-tts") -> None:
        self._api_key = api_key
        self._model = model or "gemini-2.5-flash-preview-tts"

    async def synthesize(
        self,
        text: str,
        voice_id: str,
        language: str,
        output_path: str,
        speed: float = 1.0,
    ) -> TTSResult:
        from google import genai
        from google.genai import types

        safe_speed = max(0.5, min(2.0, speed))

        def _run() -> bytes:
            client = genai.Client(api_key=self._api_key)
            response = client.models.generate_content(
                model=self._model,
                contents=text,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice_id)
                        )
                    ),
                ),
            )
            return _extract_audio_bytes(response)

        audio_bytes = await asyncio.to_thread(_run)
        target_path = Path(output_path)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(audio_bytes)

        duration_ms = max(1000, math.ceil(len(text) * 170 / safe_speed))
        return {
            "file_path": str(target_path),
            "duration_ms": duration_ms,
            "provider": self.provider_id,
            "voice_id": voice_id,
            "model": self._model,
        }

    def list_voices(self, language: str) -> list[VoiceInfo]:
        voices = VOICE_MAP.get(language, VOICE_MAP.get("en-US", {}))
        return [
            {
                "voice_id": voice_id,
                "name": role,
                "language": language,
                "gender": "neutral",
                "personality": "warm" if role == "host" else "authoritative",
            }
            for role, voice_id in voices.items()
        ]

    def is_available(self) -> bool:
        if not self._api_key:
            return False
        try:
            from google import genai  # noqa: F401
        except ImportError:
            return False
        return True
