from orchestration_service.memory import SessionStore, build_session_context, update_session_state
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
        "chunkIndex": 1,
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

    def is_run_cancelled(self, run_id):
        return False

    def get_active_embedding_profile(self):
        return {"id": "profile-1"}

    def get_document_embedding_readiness(self, profile_id, document_ids=None):
        return {"status": "ready", "documents": []}

    def list_recent_qa_messages(self, conversation_id, limit=4):
        return self.recent_messages[:limit]

    def search_hybrid(self, query, query_embedding=None, document_ids=None, limit=10, rrf_k=60):
        return [dict(item) for item in self.responses.get(query, [])]

    def list_chunks(self, document_id):
        return _structured_chunks(document_id)

    def list_sections(self, document_id):
        return _section(document_id)

    def get_config_for_workflow(self, workflow_type):
        return self.config

    def record_workflow_cost(self, config_id, estimated_cost_usd):
        return {"stored": True}


def _embed_result(*args, **kwargs):
    class Result:
        vector = [0.1, 0.2]
        cache_hit = False
        attempts = 1
        latency_ms = 6.2
        status = "ready"

    return Result()


def test_build_session_context_marks_memory_as_non_citable():
    state = {
        "summary": "本会话最近围绕检索练习与间隔重复的配合展开。",
        "turn_count": 3,
        "compression_point": 3,
        "last_updated_at": 1.0,
    }

    context = build_session_context(
        state,
        "它和刚才那个方法有什么区别？",
        [{"role": "user", "content": "检索练习和间隔重复怎么配合？"}],
    )

    assert context is not None
    assert "不是文档证据" in context
    assert "当前问题" in context
    assert "最近对话" in context


def test_session_store_expires_old_entries():
    store = SessionStore()
    store.put(
        "conversation-1",
        {
            "summary": "old",
            "turn_count": 1,
            "compression_point": 1,
            "last_updated_at": 1.0,
        },
    )

    removed = store.expire_old(max_age_seconds=0)

    assert removed == 1
    assert store.get("conversation-1") is None


def test_update_session_state_increments_turn_count_and_keeps_disclaimer():
    state = update_session_state(
        None,
        "它的优点是什么？",
        "最近回答说明了检索练习的优点。",
        [{"role": "user", "content": "先解释一下检索练习"}],
    )

    assert state["turn_count"] == 1
    assert state["compression_point"] == 1
    assert "注意：以上为对话记忆，不是文档证据" in state["summary"]


def test_agent_runner_attaches_session_memory_metadata(monkeypatch):
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
        {"它的优点是什么？": [_hybrid_hit("child-1", "检索练习通过主动回忆强化提取路径。", 0.92)]},
        recent_messages=[
            {"role": "user", "content": "先说说检索练习"},
            {"role": "assistant", "content": "它是一种通过主动回忆强化记忆的方法。"},
        ],
    )
    store = SessionStore()
    store.put(
        "conversation-1",
        {
            "summary": "本会话前面已经讨论过检索练习的定义。",
            "turn_count": 1,
            "compression_point": 1,
            "last_updated_at": 9999999999.0,
        },
    )

    result = AgentQaRunner(host, session_store=store).run(
        "run-1",
        "它的优点是什么？",
        ["doc-1"],
        conversation_id="conversation-1",
    )

    assert result["answer"]["sessionMemoryUsed"] is True
    assert "不是文档证据" in (result["answer"]["sessionMemorySummary"] or "")
    assert any(
        entry["toolKey"] == "pack_context"
        and entry["outputSummary"].get("episodicMemoryUsed") is True
        for entry in result["answer"]["agentTrace"]
    )