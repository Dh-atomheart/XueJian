from __future__ import annotations

import importlib
import sys


REQUIRED_MODULES = [
    ("langchain_anthropic", "langchain-anthropic"),
    ("litellm", "litellm"),
    ("pydantic_ai", "pydantic-ai"),
    ("docling", "docling"),
    ("fitz", "pymupdf"),
    ("genanki", "genanki"),
    ("edge_tts", "edge-tts"),
    ("pydub", "pydub"),
    ("elevenlabs", "elevenlabs"),
    ("fish_audio_sdk", "fish-audio-sdk"),
]


def main() -> int:
    missing: list[str] = []

    for module_name, package_name in REQUIRED_MODULES:
        try:
            importlib.import_module(module_name)
        except Exception:
            missing.append(package_name)

    if missing:
        print("Missing orchestration dependencies:")
        for package_name in missing:
            print(f"- {package_name}")
        return 1

    print("All orchestration dependencies are importable.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
