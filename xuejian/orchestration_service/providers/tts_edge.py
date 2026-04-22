"""Edge-TTS provider implementation."""
from __future__ import annotations

import math

from .tts_base import TTSResult, VoiceInfo


VOICE_MAP: dict[str, dict[str, str]] = {
    "zh-CN": {
        "host": "zh-CN-XiaoxiaoNeural",
        "expert": "zh-CN-YunxiNeural",
        "narrator": "zh-CN-YunjianNeural",
    },
    "en-US": {
        "host": "en-US-JennyNeural",
        "expert": "en-US-GuyNeural",
        "narrator": "en-US-AriaNeural",
    },
    "ja-JP": {
        "host": "ja-JP-NanamiNeural",
        "expert": "ja-JP-KeitaNeural",
        "narrator": "ja-JP-NanamiNeural",
    },
    "ko-KR": {
        "host": "ko-KR-SunHiNeural",
        "expert": "ko-KR-InJoonNeural",
        "narrator": "ko-KR-SunHiNeural",
    },
}


class EdgeTTSProvider:
    provider_id = "edge_tts"
    model = "edge-neural"

    async def synthesize(
        self,
        text: str,
        voice_id: str,
        language: str,
        output_path: str,
        speed: float = 1.0,
    ) -> TTSResult:
        import edge_tts

        safe_speed = max(0.5, min(2.0, speed))
        rate_percent = int((safe_speed - 1.0) * 100)
        rate = f"{rate_percent:+d}%"
        communicator = edge_tts.Communicate(text=text, voice=voice_id, rate=rate)
        await communicator.save(output_path)

        duration_ms = max(1000, math.ceil(len(text) * 170 / safe_speed))
        return {
            "file_path": output_path,
            "duration_ms": duration_ms,
            "provider": self.provider_id,
            "voice_id": voice_id,
            "model": self.model,
        }

    def list_voices(self, language: str) -> list[VoiceInfo]:
        voices = VOICE_MAP.get(language, VOICE_MAP.get("en-US", {}))
        return [
            {
                "voice_id": voice_id,
                "name": role,
                "language": language,
                "gender": "female" if role in {"host", "narrator"} else "male",
                "personality": "warm" if role == "host" else "authoritative",
            }
            for role, voice_id in voices.items()
        ]

    def is_available(self) -> bool:
        try:
            import edge_tts  # noqa: F401
        except ImportError:
            return False
        return True