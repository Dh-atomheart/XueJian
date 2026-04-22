"""ElevenLabs TTS provider implementation."""
from __future__ import annotations

import math

from .tts_base import TTSResult, VoiceInfo


class ElevenLabsTTSProvider:
    provider_id = "elevenlabs"
    model = "eleven_multilingual_v2"

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    async def synthesize(
        self,
        text: str,
        voice_id: str,
        language: str,
        output_path: str,
        speed: float = 1.0,
    ) -> TTSResult:
        from elevenlabs.client import ElevenLabs

        client = ElevenLabs(api_key=self._api_key)
        audio = client.text_to_speech.convert(
            voice_id=voice_id,
            model_id=self.model,
            text=text,
        )
        with open(output_path, "wb") as file_handle:
            for chunk in audio:
                file_handle.write(chunk)

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
            import elevenlabs  # noqa: F401
        except ImportError:
            return False
        return True