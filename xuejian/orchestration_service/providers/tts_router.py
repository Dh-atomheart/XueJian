"""TTS provider routing and voice resolution."""
from __future__ import annotations

import logging

from .tts_base import TTSProvider
from .tts_edge import EdgeTTSProvider, VOICE_MAP as EDGE_VOICE_MAP
from .tts_elevenlabs import ElevenLabsTTSProvider
from .tts_fish import FishAudioTTSProvider
from .tts_openai import OpenAITTSProvider, VOICE_MAP as OPENAI_VOICE_MAP

logger = logging.getLogger(__name__)


class TTSRouter:
    """Route TTS requests to the appropriate provider."""

    def __init__(self, host) -> None:
        self._host = host
        self._providers: dict[str, TTSProvider] = {}
        self._settings = self._load_settings()
        self._voice_overrides = self._settings.get("podcastVoiceOverrides") or {}
        self._init_providers()

    def _load_settings(self) -> dict:
        try:
            return self._host.get_app_settings() or {}
        except Exception as exc:
            logger.warning("Failed to load podcast app settings for TTS routing: %s", exc)
            return {}

    def _init_providers(self) -> None:
        openai_config = self._host.get_config_with_key_by_provider("openai")
        if openai_config is not None:
            config, api_key = openai_config
            provider = OpenAITTSProvider(
                api_key=api_key,
                model=str(
                    self._settings.get("podcastOpenaiModel")
                    or config.get("model")
                    or "tts-1"
                ),
            )
            if provider.is_available():
                self._providers["openai"] = provider

        edge_provider = EdgeTTSProvider()
        if edge_provider.is_available():
            self._providers["edge_tts"] = edge_provider

        elevenlabs_config = self._host.get_config_with_key_by_provider("elevenlabs")
        if elevenlabs_config is not None:
            _config, api_key = elevenlabs_config
            provider = ElevenLabsTTSProvider(api_key=api_key)
            if provider.is_available():
                self._providers["elevenlabs"] = provider

        fish_config = self._host.get_config_with_key_by_provider("fish_audio")
        if fish_config is not None:
            config, api_key = fish_config
            provider = FishAudioTTSProvider(
                api_key=api_key,
                endpoint=self._settings.get("podcastFishAudioEndpoint") or config.get("baseUrl"),
            )
            if provider.is_available():
                self._providers["fish_audio"] = provider

    def get_provider(self, provider_id: str) -> TTSProvider:
        if provider_id != "auto":
            provider = self._providers.get(provider_id)
            if provider is not None:
                return provider

        for fallback_id in ("openai", "elevenlabs", "fish_audio", "edge_tts"):
            provider = self._providers.get(fallback_id)
            if provider is not None:
                return provider

        raise RuntimeError("No available TTS provider")

    def resolve_voice(self, provider: TTSProvider, language: str, role: str) -> str:
        normalized_role = role.lower()
        if normalized_role not in {"host", "expert", "narrator"}:
            normalized_role = "narrator"

        provider_id = getattr(provider, "provider_id", "")
        override_keys = (
            f"{provider_id}:{language}:{normalized_role}",
            f"{provider_id}:{normalized_role}",
            normalized_role,
        )
        for key in override_keys:
            override_voice = self._voice_overrides.get(key)
            if isinstance(override_voice, str) and override_voice.strip():
                return override_voice.strip()

        if provider_id == "openai":
            return OPENAI_VOICE_MAP.get(language, OPENAI_VOICE_MAP["en-US"]).get(normalized_role, "alloy")

        if provider_id == "edge_tts":
            return EDGE_VOICE_MAP.get(language, EDGE_VOICE_MAP["en-US"]).get(normalized_role, "en-US-AriaNeural")

        voices = provider.list_voices(language)
        if voices:
            return voices[0]["voice_id"]

        return "default"