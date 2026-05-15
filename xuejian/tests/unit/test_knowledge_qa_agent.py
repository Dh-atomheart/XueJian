from orchestration_service.tools.qa_tools import TOOL_REGISTRY
from orchestration_service.workflows import knowledge_qa as workflow
from orchestration_service.workflows.knowledge_qa_agent import AgentQaRunner


def _structured_chunks(document_id: str = "doc-1"):
    return [
        {
            "id": "parent-1",
            "documentId": document_id,
            "sectionId": "section-1",
            "anchorId": "anchor-parent",
            "pageStart": 1,
            "pageEnd": 1,
            "chunkIndex": 0,
            "chunkKind": "parent",
            "content": "这一节说明检索练习的定义、优点与适用边界。",
            "tokenCount": 24,
            "metadata": None,
        },
        {
            "id": "child-1",
            "documentId": document_id,
            "sectionId": "section-1",
            "anchorId": "anchor-child-1",
            "pageStart": 1,
            "pageEnd": 1,
            "chunkIndex": 1,
            "chunkKind": "child",
            "content": "检索练习的优点是通过主动回忆强化提取路径，并帮助暴露知识盲点。",
            "tokenCount": 18,
            "metadata": None,
        },
        {
            "id": "child-2",
            "documentId": document_id,
            "sectionId": "section-1",
            "anchorId": "anchor-child-2",
            "pageStart": 1,
            "pageEnd": 1,
            "chunkIndex": 2,
            "chunkKind": "child",
            "content": "检索练习的局限是初学阶段可能感觉困难，需要与反馈和间隔重复配合。",
            "tokenCount": 18,
            "metadata": None,
        },
    ]


def _section(document_id: str = "doc-1"):
    return [
        {
            "id": "section-1",
            "documentId": document_id,
            "heading": "检索练习",
            "hierarchyPath": ["第一章", "记忆策略"],
            "content": "章节摘要。",
        }
    ]


def _hybrid_hit(chunk_id: str, content: str, score: float, document_id: str = "doc-1"):
    return {
        "id": chunk_id,
        "chunkId": chunk_id,
        "documentId": document_id,
        "sectionId": "section-1",
        "anchorId": f"anchor-{chunk_id}",
        "chunkIndex": 1 if chunk_id == "child-1" else 2,
        "pageStart": 1,
        "content": content,
        "score": score,
        "vectorRank": 1,
        "distance": 0.1,
        "lexicalSource": "fts5_bm25",
    }


class P04Host:
    def __init__(self, responses: dict[str, list[dict]], *, recent_messages=None, config=None):
        self.responses = responses
        self.recent_messages = recent_messages or []
        self.config = config or (
            {"id": "config-1", "provider": "custom_openai", "model": "qa-model"},
            "test-key",
        )
        self.search_queries: list[str] = []
        self.recorded_costs: list[tuple[str, float]] = []
        self.emitted_events: list[dict] = []
        self.saved_checkpoints: list[dict] = []

    def is_run_cancelled(self, run_id):
        return False

    def get_active_embedding_profile(self):
        return {"id": "profile-1"}

    def get_document_embedding_readiness(self, profile_id, document_ids=None):
        return {"status": "ready", "documents": []}

    def list_recent_qa_messages(self, conversation_id, limit=4):
        return self.recent_messages[:limit]

    def search_hybrid(self, query, query_embedding=None, document_ids=None, limit=10, rrf_k=60):
        self.search_queries.append(query)
        return [dict(item) for item in self.responses.get(query, [])]

    def list_chunks(self, document_id):
        return _structured_chunks(document_id)

    def list_sections(self, document_id):
        return _section(document_id)

    def get_config_for_workflow(self, workflow_type):
        return self.config

    def record_workflow_cost(self, config_id, estimated_cost_usd):
        self.recorded_costs.append((config_id, estimated_cost_usd))
        return {"stored": True}

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


def _embed_result(*args, **kwargs):
    class Result:
        vector = [0.1, 0.2]
        cache_hit = False
        attempts = 1
        latency_ms = 6.2
        status = "ready"

    return Result()


def _progress_step_keys(host):
    return [
        event["payload"]["stepKey"]
        for event in host.emitted_events
        if event["eventType"] == "progress"
        and isinstance(event.get("payload"), dict)
        and event["payload"].get("stepKey")
    ]


def _unique_progress_step_keys(host):
    keys = []
    for key in _progress_step_keys(host):
        if key not in keys:
            keys.append(key)
    return keys


def test_agent_runner_happy_path_records_agent_trace(monkeypatch):
    monkeypatch.setenv(workflow.RERANK_MODE_ENV, "local_rule")
    monkeypatch.setattr(workflow, "_embed_optional_query", lambda *args, **kwargs: [0.1, 0.2])
    monkeypatch.setattr(workflow, "embed_query_with_resilience", _embed_result)
    monkeypatch.setattr(workflow, "_rewrite_query", lambda *args, **kwargs: args[2])
    monkeypatch.setattr(
        workflow,
        "_try_langchain_qa",
        lambda *args, **kwargs: {
            "answer": "资料显示检索练习通过主动回忆强化提取路径，并帮助暴露盲点。",
            "answerMode": "grounded",
            "citations": [{"chunkId": "child-1", "snippet": "主动回忆强化提取路径"}],
        },
    )
    host = P04Host(
        {
            "检索练习有什么优点": [
                _hybrid_hit("child-1", "检索练习通过主动回忆强化提取路径。", 0.92),
                _hybrid_hit("child-2", "检索练习还能帮助暴露知识盲点。", 0.84),
            ]
        }
    )

    result = AgentQaRunner(host).run("run-1", "检索练习有什么优点", ["doc-1"])

    assert result["answer"]["answerMode"] == "grounded"
    trace = result["answer"]["agentTrace"]
    assert [entry["toolKey"] for entry in trace] == [
        "retrieve_evidence",
        "merge_parent_context",
        "rerank_evidence",
        "grade_retrieval_relevance",
        "pack_context",
        "audit_citations",
        "build_rag_trace",
    ]
    assert all(entry["errorCategory"] is None for entry in trace[:-1])
    assert host.emitted_events[0]["eventType"] == "started"
    assert host.emitted_events[-1]["eventType"] == "completed"
    assert _unique_progress_step_keys(host) == [
        "query_embedding",
        "rewrite",
        "retrieve",
        "rerank",
        "gate",
        "pack",
        "second_retrieval",
        "generate",
        "audit",
    ]
    assert host.saved_checkpoints[0]["checkpoint"]["stepKey"] == "retrieval_ready"


def test_agent_runner_falls_back_when_tool_execution_fails(monkeypatch):
    monkeypatch.setenv(workflow.RERANK_MODE_ENV, "local_rule")
    monkeypatch.setattr(workflow, "_embed_optional_query", lambda *args, **kwargs: [0.1, 0.2])
    monkeypatch.setattr(workflow, "embed_query_with_resilience", _embed_result)
    monkeypatch.setattr(workflow, "_rewrite_query", lambda *args, **kwargs: args[2])
    monkeypatch.setattr(
        workflow,
        "_try_langchain_qa",
        lambda *args, **kwargs: {
            "answer": "资料显示检索练习通过主动回忆强化提取路径。",
            "answerMode": "grounded",
            "citations": [{"chunkId": "child-1", "snippet": "主动回忆强化提取路径"}],
        },
    )
    host = P04Host(
        {"检索练习有什么优点": [_hybrid_hit("child-1", "检索练习通过主动回忆强化提取路径。", 0.92)]}
    )

    original_invoke = TOOL_REGISTRY.invoke

    def failing_invoke(tool_key, data, *, caller=None):
        if tool_key == "pack_context":
            raise RuntimeError("boom")
        return original_invoke(tool_key, data, caller=caller)

    monkeypatch.setattr(TOOL_REGISTRY, "invoke", failing_invoke)

    result = AgentQaRunner(host).run("run-1", "检索练习有什么优点", ["doc-1"])

    assert result["answer"]["answerMode"] == "grounded"
    event_types = [event["eventType"] for event in host.emitted_events]
    assert event_types[0] == "started"
    assert "fallback" in event_types
    assert event_types[-1] == "completed"
    assert "pack" in _progress_step_keys(host)
    assert any(
        entry["toolKey"] == "pack_context" and entry["errorCategory"] == "tool_execution_failed"
        for entry in result["answer"]["agentTrace"]
    )


def test_agent_runner_marks_citation_invalid_when_audit_rejects(monkeypatch):
    monkeypatch.setenv(workflow.RERANK_MODE_ENV, "local_rule")
    monkeypatch.setattr(workflow, "_embed_optional_query", lambda *args, **kwargs: [0.1, 0.2])
    monkeypatch.setattr(workflow, "embed_query_with_resilience", _embed_result)
    monkeypatch.setattr(workflow, "_rewrite_query", lambda *args, **kwargs: args[2])
    monkeypatch.setattr(
        workflow,
        "_try_langchain_qa",
        lambda *args, **kwargs: {
            "answer": "资料显示检索练习通过主动回忆强化提取路径。",
            "answerMode": "grounded",
            "citations": [{"chunkId": "missing-chunk", "snippet": "不存在的引用"}],
        },
    )
    host = P04Host(
        {"检索练习有什么优点": [_hybrid_hit("child-1", "检索练习通过主动回忆强化提取路径。", 0.92)]}
    )

    result = AgentQaRunner(host).run("run-1", "检索练习有什么优点", ["doc-1"])

    assert result["answer"]["retrievalStatus"] == "no_hits"
    assert any(
        entry["toolKey"] == "audit_citations" and entry["errorCategory"] == "citation_invalid"
        for entry in result["answer"]["agentTrace"]
    )
