"""Shared TTS provider types and protocol."""
from __future__ import annotations

from typing import Protocol, TypedDict


class TTSResult(TypedDict):
    file_path: str
    duration_ms: int
    provider: str
    voice_id: str
    model: str


class VoiceInfo(TypedDict):
    voice_id: str
    name: str
    language: str
    gender: str
    personality: str


class TTSProvider(Protocol):
    async def synthesize(
        self,
        text: str,
        voice_id: str,
        language: str,
        output_path: str,
        speed: float = 1.0,
    ) -> TTSResult:
        ...

    def list_voices(self, language: str) -> list[VoiceInfo]:
        ...

    def is_available(self) -> bool:
        ...