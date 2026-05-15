import pytest
from types import SimpleNamespace

from orchestration_service.providers import embedding_runtime
from orchestration_service.workflows import knowledge_qa as workflow


def test_extract_answer_object_accepts_contract_json():
    payload = workflow._extract_answer_object(
        '{"answer":"基于资料回答。","answerMode":"grounded","citations":[{"chunkId":"chunk-1","snippet":"原文片段"}]}'
    )

    assert payload["answer"] == "基于资料回答。"
    assert payload["answerMode"] == "grounded"
    assert payload["citations"][0]["chunkId"] == "chunk-1"


@pytest.mark.parametrize(
    "raw",
    [
        "",
        '[{"answer":"bad","citations":[]}]',
        '{"answer":"bad"}',
        '{"citations":[]}',
    ],
)
def test_extract_answer_object_rejects_invalid_contract(raw):
    with pytest.raises(workflow.KnowledgeQaJsonError):
        workflow._extract_answer_object(raw)


def test_try_langchain_qa_raises_when_json_repair_fails(monkeypatch):
    monkeypatch.setattr(workflow, "_invoke_model", lambda *args, **kwargs: "not json")

    with pytest.raises(workflow.KnowledgeQaJsonError):
        workflow._try_langchain_qa({}, "test-key", "问题", "passages")


def test_normalize_citations_drops_unknown_chunk_and_replaces_bad_snippet():
    chunks = [
        {
            "id": "chunk-1",
            "documentId": "doc-1",
            "sectionId": None,
            "anchorId": None,
            "pageStart": 3,
            "content": "间隔重复通过拉长复习间隔来提高长期记忆保持率。",
            "score": 0.91,
        }
    ]

    citations = workflow._normalize_citations(
        [
            {"chunkId": "missing", "snippet": "不存在"},
            {"chunkId": "chunk-1", "snippet": "模型编造的片段"},
        ],
        chunks,
    )

    assert len(citations) == 1
    assert citations[0]["chunkId"] == "chunk-1"
    assert citations[0]["quote"] in chunks[0]["content"]
    assert citations[0]["page"] == 3


def test_vector_backed_chunks_filters_lexical_only_hits():
    chunks = [
        {"id": "lexical", "score": 0.2, "vectorRank": None, "distance": None},
        {"id": "vector", "score": 0.9, "vectorRank": 1, "distance": 0.12},
    ]

    assert [chunk["id"] for chunk in workflow._vector_backed_chunks(chunks)] == ["vector"]


class FakeHost:
    def __init__(self, *, profile=None, embedding_error=None, chunks=None, config=None):
        self.profile = profile
        self.embedding_error = embedding_error
        self.chunks = chunks or []
        self.config = config
        self.workflow_events = []

    def is_run_cancelled(self, run_id):
        return False

    def get_active_embedding_profile(self):
        return self.profile

    def search_hybrid(self, *args, **kwargs):
        return self.chunks

    def get_config_for_workflow(self, workflow_type):
        return self.config

    def emit_workflow_event(self, run_id, event_type, message=None, progress=None, payload=None):
        self.workflow_events.append(
            {
                "runId": run_id,
                "eventType": event_type,
                "message": message,
                "progress": progress,
                "payload": payload,
            }
        )
        return self.workflow_events[-1]


class EmbeddingCacheHost:
    def __init__(self, *, cached=None):
        self.cached = cached
        self.cache_reads = 0
        self.cache_writes = []

    def get_workflow_assignment(self, workflow_type):
        return {
            "modelProfile": {
                "id": "profile-1",
                "apiConfigId": "config-1",
                "modelId": "text-embedding-test",
            },
            "apiConfig": {"id": "config-1"},
        }

    def get_api_config(self, config_id):
        return {
            "id": config_id,
            "provider": "custom_openai",
            "model": "text-embedding-test",
            "baseUrl": "http://embedding.local",
            "isEnabled": True,
        }

    def get_api_key(self, config_id):
        return "key"

    def get_query_embedding_cache(self, cache_key, expected_dimensions, max_age_seconds):
        self.cache_reads += 1
        return self.cached or {"hit": False}

    def put_query_embedding_cache(self, **payload):
        self.cache_writes.append(payload)
        return {"stored": True}


class ReadinessHost(FakeHost):
    def __init__(self, *, readiness_status, chunks=None):
        super().__init__(profile={"id": "profile-1"}, chunks=chunks)
        self.readiness_status = readiness_status
        self.readiness_checked = False

    def get_document_embedding_readiness(self, profile_id, document_ids=None):
        self.readiness_checked = True
        return {"status": self.readiness_status, "documents": []}


def test_run_returns_embedding_missing_without_active_profile():
    result = workflow.run_knowledge_qa_workflow("run-1", "问题", [], FakeHost())

    assert result["answer"]["retrievalStatus"] == "embedding_missing"
    assert result["answer"]["answerMode"] == "no_relevant_content"
    assert result["answer"]["citations"] == []


def test_run_blocks_when_selected_documents_are_not_embedded():
    host = ReadinessHost(readiness_status="embedding_missing")

    result = workflow.run_knowledge_qa_workflow("run-1", "question", ["doc-1"], host)

    assert host.readiness_checked is True
    assert result["answer"]["retrievalStatus"] == "embedding_missing"
    assert result["answer"]["answerMode"] == "no_relevant_content"


def test_run_blocks_when_selected_documents_have_stale_embeddings():
    host = ReadinessHost(readiness_status="embedding_stale")

    result = workflow.run_knowledge_qa_workflow("run-1", "question", ["doc-1"], host)

    assert host.readiness_checked is True
    assert result["answer"]["retrievalStatus"] == "embedding_stale"
    assert result["answer"]["answerMode"] == "no_relevant_content"


def test_run_continues_when_readiness_is_ready(monkeypatch):
    monkeypatch.setattr(
        workflow,
        "embed_query_with_resilience",
        lambda *args, **kwargs: SimpleNamespace(
            vector=[0.1, 0.2],
            cache_hit=False,
            attempts=1,
            latency_ms=12.0,
            status="ready",
        ),
    )
    host = ReadinessHost(readiness_status="ready", chunks=[])

    result = workflow.run_knowledge_qa_workflow("run-1", "question", ["doc-1"], host)

    assert host.readiness_checked is True
    assert result["answer"]["retrievalStatus"] == "no_hits"
    assert result["answer"]["retrievalStatus"] != "embedding_stale"


def test_query_embedding_uses_persistent_cache(monkeypatch):
    def fail_provider(*args, **kwargs):
        raise AssertionError("provider should not be called on cache hit")

    monkeypatch.setattr(embedding_runtime, "litellm_embedding", fail_provider)
    host = EmbeddingCacheHost(cached={"hit": True, "vector": [0.1, 0.2, 0.3]})

    result = embedding_runtime.embed_query_with_resilience(
        host,
        {"id": "profile-1", "revision": 1, "provider": "custom_openai", "model": "text-embedding-test", "dimensions": 3},
        "What is retrieval practice?",
    )

    assert result.cache_hit is True
    assert result.attempts == 0
    assert result.vector == [0.1, 0.2, 0.3]
    assert host.cache_reads == 1
    assert host.cache_writes == []


def test_query_embedding_retries_once_after_timeout(monkeypatch):
    calls = []

    def flaky_provider(*args, **kwargs):
        calls.append(kwargs.get("timeout_seconds"))
        if len(calls) == 1:
            raise TimeoutError("embedding timeout")
        return [[0.3, 0.2, 0.1]]

    monkeypatch.setattr(embedding_runtime, "litellm_embedding", flaky_provider)
    monkeypatch.setattr(embedding_runtime.time, "sleep", lambda *_args, **_kwargs: None)
    host = EmbeddingCacheHost()

    result = embedding_runtime.embed_query_with_resilience(
        host,
        {"id": "profile-1", "revision": 1, "provider": "custom_openai", "model": "text-embedding-test", "dimensions": 3},
        "What is retrieval practice?",
    )

    assert result.cache_hit is False
    assert result.attempts == 2
    assert result.vector == [0.3, 0.2, 0.1]
    assert calls == [15, 25]
    assert host.cache_writes


def test_run_returns_embedding_failed_when_query_embedding_fails(monkeypatch):
    def fail_embed(*args, **kwargs):
        raise RuntimeError("provider failed")

    monkeypatch.setattr(workflow, "embed_query_with_resilience", fail_embed)
    host = FakeHost(profile={"id": "profile-1"})

    result = workflow.run_knowledge_qa_workflow("run-1", "问题", ["doc-1"], host)

    assert result["answer"]["retrievalStatus"] == "query_embedding_failed"


def test_run_uses_lexical_excerpt_fallback_when_query_embedding_config_fails(monkeypatch):
    def fail_embed(*args, **kwargs):
        raise RuntimeError("No enabled API config with key found for provider 'custom_openai'")

    monkeypatch.setattr(workflow, "embed_query_with_resilience", fail_embed)
    host = FakeHost(
        profile={"id": "profile-1"},
        chunks=[
            {
                "id": "chunk-1",
                "documentId": "doc-1",
                "pageStart": 4,
                "content": "Retrieval practice improves long-term retention by forcing recall.",
                "score": 0.73,
            }
        ],
    )

    result = workflow.run_knowledge_qa_workflow("run-1", "retrieval", ["doc-1"], host)

    assert result["answer"]["answerMode"] == "excerpt_fallback"
    assert result["answer"]["retrievalMode"] == "fts5"
    assert result["answer"]["retrievalStatus"] == "embedding_config_error"
    assert result["answer"]["citations"][0]["chunkId"] == "chunk-1"


def test_run_returns_no_hits_when_hybrid_has_no_vector_hits(monkeypatch):
    monkeypatch.setattr(
        workflow,
        "embed_query_with_resilience",
        lambda *args, **kwargs: SimpleNamespace(
            vector=[0.1, 0.2],
            cache_hit=False,
            attempts=1,
            latency_ms=12.0,
            status="ready",
        ),
    )
    host = FakeHost(
        profile={"id": "profile-1"},
        chunks=[{"id": "lexical", "content": "关键词命中但没有向量信号"}],
    )

    result = workflow.run_knowledge_qa_workflow("run-1", "问题", ["doc-1"], host)

    assert result["answer"]["retrievalStatus"] == "no_hits"
    assert result["answer"]["retrievalMode"] == "fts5"


def test_run_uses_lexical_hits_for_structured_synthesis_when_vector_flags_are_absent(monkeypatch):
    monkeypatch.setattr(
        workflow,
        "embed_query_with_resilience",
        lambda *args, **kwargs: SimpleNamespace(
            vector=[0.1, 0.2],
            cache_hit=False,
            attempts=1,
            latency_ms=12.0,
            status="ready",
        ),
    )

    def answer_with_table(config, api_key, question, passages_text):
        assert "If the question asks you to create a table, steps, or a structured synthesis" in workflow.KNOWLEDGE_QA_USER_TEMPLATE
        assert "职业成长" in question
        assert "持续复盘" in passages_text
        return {
            "answer": "| 步骤 | 做法 |\n| --- | --- |\n| 1 | 明确目标 |\n| 2 | 持续复盘 |\n| 3 | 建立反馈 |",
            "answerMode": "grounded",
            "citations": [{"chunkId": "chunk-career", "snippet": "持续复盘"}],
        }

    monkeypatch.setattr(workflow, "_try_langchain_qa", answer_with_table)
    host = FakeHost(
        profile={"id": "profile-1"},
        config=({"id": "config-1", "provider": "custom_openai", "model": "qa-model"}, "key"),
        chunks=[
            {
                "id": "chunk-career",
                "documentId": "doc-1",
                "pageStart": 8,
                "content": "职业成长需要明确阶段目标、持续复盘工作经验，并通过导师或同伴反馈校准下一步行动。",
                "score": 0.82,
            }
        ],
    )

    result = workflow.run_knowledge_qa_workflow("run-1", "列个表格告诉我职业成长：三个关键步骤", ["doc-1"], host)

    assert result["answer"]["answerMode"] == "grounded"
    assert result["answer"]["retrievalMode"] == "fts5"
    assert result["answer"]["retrievalStatus"] == "ready"
    assert result["answer"]["citations"][0]["chunkId"] == "chunk-career"
    assert "| 步骤 | 做法 |" in result["answer"]["answer"]


def test_run_emits_failed_progress_when_query_embedding_fails(monkeypatch):
    def fail_embed(*args, **kwargs):
        raise RuntimeError("provider failed")

    monkeypatch.setattr(workflow, "embed_query_with_resilience", fail_embed)
    host = FakeHost(profile={"id": "profile-1"})

    workflow.run_knowledge_qa_workflow("run-1", "question", ["doc-1"], host)

    failed_steps = [
        event["payload"]
        for event in host.workflow_events
        if event["eventType"] == "progress"
        and event["payload"]
        and event["payload"].get("status") == "failed"
    ]
    assert any(step["stepKey"] == "query_embedding" for step in failed_steps)


def test_run_emits_safe_progress_events_for_success_path(monkeypatch):
    monkeypatch.setattr(
        workflow,
        "embed_query_with_resilience",
        lambda *args, **kwargs: SimpleNamespace(
            vector=[0.1, 0.2],
            cache_hit=False,
            attempts=1,
            latency_ms=12.0,
            status="ready",
        ),
    )
    monkeypatch.setattr(
        workflow,
        "_try_langchain_qa",
        lambda *args, **kwargs: {
            "answer": "Retrieval practice improves recall.",
            "answerMode": "grounded",
            "citations": [{"chunkId": "chunk-progress", "snippet": "improves recall"}],
        },
    )
    host = FakeHost(
        profile={"id": "profile-1"},
        config=({"id": "config-1", "provider": "custom_openai", "model": "qa-model"}, "key"),
        chunks=[
            {
                "id": "chunk-progress",
                "documentId": "doc-1",
                "pageStart": 1,
                "content": "Retrieval practice improves recall.",
                "vectorRank": 1,
                "score": 0.91,
            }
        ],
    )

    workflow.run_knowledge_qa_workflow("run-1", "question", ["doc-1"], host)

    payloads = [
        event["payload"]
        for event in host.workflow_events
        if event["eventType"] == "progress" and event["payload"]
    ]
    step_keys = [payload["stepKey"] for payload in payloads]
    assert "retrieve" in step_keys
    assert "generate" in step_keys
    assert "audit" in step_keys
    assert all("prompt" not in payload for payload in payloads)
    assert all("providerRawResponse" not in payload for payload in payloads)


def test_run_returns_excerpt_fallback_when_model_times_out(monkeypatch):
    monkeypatch.setattr(
        workflow,
        "embed_query_with_resilience",
        lambda *args, **kwargs: SimpleNamespace(
            vector=[0.1, 0.2],
            cache_hit=False,
            attempts=1,
            latency_ms=12.0,
            status="ready",
        ),
    )

    def fail_model(*args, **kwargs):
        raise TimeoutError("model timeout")

    monkeypatch.setattr(workflow, "_try_langchain_qa", fail_model)
    host = FakeHost(
        profile={"id": "profile-1"},
        config=({"id": "config-1", "provider": "custom_openai", "model": "slow-model"}, "key"),
        chunks=[
            {
                "id": "chunk-1",
                "documentId": "doc-1",
                "pageStart": 2,
                "content": "Feedback loops explain why a system changes over time.",
                "vectorRank": 1,
                "score": 0.95,
            }
        ],
    )

    result = workflow.run_knowledge_qa_workflow("run-1", "question", ["doc-1"], host)

    assert result["answer"]["answerMode"] == "excerpt_fallback"
    assert result["answer"]["retrievalStatus"] == "ready"
    assert result["answer"]["citations"][0]["chunkId"] == "chunk-1"
    assert "Feedback loops" in result["answer"]["answer"]
