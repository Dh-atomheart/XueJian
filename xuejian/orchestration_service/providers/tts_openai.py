"""OpenAI TTS provider implementation."""
from __future__ import annotations

import asyncio
import math

from .tts_base import TTSResult, VoiceInfo


VOICE_MAP: dict[str, dict[str, str]] = {
    "zh-CN": {"host": "nova", "expert": "onyx", "narrator": "alloy"},
    "en-US": {"host": "nova", "expert": "onyx", "narrator": "alloy"},
    "ja-JP": {"host": "shimmer", "expert": "echo", "narrator": "alloy"},
    "ko-KR": {"host": "nova", "expert": "onyx", "narrator": "alloy"},
}


class OpenAITTSProvider:
    provider_id = "openai"

    def __init__(self, api_key: str, model: str = "tts-1") -> None:
        self._api_key = api_key
        self._model = model or "tts-1"

    async def synthesize(
        self,
        text: str,
        voice_id: str,
        language: str,
        output_path: str,
        speed: float = 1.0,
    ) -> TTSResult:
        from openai import OpenAI

        safe_speed = max(0.5, min(2.0, speed))

        def _run() -> None:
            client = OpenAI(api_key=self._api_key)
            response = client.audio.speech.create(
                model=self._model,
                voice=voice_id,
                input=text,
                speed=safe_speed,
                response_format="mp3",
            )
            response.stream_to_file(output_path)

        await asyncio.to_thread(_run)
        duration_ms = max(1000, math.ceil(len(text) * 160 / safe_speed))
        return {
            "file_path": output_path,
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
                "gender": "female" if role == "host" else "neutral",
                "personality": "warm" if role == "host" else "authoritative",
            }
            for role, voice_id in voices.items()
        ]

    def is_available(self) -> bool:
        if not self._api_key:
            return False
        try:
            import openai  # noqa: F401
        except ImportError:
            return False
        return True