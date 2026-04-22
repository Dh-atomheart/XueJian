"""Fish Audio TTS provider implementation."""
from __future__ import annotations

import math

from .tts_base import TTSResult, VoiceInfo


class FishAudioTTSProvider:
    provider_id = "fish_audio"
    model = "fish-speech"

    def __init__(self, api_key: str, endpoint: str | None = None) -> None:
        self._api_key = api_key
        self._endpoint = endpoint

    async def synthesize(
        self,
        text: str,
        voice_id: str,
        language: str,
        output_path: str,
        speed: float = 1.0,
    ) -> TTSResult:
        from fish_audio_sdk import Session

        session = Session(api_key=self._api_key, endpoint=self._endpoint)
        audio = session.tts(text=text, voice=voice_id)
        with open(output_path, "wb") as file_handle:
            file_handle.write(audio)

        duration_ms = max(1000, math.ceil(len(text) * 160 / max(0.5, speed)))
        return {
            "file_path": output_path,
            "duration_ms": duration_ms,
            "provider": self.provider_id,
            "voice_id": voice_id,
            "model": self.model,
        }

    def list_voices(self, language: str) -> list[VoiceInfo]:
        return []

    def is_available(self) -> bool:
        if not self._api_key:
            return False
        try:
            import fish_audio_sdk  # noqa: F401
        except ImportError:
            return False
        return True