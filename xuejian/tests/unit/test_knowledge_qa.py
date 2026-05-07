import pytest

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

    def is_run_cancelled(self, run_id):
        return False

    def get_active_embedding_profile(self):
        return self.profile

    def search_hybrid(self, *args, **kwargs):
        return self.chunks

    def get_config_for_workflow(self, workflow_type):
        return self.config


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
    monkeypatch.setattr(workflow, "embed_texts", lambda *args, **kwargs: [[0.1, 0.2]])
    host = ReadinessHost(readiness_status="ready", chunks=[])

    result = workflow.run_knowledge_qa_workflow("run-1", "question", ["doc-1"], host)

    assert host.readiness_checked is True
    assert result["answer"]["retrievalStatus"] == "no_hits"
    assert result["answer"]["retrievalStatus"] != "embedding_stale"


def test_run_returns_embedding_failed_when_query_embedding_fails(monkeypatch):
    def fail_embed(*args, **kwargs):
        raise RuntimeError("provider failed")

    monkeypatch.setattr(workflow, "embed_texts", fail_embed)
    host = FakeHost(profile={"id": "profile-1"})

    result = workflow.run_knowledge_qa_workflow("run-1", "问题", ["doc-1"], host)

    assert result["answer"]["retrievalStatus"] == "query_embedding_failed"


def test_run_uses_lexical_excerpt_fallback_when_query_embedding_config_fails(monkeypatch):
    def fail_embed(*args, **kwargs):
        raise RuntimeError("No enabled API config with key found for provider 'custom_openai'")

    monkeypatch.setattr(workflow, "embed_texts", fail_embed)
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
    monkeypatch.setattr(workflow, "embed_texts", lambda *args, **kwargs: [[0.1, 0.2]])
    host = FakeHost(
        profile={"id": "profile-1"},
        chunks=[{"id": "lexical", "content": "关键词命中但没有向量信号"}],
    )

    result = workflow.run_knowledge_qa_workflow("run-1", "问题", ["doc-1"], host)

    assert result["answer"]["retrievalStatus"] == "no_hits"
    assert result["answer"]["retrievalMode"] == "hybrid"


def test_run_returns_excerpt_fallback_when_model_times_out(monkeypatch):
    monkeypatch.setattr(workflow, "embed_texts", lambda *args, **kwargs: [[0.1, 0.2]])

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
