import pytest

from orchestration_service.evals.cardgraph_quality_eval import (
    CardGraphFakeHost,
    run_all_cases,
    run_candidate_happy_path,
    run_duplicate_case,
    run_evidence_not_trusted_case,
    run_low_quality_case,
    run_quote_invalid_case,
)
from orchestration_service.tools import card_tools


def _good_generation(**kwargs):
    return {
        "status": "ok",
        "cards": [
            {
                "title": "检索练习",
                "front": "检索练习的核心优点是什么？",
                "back": "它通过主动回忆强化提取路径，并帮助暴露知识盲点。",
                "sourcePage": 1,
                "sourceQuote": "主动回忆强化提取路径",
                "sourceChunkId": "chunk-1",
                "tags": ["学习方法"],
            }
        ],
        "discardedCount": 0,
    }


def _bad_quote_generation(**kwargs):
    return {
        "status": "ok",
        "cards": [
            {
                "front": "坏卡片",
                "back": "没有真实来源。",
                "sourceQuote": "不存在的引文",
                "sourceChunkId": "chunk-1",
                "tags": [],
            }
        ],
        "discardedCount": 0,
    }


def _duplicate_generation(**kwargs):
    return {
        "status": "ok",
        "cards": [
            {
                "front": "检索练习的核心优点是什么？",
                "back": "它通过主动回忆强化提取路径。",
                "sourceQuote": "主动回忆强化提取路径",
                "sourceChunkId": "chunk-1",
                "tags": [],
            },
            {
                "front": "检索练习的核心优点是什么？",
                "back": "它通过主动回忆强化提取路径。",
                "sourceQuote": "主动回忆强化提取路径",
                "sourceChunkId": "chunk-1",
                "tags": [],
            },
        ],
        "discardedCount": 0,
    }


def _low_quality_generation(**kwargs):
    return {
        "status": "ok",
        "cards": [
            {
                "front": "低质量卡片",
                "back": "答案。",
                "sourceQuote": "",
                "sourceChunkId": "",
                "tags": [],
                "scoreOverall": 0.3,
            }
        ],
        "discardedCount": 0,
    }


@pytest.fixture
def mock_good(monkeypatch):
    monkeypatch.setattr(card_tools, "generate_chunk_cards", _good_generation)


def test_run_quote_invalid_case(monkeypatch):
    monkeypatch.setattr(card_tools, "generate_chunk_cards", _bad_quote_generation)
    result = run_quote_invalid_case()
    assert result.status == "failed"
    assert result.blocking_reasons == []
    assert "source_quote_invalid" in result.actual_behavior


def test_run_duplicate_case(monkeypatch):
    monkeypatch.setattr(card_tools, "generate_chunk_cards", _duplicate_generation)
    result = run_duplicate_case()
    assert result.blocking_reasons == []
    assert "dedupe_required" in result.actual_behavior


def test_run_low_quality_case(monkeypatch):
    monkeypatch.setattr(card_tools, "generate_chunk_cards", _low_quality_generation)
    result = run_low_quality_case()
    assert result.blocking_reasons == []
    assert result.metadata["rejection_rate"] > 0


def test_run_evidence_not_trusted_case(monkeypatch):
    monkeypatch.setattr(card_tools, "generate_chunk_cards", _good_generation)
    result = run_evidence_not_trusted_case()
    assert result.blocking_reasons == []
    assert "evidence_not_trusted" in result.actual_behavior


def test_run_candidate_happy_path(monkeypatch):
    monkeypatch.setattr(card_tools, "generate_chunk_cards", _good_generation)
    result = run_candidate_happy_path()
    assert result.blocking_reasons == []
    assert result.status == "completed"


def test_run_all_cases_returns_suite(monkeypatch):
    monkeypatch.setattr(card_tools, "generate_chunk_cards", _good_generation)
    suite = run_all_cases()
    assert suite.name == "cardgraph-quality"
    assert len(suite.cases) == 5
    assert suite.summary["caseCount"] == 5
