from orchestration_service.tools import TOOL_REGISTRY


def _child_chunk(chunk_id: str = "child-1"):
    return {
        "id": chunk_id,
        "chunkId": chunk_id,
        "documentId": "doc-1",
        "sectionId": "section-1",
        "anchorId": f"anchor-{chunk_id}",
        "pageStart": 1,
        "pageEnd": 1,
        "chunkIndex": 1,
        "chunkKind": "child",
        "content": "检索练习通过主动回忆强化提取路径，并帮助暴露知识盲点。",
        "score": 0.92,
    }


class CardHost:
    def __init__(self):
        self.persisted: list[dict] = []
        self.emitted_events: list[dict] = []
        self.saved_checkpoints: list[dict] = []

    def is_run_cancelled(self, run_id):
        return False

    def get_document(self, document_id):
        return {"id": document_id, "title": "测试文档"}

    def list_chunks(self, document_id):
        return [_child_chunk()]

    def persist_candidates(self, run_id, document_id, candidates):
        self.persisted.extend(candidates)
        return {"insertedCount": len(candidates), "duplicateCount": 0}

    def emit_workflow_event(self, run_id, event_type, message=None, progress=None, payload=None):
        self.emitted_events.append(
            {
                "runId": run_id,
                "eventType": event_type,
                "message": message,
                "progress": progress,
                "payload": payload,
            }
        )
        return {"stored": True}

    def save_checkpoint(self, run_id, checkpoint):
        self.saved_checkpoints.append({"runId": run_id, "checkpoint": checkpoint})
        return {"stored": True}


def test_audit_card_source_quotes_filters_invalid_candidate():
    result = TOOL_REGISTRY.invoke(
        "audit_card_source_quotes",
        {
            "candidates": [
                {
                    "front": "检索练习：核心优点",
                    "back": "它通过主动回忆强化提取路径。",
                    "sourceQuote": "主动回忆强化提取路径",
                    "sourceChunkIds": ["child-1"],
                    "dedupeKey": "a",
                },
                {
                    "front": "坏卡片",
                    "back": "没有真实来源。",
                    "sourceQuote": "不存在的引文",
                    "sourceChunkIds": ["child-1"],
                    "dedupeKey": "b",
                },
            ],
            "chunks": [_child_chunk()],
        },
        caller="langgraph_card",
    )

    assert len(result["passed_candidates"]) == 1
    assert len(result["failed_candidates"]) == 1
    assert result["audit_summary"]["auditStatus"] == "filtered"


def test_generate_card_candidates_maps_generated_cards(monkeypatch):
    monkeypatch.setattr(
        "orchestration_service.tools.card_tools.generate_chunk_cards",
        lambda **kwargs: {
            "status": "ok",
            "cards": [
                {
                    "title": "检索练习",
                    "front": "检索练习：核心优点",
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

    result = TOOL_REGISTRY.invoke(
        "generate_card_candidates",
        {
            "run_id": "run-1",
            "document_id": "doc-1",
            "concepts": [{"name": "检索练习", "chunkIds": ["child-1"]}],
            "chunks": [_child_chunk()],
            "density": "medium",
            "provider_config_id": "config-1",
            "host_ref": CardHost(),
        },
        caller="langgraph_card",
    )

    assert result["discarded_count"] == 0
    assert len(result["candidates"]) == 1
    candidate = result["candidates"][0]
    assert candidate["sourceChunkIds"] == ["child-1"]
    assert candidate["dedupeKey"]
    assert candidate["generationMode"] == "agent_card_tool"


def test_card_tools_reject_legacy_card_generation_agent_caller():
    try:
        TOOL_REGISTRY.invoke(
            "content_map",
            {"document_id": "doc-1", "chunks": [_child_chunk()]},
            caller="card_generation_agent",
        )
    except Exception as exc:
        assert getattr(exc, "error_category", None) == "caller_not_allowed"
    else:
        raise AssertionError("expected caller_not_allowed")


def test_card_tool_candidate_pipeline_submits_validated_candidates(monkeypatch):
    monkeypatch.setattr(
        "orchestration_service.tools.card_tools.generate_chunk_cards",
        lambda **kwargs: {
            "status": "ok",
            "cards": [
                {
                    "title": "检索练习",
                    "front": "检索练习：核心优点",
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
    host = CardHost()

    content_map = TOOL_REGISTRY.invoke(
        "content_map",
        {"document_id": "doc-1", "chunks": [_child_chunk()]},
        caller="langgraph_card",
    )
    generated = TOOL_REGISTRY.invoke(
        "generate_card_candidates",
        {
            "run_id": "run-1",
            "document_id": "doc-1",
            "concepts": content_map["concepts"],
            "chunks": [_child_chunk()],
            "density": "medium",
            "provider_config_id": "config-1",
            "host_ref": host,
        },
        caller="langgraph_card",
    )
    audited = TOOL_REGISTRY.invoke(
        "audit_card_source_quotes",
        {"candidates": generated["candidates"], "chunks": [_child_chunk()]},
        caller="langgraph_card",
    )
    critiqued = TOOL_REGISTRY.invoke(
        "critique_card_candidates",
        {"candidates": audited["passed_candidates"]},
        caller="langgraph_card",
    )
    deduped = TOOL_REGISTRY.invoke(
        "dedupe_card_candidates",
        {"candidates": critiqued["critiqued_candidates"]},
        caller="langgraph_card",
    )
    result = TOOL_REGISTRY.invoke(
        "submit_card_candidates",
        {
            "run_id": "run-1",
            "document_id": "doc-1",
            "candidates": deduped["deduplicated_candidates"],
            "host_ref": host,
        },
        caller="langgraph_card",
    )

    assert result["submitted_count"] == 1
    assert len(host.persisted) == 1
