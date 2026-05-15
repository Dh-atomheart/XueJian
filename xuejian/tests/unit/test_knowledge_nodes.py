import pytest

from orchestration_service.graphs import knowledge_nodes
from orchestration_service.workflows import knowledge_qa as workflow


def _chunk(
    chunk_id: str = "child-1",
    content: str = "检索练习通过主动回忆强化提取路径。",
    score: float = 0.92,
    *,
    document_id: str = "doc-1",
):
    return {
        "id": chunk_id,
        "chunkId": chunk_id,
        "documentId": document_id,
        "sectionId": "section-1",
        "anchorId": f"anchor-{chunk_id}",
        "chunkIndex": 1,
        "pageStart": 1,
        "content": content,
        "score": score,
        "vectorRank": 1,
    }


class NodeHost:
    def __init__(self):
        self.recent_messages: list[dict] = []
        self.emitted_events: list[dict] = []
        self.saved_checkpoints: list[dict] = []
        self.config = {"id": "config-1", "provider": "custom_openai", "model": "qa-model"}
        self.api_key = "test-key"

    def is_run_cancelled(self, run_id):
        return False

    def get_config_for_workflow(self, workflow_type):
        if self.config is None:
            return None
        return (dict(self.config), self.api_key)

    def get_active_embedding_profile(self):
        return {"id": "profile-1"}

    def get_document_embedding_readiness(self, profile_id, document_ids=None):
        return {"status": "ready", "documents": []}

    def list_recent_qa_messages(self, conversation_id, limit=4):
        return list(self.recent_messages)

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


def _state(host=None, **overrides):
    host = host or NodeHost()
    state = {
        "run_id": "run-1",
        "question": "检索练习有什么优点",
        "document_ids": ["doc-1"],
        "conversation_id": "conv-1",
        "host_ref": host,
        "config": {"id": "config-1", "provider": "custom_openai", "model": "qa-model"},
        "api_key": "test-key",
        "runtime": "langgraph_rag",
        "graph_version": "knowledge-graph-v1",
        "query_embedding_meta": {"queryEmbeddingStatus": "ready", "cacheHit": False, "attempts": 1, "latencyMs": 6.2},
        "rewrite_summary": workflow._default_rewrite_summary(),
        "retrieval_mode": "hybrid",
        "retrieval_status": "ready",
        "merge_summary": workflow._default_merge_summary(),
        "packing_summary": workflow._default_packing_summary(),
        "rerank_summary": workflow._default_rerank_summary(),
        "gate_summary": workflow._default_gate_summary(),
        "second_retrieval_summary": workflow._default_second_retrieval_summary(),
        "audit_summary": workflow._default_audit_summary(),
        "remediation_count": 0,
        "candidate_chunks": [],
        "expanded_contexts": {},
        "packed_chunks": [],
        "citations": [],
    }
    state.update(overrides)
    return state


def _embed_result(*args, **kwargs):
    class Result:
        vector = [0.1, 0.2]
        cache_hit = False
        attempts = 1
        latency_ms = 6.2
        status = "ready"

    return Result()


def test_initialize_run_sets_runtime_defaults():
    host = NodeHost()

    result = knowledge_nodes.initialize_run(_state(host))

    assert result["runtime"] == "langgraph_rag"
    assert result["graph_version"] == "knowledge-graph-v1"
    assert result["retrieval_status"] == "ready"
    assert result["artifact_refs"] == {}


def test_initialize_run_handles_missing_model_config():
    host = NodeHost()
    host.config = None

    result = knowledge_nodes.initialize_run(_state(host))

    assert result["config"] == {}
    assert result["api_key"] == ""


def test_check_embedding_readiness_returns_embedding_missing_without_profile():
    host = NodeHost()
    host.get_active_embedding_profile = lambda: None

    result = knowledge_nodes.check_embedding_readiness(_state(host))

    assert result["readiness_status"] == "embedding_missing"
    assert result["error_category"] == "embedding_missing"


@pytest.mark.parametrize(
    ("readiness_status", "expected_error"),
    [("embedding_stale", "embedding_stale"), ("ready", None)],
)
def test_check_embedding_readiness_handles_profile_status(monkeypatch, readiness_status, expected_error):
    host = NodeHost()
    monkeypatch.setattr(workflow, "_embedding_readiness_status", lambda *args, **kwargs: readiness_status)

    result = knowledge_nodes.check_embedding_readiness(_state(host))

    assert result["readiness_status"] == readiness_status
    assert result.get("error_category") == expected_error


def test_embed_question_returns_embedding_vector(monkeypatch):
    monkeypatch.setattr(knowledge_nodes, "embed_query_with_resilience", _embed_result)

    result = knowledge_nodes.embed_question(_state(active_profile={"id": "profile-1"}))

    assert result["query_embedding"] == [0.1, 0.2]
    assert result["query_embedding_status"] == "ready"


def test_embed_question_returns_failure_status_on_exception(monkeypatch):
    monkeypatch.setattr(
        knowledge_nodes,
        "embed_query_with_resilience",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("boom")),
    )
    monkeypatch.setattr(workflow, "_embedding_error_status", lambda exc: ("query_embedding_failed", "boom"))

    result = knowledge_nodes.embed_question(_state(active_profile={"id": "profile-1"}))

    assert result["query_embedding"] is None
    assert result["query_embedding_status"] == "query_embedding_failed"
    assert result["retrieval_status"] == "query_embedding_failed"


def test_load_conversation_context_reads_recent_messages(monkeypatch):
    recent_messages = [{"role": "user", "content": "继续说"}]
    monkeypatch.setattr(workflow, "_recent_messages_for_rewrite", lambda *args, **kwargs: recent_messages)

    result = knowledge_nodes.load_conversation_context(_state())

    assert result["recent_messages"] == recent_messages


def test_maybe_rewrite_query_skips_without_model(monkeypatch):
    monkeypatch.setattr(workflow, "_rewrite_trigger_reason", lambda *args, **kwargs: "follow_up_context")

    result = knowledge_nodes.maybe_rewrite_query(
        _state(config={}, recent_messages=[{"role": "user", "content": "继续说"}])
    )

    assert result["rewritten_query"] is None
    assert result["rewrite_summary"]["status"] == "skipped_no_model"


def test_maybe_rewrite_query_marks_failure_on_exception(monkeypatch):
    monkeypatch.setattr(workflow, "_rewrite_trigger_reason", lambda *args, **kwargs: "follow_up_context")
    monkeypatch.setattr(
        workflow,
        "_rewrite_query",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("rewrite failed")),
    )

    result = knowledge_nodes.maybe_rewrite_query(
        _state(recent_messages=[{"role": "user", "content": "继续说"}])
    )

    assert result["rewritten_query"] is None
    assert result["rewrite_summary"]["status"] == "failed"


def test_retrieve_evidence_merges_primary_and_rewritten_queries(monkeypatch):
    calls = []

    def fake_invoke(tool_key, payload):
        calls.append((tool_key, payload.get("rewritten_query") or payload.get("question")))
        if payload.get("rewritten_query"):
            return {"chunks": [_chunk("child-2", "第二次命中了新的证据。")], "retrieval_mode": "fts5"}
        return {"chunks": [_chunk("child-1")], "retrieval_mode": "hybrid"}

    monkeypatch.setattr(knowledge_nodes, "_invoke_tool", fake_invoke)

    result = knowledge_nodes.retrieve_evidence(_state(rewritten_query="补充检索问题"))

    assert calls == [
        ("retrieve_evidence", "检索练习有什么优点"),
        ("retrieve_evidence", "补充检索问题"),
    ]
    assert len(result["candidate_chunks"]) == 2
    assert result["retrieval_summary"]["chunkCount"] == 2


def test_merge_parent_context_returns_expanded_contexts(monkeypatch):
    monkeypatch.setattr(
        knowledge_nodes,
        "_invoke_tool",
        lambda *args, **kwargs: {
            "expanded_contexts": {"child-1": {"parentContent": "上文"}},
            "merge_summary": {"status": "expanded"},
        },
    )

    result = knowledge_nodes.merge_parent_context(_state(candidate_chunks=[_chunk()]))

    assert result["expanded_contexts"]["child-1"]["parentContent"] == "上文"
    assert result["merge_summary"]["status"] == "expanded"


def test_rerank_evidence_returns_reranked_chunks(monkeypatch):
    monkeypatch.setattr(
        knowledge_nodes,
        "_invoke_tool",
        lambda *args, **kwargs: {
            "chunks": [_chunk("child-2", score=0.97), _chunk("child-1", score=0.82)],
            "rerank_summary": {"status": "completed", "chunkCount": 2, "topScore": 0.97},
        },
    )

    result = knowledge_nodes.rerank_evidence(_state(candidate_chunks=[_chunk("child-1"), _chunk("child-2")]))

    assert result["candidate_chunks"][0]["chunkId"] == "child-2"
    assert result["rerank_summary"]["topScore"] == 0.97


def test_relevance_gate_returns_tool_decision(monkeypatch):
    monkeypatch.setattr(
        knowledge_nodes,
        "_invoke_tool",
        lambda *args, **kwargs: {
            "decision": "second_retrieval",
            "gate_summary": {"decision": "second_retrieval", "reason": "low_relevance"},
        },
    )

    result = knowledge_nodes.relevance_gate(_state(candidate_chunks=[_chunk()]))

    assert result["gate_decision"] == "second_retrieval"
    assert result["gate_summary"]["reason"] == "low_relevance"


def test_maybe_remediate_retrieval_increments_count_and_returns_second_pass(monkeypatch):
    monkeypatch.setattr(workflow, "_build_second_retrieval_query", lambda *args, **kwargs: "二次检索问题")
    calls = []

    def fake_invoke(tool_key, payload):
        calls.append(tool_key)
        if tool_key == "retrieve_evidence":
            return {"chunks": [_chunk("child-2", "第二次检索找到了更强证据。", 0.95)], "retrieval_mode": "hybrid"}
        if tool_key == "merge_parent_context":
            return {"expanded_contexts": {"child-2": {"parentContent": "上文"}}, "merge_summary": {"status": "expanded"}}
        if tool_key == "rerank_evidence":
            return {
                "chunks": [_chunk("child-2", "第二次检索找到了更强证据。", 0.95)],
                "rerank_summary": {"status": "completed", "chunkCount": 1, "topScore": 0.95},
            }
        return {"decision": "answer", "gate_summary": {"decision": "answer", "reason": "sufficient_evidence"}}

    monkeypatch.setattr(knowledge_nodes, "_invoke_tool", fake_invoke)

    result = knowledge_nodes.maybe_remediate_retrieval(
        _state(
            candidate_chunks=[_chunk("child-1")],
            gate_summary={"reason": "low_relevance"},
            recent_messages=[{"role": "user", "content": "继续说"}],
        )
    )

    assert calls == ["retrieve_evidence", "merge_parent_context", "rerank_evidence", "grade_retrieval_relevance"]
    assert result["remediation_count"] == 1
    assert result["gate_decision"] == "answer"
    assert result["second_retrieval_summary"]["used"] is True


def test_pack_context_saves_checkpoint(monkeypatch):
    host = NodeHost()
    monkeypatch.setattr(
        knowledge_nodes,
        "_invoke_tool",
        lambda *args, **kwargs: {
            "packed_chunks": [_chunk()],
            "packing_summary": {"passageCount": 1, "totalChars": 32},
        },
    )

    result = knowledge_nodes.pack_context(
        _state(host, candidate_chunks=[_chunk()], gate_decision="answer", retrieval_mode="hybrid")
    )

    assert result["packing_summary"]["passageCount"] == 1
    assert host.saved_checkpoints[0]["checkpoint"]["payload"]["chunkCount"] == 1


def test_write_answer_returns_no_relevant_content_when_gate_rejects():
    result = knowledge_nodes.write_answer(_state(gate_decision="no_relevant_content", packed_chunks=[]))

    assert result["answer_data"]["answerMode"] == "no_relevant_content"
    assert result["retrieval_status"] == "no_hits"


def test_write_answer_uses_excerpt_fallback_for_fts5(monkeypatch):
    monkeypatch.setattr(
        workflow,
        "_excerpt_fallback_answer",
        lambda *args, **kwargs: {
            "answer": {
                "answer": "摘录回答",
                "answerMode": "excerpt_fallback",
                "retrievalMode": "fts5",
                "retrievalStatus": "ready",
                "citations": [{"chunkId": "child-1", "quote": "原文"}],
            }
        },
    )

    result = knowledge_nodes.write_answer(
        _state(retrieval_mode="fts5", packed_chunks=[_chunk()], expanded_contexts={})
    )

    assert result["answer_data"]["answerMode"] == "excerpt_fallback"
    assert result["raw_citations"][0]["chunkId"] == "child-1"


def test_write_answer_returns_grounded_payload_when_model_succeeds(monkeypatch):
    monkeypatch.setattr(workflow, "_build_passages", lambda *args, **kwargs: "passages")
    monkeypatch.setattr(
        workflow,
        "_try_langchain_qa",
        lambda *args, **kwargs: {
            "answer": "资料显示检索练习通过主动回忆强化提取路径。",
            "answerMode": "grounded",
            "citations": [{"chunkId": "child-1", "snippet": "主动回忆强化提取路径"}],
        },
    )

    result = knowledge_nodes.write_answer(
        _state(packed_chunks=[_chunk()], expanded_contexts={}, retrieval_mode="hybrid")
    )

    assert result["answer_data"]["answerMode"] == "grounded"
    assert result["raw_citations"][0]["chunkId"] == "child-1"


@pytest.mark.parametrize(
    ("citations", "audit_status", "expected_error"),
    [
        ([{"chunkId": "child-1", "quote": "原文"}], "clean", None),
        ([{"chunkId": "child-1", "quote": "保留引用"}], "filtered", None),
        ([], "all_rejected", "citation_audit_failed"),
    ],
)
def test_audit_citations_sets_expected_error(monkeypatch, citations, audit_status, expected_error):
    monkeypatch.setattr(
        knowledge_nodes,
        "_invoke_tool",
        lambda *args, **kwargs: {
            "citations": citations,
            "removed_ids": ["missing-chunk"] if not citations else [],
            "audit_status": audit_status,
            "audit_summary": {"auditStatus": audit_status, "validCitations": len(citations)},
        },
    )

    result = knowledge_nodes.audit_citations(
        _state(
            answer_data={
                "answer": "回答",
                "answerMode": "grounded",
                "citations": [{"chunkId": "child-1", "snippet": "原文"}],
            },
            packed_chunks=[_chunk()],
        )
    )

    assert result["citations"] == citations
    assert result["audit_summary"]["auditStatus"] == audit_status
    assert result.get("error_category") == expected_error


def test_finalize_result_marks_filtered_citations_high_risk():
    result = knowledge_nodes.finalize_result(
        _state(
            answer_data={
                "answer": "保留了部分可验证引用的回答。",
                "answerMode": "grounded",
                "citations": [{"chunkId": "child-1", "quote": "原文"}],
            },
            citations=[{"chunkId": "child-1", "quote": "原文"}],
            packed_chunks=[_chunk()],
            rag_trace={"packingSummary": {"passageCount": 1}},
            audit_summary={"auditStatus": "filtered", "validCitations": 1, "rejectedCitations": 1},
        )
    )["result"]

    assert result["answer"]["answerMode"] == "grounded"
    assert result["qualityEnvelope"]["auditStatus"] == "failed"
    assert result["qualityEnvelope"]["groundingStatus"] == "partially_grounded"
    assert result["qualityEnvelope"]["riskLevel"] == "high"


def test_build_rag_trace_uses_packing_summary_from_state(monkeypatch):
    def fake_invoke(tool_key, payload):
        assert payload["packing_summary"]["passageCount"] == 2
        return {"rag_trace": {"packingSummary": payload["packing_summary"]}}

    monkeypatch.setattr(knowledge_nodes, "_invoke_tool", fake_invoke)

    result = knowledge_nodes.build_rag_trace(
        _state(
            packed_chunks=[_chunk()],
            packing_summary={"passageCount": 2, "totalChars": 64},
            gate_summary={"decision": "answer"},
        )
    )

    assert result["rag_trace"]["packingSummary"]["passageCount"] == 2


@pytest.mark.parametrize(
    ("state_overrides", "expected_mode", "expected_grounding", "expected_audit"),
    [
        (
            {
                "answer_data": {"answer": "回答", "answerMode": "grounded"},
                "citations": [{"chunkId": "child-1", "quote": "原文"}],
                "audit_summary": {"auditStatus": "passed"},
                "packed_chunks": [_chunk()],
                "rag_trace": {"packingSummary": {"passageCount": 1}},
            },
            "grounded",
            "grounded",
            "passed",
        ),
        (
            {
                "answer_data": {
                    "answer": "摘录回答",
                    "answerMode": "excerpt_fallback",
                    "retrievalMode": "fts5",
                    "retrievalStatus": "ready",
                    "citations": [{"chunkId": "child-1", "quote": "原文"}],
                },
                "packed_chunks": [_chunk()],
                "retrieval_mode": "fts5",
                "rag_trace": {"packingSummary": {"passageCount": 1}},
            },
            "excerpt_fallback",
            "ungrounded",
            "not_applicable",
        ),
        (
            {
                "answer_data": None,
                "error_category": "embedding_missing",
                "retrieval_status": "embedding_missing",
                "rag_trace": {"packingSummary": {"passageCount": 0}},
            },
            "no_relevant_content",
            "not_applicable",
            "not_applicable",
        ),
    ],
)
def test_finalize_result_includes_quality_envelope(
    state_overrides,
    expected_mode,
    expected_grounding,
    expected_audit,
):
    result = knowledge_nodes.finalize_result(_state(**state_overrides))["result"]

    assert result["answer"]["answerMode"] == expected_mode
    assert result["qualityEnvelope"]["groundingStatus"] == expected_grounding
    assert result["qualityEnvelope"]["auditStatus"] == expected_audit
    assert result["artifacts"]["answer"]["artifactType"] == "answer"
    assert result["artifacts"]["evidence"]["artifactType"] == "evidence"
    assert result["artifacts"]["answer"]["qualityEnvelope"] == result["qualityEnvelope"]


def test_finalize_result_adds_full_artifacts_for_grounded_answer():
    result = knowledge_nodes.finalize_result(
        _state(
            answer_data={
                "answer": " grounded answer ",
                "answerMode": "grounded",
                "citations": [{"chunkId": "child-1", "quote": "原文"}],
            },
            citations=[{"chunkId": "child-1", "quote": "原文"}],
            packed_chunks=[_chunk()],
            rag_trace={"packingSummary": {"passageCount": 1}},
            audit_summary={"auditStatus": "clean"},
        )
    )["result"]

    assert result["artifacts"]["evidence"]["artifactId"] == "knowledge-qa://runs/run-1/evidence"
    assert result["artifacts"]["evidence"]["sourceRefs"] == ["knowledge-qa://runs/run-1/evidence/child-1"]
    assert result["artifacts"]["evidence"]["qualityEnvelope"]["riskLevel"] == "low"
    assert result["artifacts"]["answer"]["artifactId"] == "knowledge-qa://runs/run-1/answer"
    assert result["artifacts"]["answer"]["citationRefs"] == ["knowledge-qa://runs/run-1/evidence/child-1"]


def test_finalize_result_marks_invalid_quality_envelope_high_risk(monkeypatch):
    monkeypatch.setattr(knowledge_nodes, "_build_quality_envelope", lambda *args, **kwargs: {"auditStatus": "passed"})

    result = knowledge_nodes.finalize_result(
        _state(
            answer_data={
                "answer": " grounded answer ",
                "answerMode": "grounded",
                "citations": [{"chunkId": "child-1", "quote": "原文"}],
            },
            citations=[{"chunkId": "child-1", "quote": "原文"}],
            packed_chunks=[_chunk()],
            rag_trace={"packingSummary": {"passageCount": 1}},
        )
    )["result"]

    assert result["qualityEnvelope"]["riskLevel"] == "high"
    assert "quality_envelope_invalid" in result["qualityEnvelope"]["blockingReasons"]
    assert result["artifacts"]["answer"]["errorCategory"] == "quality_envelope_invalid"