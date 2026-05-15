from types import SimpleNamespace

from orchestration_service.workflows import knowledge_qa as workflow


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


def _lexical_fallback_hit(chunk_id: str, content: str, score: float, document_id: str = "doc-1"):
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
        "lexicalSource": "fallback",
    }


class P04Host:
    def __init__(self, responses: dict[str, list[dict]], *, recent_messages=None, config=None):
        self.responses = responses
        self.recent_messages = recent_messages or []
        self.config = config or ({"id": "config-1", "provider": "custom_openai", "model": "qa-model"}, "test-key")
        self.search_queries: list[str] = []
        self.recorded_costs: list[tuple[str, float]] = []

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


def _embed_result(*args, **kwargs):
    return SimpleNamespace(
        vector=[0.1, 0.2],
        cache_hit=False,
        attempts=1,
        latency_ms=6.2,
        status="ready",
    )


def test_should_rewrite_when_referential_pronoun():
    recent_messages = [{"role": "assistant", "content": "我们刚讨论了检索练习。"}]

    assert workflow._should_rewrite_query("它的优缺点", recent_messages) is True


def test_should_rewrite_when_short_query():
    assert workflow._should_rewrite_query("总结下") is True


def test_local_rerank_prioritizes_term_overlap():
    chunks = [
        _hybrid_hit("child-1", "检索练习通过主动回忆强化提取路径。", 0.4),
        _hybrid_hit("child-2", "间隔重复通过拉长间隔降低遗忘速度。", 0.41),
    ]
    expanded_contexts = {
        "child-1": {"sectionHeading": "第一章 > 检索练习"},
        "child-2": {"sectionHeading": "第一章 > 间隔重复"},
    }

    ranked, summary = workflow._rerank_local_rule(chunks, "检索练习有什么优点", expanded_contexts)

    assert ranked[0]["chunkId"] == "child-1"
    assert summary["status"] == "local_rule"
    assert ranked[0]["rerankScore"] >= ranked[1]["rerankScore"]


def test_rerank_disabled_returns_original_order(monkeypatch):
    monkeypatch.setenv(workflow.RERANK_MODE_ENV, "disabled")
    chunks = [
        _hybrid_hit("child-2", "间隔重复通过拉长间隔降低遗忘速度。", 0.91),
        _hybrid_hit("child-1", "检索练习通过主动回忆强化提取路径。", 0.33),
    ]

    ranked, summary = workflow._rerank_evidence(chunks, "检索练习有什么优点", {})

    assert [chunk["chunkId"] for chunk in ranked] == ["child-2", "child-1"]
    assert summary["status"] == "disabled"
    assert summary["provider"] == "disabled"
    assert summary["chunkCount"] == 2


def test_relevance_gate_decisions():
    answer_decision, _ = workflow._relevance_gate([{"chunkId": "chunk-1", "rerankScore": 0.61}])
    retry_decision, _ = workflow._relevance_gate([{"chunkId": "chunk-1", "rerankScore": 0.08}])
    reject_decision, _ = workflow._relevance_gate(
        [{"chunkId": "chunk-1", "rerankScore": 0.08}],
        is_second_retrieval=True,
    )

    assert answer_decision == "answer"
    assert retry_decision == "second_retrieval"
    assert reject_decision == "no_relevant_content"


def test_run_rewrite_failure_falls_back_to_original_query(monkeypatch):
    monkeypatch.setenv(workflow.RERANK_MODE_ENV, "local_rule")
    monkeypatch.setattr(workflow, "embed_query_with_resilience", _embed_result)
    monkeypatch.setattr(workflow, "_rewrite_query", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("rewrite failed")))
    monkeypatch.setattr(
        workflow,
        "_try_langchain_qa",
        lambda *args, **kwargs: {
            "answer": "资料显示该方法既有帮助，也有使用成本。",
            "answerMode": "grounded",
            "citations": [{"chunkId": "child-1", "snippet": "主动回忆强化提取路径"}],
        },
    )
    host = P04Host(
        {
            "它的优缺点": [
                _hybrid_hit("child-1", "检索练习通过主动回忆强化提取路径。", 0.82),
                _hybrid_hit("child-2", "检索练习初学时会感觉更吃力。", 0.78),
            ]
        },
        recent_messages=[{"role": "assistant", "content": "我们刚讨论了检索练习。"}],
    )

    result = workflow.run_knowledge_qa_workflow(
        "run-1",
        "它的优缺点",
        ["doc-1"],
        host,
        conversation_id="conv-1",
    )

    assert result["answer"]["answerMode"] == "grounded"
    assert host.search_queries == ["它的优缺点"]
    assert result["answer"]["ragTrace"]["queryRewriteUsed"] is False
    assert result["answer"]["ragTrace"]["rewriteSummary"]["status"] == "failed"


def test_run_uses_second_retrieval_and_updates_trace(monkeypatch):
    monkeypatch.setenv(workflow.RERANK_MODE_ENV, "local_rule")
    monkeypatch.setattr(workflow, "embed_query_with_resilience", _embed_result)
    monkeypatch.setattr(workflow, "_build_second_retrieval_query", lambda *args, **kwargs: "检索练习的价值")
    monkeypatch.setattr(
        workflow,
        "_try_langchain_qa",
        lambda *args, **kwargs: {
            "answer": "资料显示检索练习的主要价值是强化提取路径，并帮助及时发现盲点。",
            "answerMode": "grounded",
            "citations": [{"chunkId": "child-1", "snippet": "强化提取路径"}],
        },
    )
    host = P04Host(
        {
            "主动回忆有什么价值": [
                _hybrid_hit("child-2", "泛泛提到练习很重要，但没有直接回答价值。", 0.03),
            ],
            "检索练习的价值": [
                _hybrid_hit("child-1", "检索练习通过主动回忆强化提取路径。", 0.91),
                _hybrid_hit("child-2", "检索练习还能暴露知识盲点。", 0.87),
            ],
        },
    )

    result = workflow.run_knowledge_qa_workflow("run-1", "主动回忆有什么价值", ["doc-1"], host)

    assert result["answer"]["answerMode"] == "grounded"
    assert host.search_queries == ["主动回忆有什么价值", "检索练习的价值"]
    trace = result["answer"]["ragTrace"]
    assert trace["secondRetrievalUsed"] is True
    assert trace["secondRetrievalSummary"]["additionalChunkCount"] == 1
    assert trace["relevanceGateDecision"] == "answer"


def test_run_returns_no_relevant_content_after_second_retrieval_miss(monkeypatch):
    monkeypatch.setenv(workflow.RERANK_MODE_ENV, "local_rule")
    monkeypatch.setattr(workflow, "embed_query_with_resilience", _embed_result)
    monkeypatch.setattr(workflow, "_build_second_retrieval_query", lambda *args, **kwargs: "更宽泛的问题")
    monkeypatch.setattr(
        workflow,
        "_try_langchain_qa",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("model should not be called after gate rejection")),
    )
    host = P04Host({"什么是迁移学习": [], "更宽泛的问题": []})

    result = workflow.run_knowledge_qa_workflow("run-1", "什么是迁移学习", ["doc-1"], host)

    assert result["answer"]["answerMode"] == "no_relevant_content"
    assert result["answer"]["retrievalStatus"] == "no_hits"
    trace = result["answer"]["ragTrace"]
    assert trace["secondRetrievalUsed"] is True
    assert trace["relevanceGateDecision"] == "no_relevant_content"


def test_contains_only_fallback_degrades_to_excerpt_fallback(monkeypatch):
    monkeypatch.setenv(workflow.RERANK_MODE_ENV, "disabled")
    monkeypatch.setattr(workflow, "embed_query_with_resilience", _embed_result)
    monkeypatch.setattr(
        workflow,
        "_try_langchain_qa",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("model should not be called for contains fallback only")
        ),
    )
    host = P04Host(
        {
            "只靠词法会怎样": [
                _lexical_fallback_hit("child-1", "检索练习通过主动回忆强化提取路径。", 0.91),
                _lexical_fallback_hit("child-2", "检索练习初学阶段可能更吃力。", 0.87),
            ]
        }
    )

    result = workflow.run_knowledge_qa_workflow("run-1", "只靠词法会怎样", ["doc-1"], host)

    assert result["answer"]["answerMode"] == "excerpt_fallback"
    assert result["answer"]["retrievalMode"] == "fts5"
    assert result["answer"]["fallbackReason"] == "contains_only_fallback"
    trace = result["answer"]["ragTrace"]
    assert trace["failureReason"] == "contains_only_fallback"
    assert trace["retrievalSummary"]["lexicalStatus"] == "fallback"
