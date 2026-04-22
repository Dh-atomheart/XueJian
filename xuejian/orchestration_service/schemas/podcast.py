"""Pydantic schemas for podcast workflow structured output."""
from __future__ import annotations

from pydantic import BaseModel, Field


class OutlineSpeakerAssignment(BaseModel):
    speaker_id: str
    role: str


class OutlineSegment(BaseModel):
    segment_index: int = Field(ge=0)
    topic: str
    key_points: list[str]
    target_duration_ms: int = Field(ge=1000)
    speaker_assignments: list[OutlineSpeakerAssignment]


class PodcastOutlineSchema(BaseModel):
    title: str
    description: str
    total_target_duration_ms: int = Field(ge=1000)
    segments: list[OutlineSegment] = Field(min_length=1)


class DialogueLine(BaseModel):
    id: str
    speaker: str
    text: str
    duration_ms: int = Field(ge=500)


class PodcastScriptSchema(BaseModel):
    title: str
    description: str
    speakers: list[str]
    outline: list[str]
    segments: list[DialogueLine]


class ScriptEvaluationSchema(BaseModel):
    coherence: float = Field(ge=1, le=10)
    accuracy: float = Field(ge=1, le=10)
    style_consistency: float = Field(ge=1, le=10)
    naturalness: float = Field(ge=1, le=10)
    overall_score: float = Field(ge=1, le=10)
    issues: list[str]
    suggestions: list[str]
    revised: bool = False