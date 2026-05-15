import pytest

from orchestration_service.graphs.card_graph import CardGraphRunner, build_card_graph
from orchestration_service.tools import card_tools


def _child_chunk(chunk_id: str = "child-1"):
    return {
        "id": chunk_id,
        "chunkId": chunk_id,
        "documentId": "doc-1",
        "sectionId": "section-1",
        "anchorId": f"anchor-{chunk_id}",
        "pageStart": 1,
        "chunkKind": "child",
        "content": "检索练习通过主动回忆强化提取路径，并帮助暴露知识盲点。",
        "score": 0.92,
    }


class CardGraphHost:
    def __init__(self, chunks=None, *, fail_write=False, omit_created_ids=False):
        self.chunks = chunks if chunks is not None else [_child_chunk()]
        self.persisted_candidates = []
        self.persisted_cards = []
        self.emitted_events = []
        self.saved_checkpoints = []
        self.fail_write = fail_write
        self.omit_created_ids = omit_created_ids

    def list_chunks(self, document_id):
        return list(self.chunks)

    def persist_candidates(self, run_id, document_id, candidates):
        self.persisted_candidates.extend(candidates)
        return {"insertedCount": len(candidates), "duplicateCount": 0}

    def persist_cards(self, run_id, document_id, cards):
        if self.fail_write:
            raise RuntimeError("host write failed")
        self.persisted_cards.extend(cards)
        return {
            "createdCount": len(cards),
            "createdCardIds": [] if self.omit_created_ids else [f"card-{index + 1}" for index, _card in enumerate(cards)],
            "skippedDuplicates": 0,
            "discardedLowQuality": 0,
        }

    def emit_workflow_event(self, run_id, event_type, message=None, progress=None, payload=None):
        self.emitted_events.append({"runId": run_id, "eventType": event_type, "payload": payload})
        return {"stored": True}

    def save_checkpoint(self, run_id, checkpoint):
        self.saved_checkpoints.append({"runId": run_id, "checkpoint": checkpoint})
        return {"stored": True}


@pytest.fixture(autouse=True)
def _mock_generation(monkeypatch):
    monkeypatch.setattr(
        card_tools,
        "generate_chunk_cards",
        lambda **kwargs: {
            "status": "ok",
            "cards": [
                {
                    "title": "检索练习",
                    "front": "检索练习的核心优点是什么？",
                    "back": "它通过主动回忆强化提取路径，并帮助暴露知识盲点。",
                    "sourcePage": 1,
                    "sourceQuote": "主动回忆强化提取路径",
                    "sourceChunkId": "child-1",
                    "tags": ["学习方法"],
                }
            ],
            "discardedCount": 0,
        },
    )


def _run(host, **overrides):
    payload = {
        "document_ids": ["doc-1"],
        "source_chunk_ids": ["child-1"],
        "evidence_artifact_refs": ["knowledge-qa://runs/rag/evidence/child-1"],
        "card_count_hint": 3,
        "difficulty": "medium",
        "write_mode": "candidate",
        "provider_config_id": "config-1",
    }
    payload.update(overrides)
    return CardGraphRunner(host).run("run-card-1", **payload)


def test_card_graph_compiles():
    assert build_card_graph() is not None


def test_candidate_write_happy_path():
    host = CardGraphHost()

    result = _run(host)

    assert result["runtime"] == "langgraph_card"
    assert result["graphVersion"] == "card-graph-v1"
    assert result["status"] == "completed"
    assert result["submittedCount"] == 1
    assert len(host.persisted_candidates) == 1
    assert result["qualityEnvelope"]["riskLevel"] == "low"
    assert result["cardArtifactRefs"]


def test_formal_write_happy_path():
    host = CardGraphHost()

    result = _run(host, write_mode="formal_card")

    assert result["status"] == "completed"
    assert result["createdCardIds"] == ["card-1"]
    assert len(host.persisted_cards) == 1
    assert result["qualityEnvelope"]["riskLevel"] == "low"
    assert any(artifact["artifactType"] == "formal_card_write" for artifact in result["artifacts"].values())


def test_formal_write_blocks_high_risk_evidence():
    host = CardGraphHost()

    result = _run(
        host,
        write_mode="formal_card",
        evidence_artifacts=[
            {
                "artifactType": "evidence",
                "sourceRefs": ["knowledge-qa://runs/rag/evidence/child-1"],
                "qualityEnvelope": {"riskLevel": "high"},
            }
        ],
    )

    assert result["status"] == "partial"
    assert result["errorCategory"] == "evidence_not_trusted"
    assert result["createdCardIds"] == []
    assert not host.persisted_cards


def test_formal_write_blocks_invalid_source_quote(monkeypatch):
    monkeypatch.setattr(
        card_tools,
        "generate_chunk_cards",
        lambda **kwargs: {
            "status": "ok",
            "cards": [
                {
                    "front": "坏卡片",
                    "back": "没有真实来源。",
                    "sourceQuote": "不存在的引文",
                    "sourceChunkId": "child-1",
                    "tags": [],
                }
            ],
            "discardedCount": 0,
        },
    )
    host = CardGraphHost()

    result = _run(host, write_mode="formal_card")

    assert result["status"] == "failed"
    assert result["errorCategory"] == "source_quote_invalid"
    assert not host.persisted_cards


def test_formal_write_blocks_duplicates(monkeypatch):
    def duplicate_cards(**kwargs):
        return {
            "status": "ok",
            "cards": [
                {
                    "front": "检索练习的核心优点是什么？",
                    "back": "它通过主动回忆强化提取路径。",
                    "sourceQuote": "主动回忆强化提取路径",
                    "sourceChunkId": "child-1",
                    "tags": [],
                },
                {
                    "front": "检索练习的核心优点是什么？",
                    "back": "它通过主动回忆强化提取路径。",
                    "sourceQuote": "主动回忆强化提取路径",
                    "sourceChunkId": "child-1",
                    "tags": [],
                },
            ],
            "discardedCount": 0,
        }

    monkeypatch.setattr(card_tools, "generate_chunk_cards", duplicate_cards)
    host = CardGraphHost()

    result = _run(host, write_mode="formal_card")

    assert result["errorCategory"] == "dedupe_required"
    assert "dedupe_required" in result["qualityEnvelope"]["blockingReasons"]
    assert not host.persisted_cards


def test_formal_write_blocks_missing_idempotency_key(monkeypatch):
    monkeypatch.setattr(card_tools, "_compute_dedupe_key", lambda *args, **kwargs: "")
    host = CardGraphHost()

    result = _run(host, write_mode="formal_card")

    assert result["errorCategory"] == "idempotency_key_missing"
    assert "idempotency_key_missing" in result["qualityEnvelope"]["blockingReasons"]
    assert not host.persisted_cards


def test_formal_write_reports_host_write_failure():
    host = CardGraphHost(fail_write=True)

    result = _run(host, write_mode="formal_card")

    assert result["errorCategory"] == "host_write_failed"
    assert result["createdCardIds"] == []


def test_formal_write_requires_returned_card_ids():
    host = CardGraphHost(omit_created_ids=True)

    result = _run(host, write_mode="formal_card")

    assert result["errorCategory"] == "host_write_failed"
    assert result["createdCardIds"] == []


def test_card_graph_returns_stable_failed_payload_on_provider_timeout(monkeypatch):
    def timeout_generation(**kwargs):
        raise TimeoutError("timed out")

    monkeypatch.setattr(card_tools, "generate_chunk_cards", timeout_generation)
    host = CardGraphHost()

    result = _run(host, write_mode="formal_card")

    assert result["status"] == "failed"
    assert result["runtime"] == "langgraph_card"
    assert result["graphVersion"] == "card-graph-v1"
    assert result["errorCategory"] == "provider_timeout"
    assert result["createdCardIds"] == []
    assert "provider_timeout" in result["qualityEnvelope"]["blockingReasons"]
