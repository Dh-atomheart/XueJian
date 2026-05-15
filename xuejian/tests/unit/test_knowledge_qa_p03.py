from types import SimpleNamespace

from orchestration_service.workflows import knowledge_qa as workflow


class ParentMergeHost:
    def __init__(self):
        self.list_chunks_calls = 0
        self.list_sections_calls = 0

    def is_run_cancelled(self, run_id):
        return False

    def list_chunks(self, document_id):
        self.list_chunks_calls += 1
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
                "content": "这一节系统说明检索练习与间隔重复如何共同提升长期记忆。",
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
                "content": "检索练习通过主动回忆来强化记忆提取路径。",
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
                "content": "间隔重复通过拉长复习间隔降低遗忘速度。",
                "tokenCount": 18,
                "metadata": None,
            },
        ]

    def list_sections(self, document_id):
        self.list_sections_calls += 1
        return [
            {
                "id": "section-1",
                "documentId": document_id,
                "heading": "记忆策略",
                "hierarchyPath": ["第一章", "高效学习"],
                "content": "章节内容总结。",
            }
        ]


class RunHost(ParentMergeHost):
    def get_active_embedding_profile(self):
        return {"id": "profile-1"}

    def get_document_embedding_readiness(self, profile_id, document_ids=None):
        return {"status": "ready", "documents": []}

    def search_hybrid(self, *args, **kwargs):
        return [
            {
                "id": "child-1",
                "chunkId": "child-1",
                "documentId": "doc-1",
                "sectionId": "section-1",
                "anchorId": "anchor-child-1",
                "chunkIndex": 1,
                "pageStart": 1,
                "content": "检索练习通过主动回忆来强化记忆提取路径。",
                "score": 0.92,
                "vectorRank": 1,
                "distance": 0.11,
                "lexicalSource": "fts5_bm25",
            },
            {
                "id": "child-2",
                "chunkId": "child-2",
                "documentId": "doc-1",
                "sectionId": "section-1",
                "anchorId": "anchor-child-2",
                "chunkIndex": 2,
                "pageStart": 1,
                "content": "间隔重复通过拉长复习间隔降低遗忘速度。",
                "score": 0.88,
                "vectorRank": 2,
                "distance": 0.15,
                "lexicalSource": "fts5_bm25",
            },
        ]

    def get_config_for_workflow(self, workflow_type):
        return ({}, "test-key")


def _retrieved_chunks():
    return [
        {
            "id": "child-1",
            "chunkId": "child-1",
            "documentId": "doc-1",
            "sectionId": "section-1",
            "chunkIndex": 1,
            "content": "检索练习通过主动回忆来强化记忆提取路径。",
            "score": 0.9,
        },
        {
            "id": "child-2",
            "chunkId": "child-2",
            "documentId": "doc-1",
            "sectionId": "section-1",
            "chunkIndex": 2,
            "content": "间隔重复通过拉长复习间隔降低遗忘速度。",
            "score": 0.85,
        },
    ]


def test_merge_parent_context_deduplicates_same_section():
    host = ParentMergeHost()
    chunks = _retrieved_chunks()
    structure = workflow._build_document_structure_cache(host, chunks)
    hydrated = workflow._hydrate_chunks_from_structure(chunks, structure)

    expanded, summary = workflow._merge_parent_context(
        hydrated,
        host,
        document_structure=structure,
    )

    assert host.list_chunks_calls == 1
    assert host.list_sections_calls == 1
    assert summary["parentContextsAdded"] == 1
    assert summary["childChunksExpanded"] == 1
    assert expanded["child-1"]["sourceKind"] == "parent"
    assert "sectionHeading" in expanded["child-2"]


def test_merge_parent_context_budget_capped(monkeypatch):
    host = ParentMergeHost()
    chunks = _retrieved_chunks()
    structure = workflow._build_document_structure_cache(host, chunks)
    hydrated = workflow._hydrate_chunks_from_structure(chunks, structure)
    monkeypatch.setattr(workflow, "MAX_PARENT_CONTEXT_CHARS", 18)

    expanded, summary = workflow._merge_parent_context(
        hydrated,
        host,
        document_structure=structure,
    )

    contexts = [payload.get("context", "") for payload in expanded.values() if payload.get("context")]
    assert contexts
    assert max(len(context) for context in contexts) <= 18
    assert summary["charsAdded"] <= 18


def test_audit_citations_rejects_non_retrieved_chunks():
    citations, rejected, status = workflow._audit_citations(
        [
            {"chunkId": "child-1", "snippet": "主动回忆来强化记忆提取路径"},
            {"chunkId": "missing", "snippet": "编造片段"},
        ],
        [
            {
                "id": "child-1",
                "documentId": "doc-1",
                "content": "检索练习通过主动回忆来强化记忆提取路径。",
                "pageStart": 1,
            }
        ],
    )

    assert status == "filtered"
    assert rejected == ["missing"]
    assert [citation["chunkId"] for citation in citations] == ["child-1"]


def test_audit_citations_all_rejected_returns_status():
    citations, rejected, status = workflow._audit_citations(
        [{"chunkId": "missing", "snippet": "编造片段"}],
        [{"id": "child-1", "documentId": "doc-1", "content": "有效正文", "pageStart": 2}],
    )

    assert citations == []
    assert rejected == ["missing"]
    assert status == "all_rejected"


def test_build_passages_includes_parent_context():
    passages = workflow._build_passages(
        [{"id": "child-1", "documentId": "doc-1", "pageStart": 1, "content": "子块正文", "score": 0.9}],
        {
            "child-1": {
                "sectionHeading": "第一章 > 高效学习 > 记忆策略",
                "context": "父块背景说明",
                "sourceKind": "parent",
            }
        },
    )

    assert "sectionHeading: 第一章 > 高效学习 > 记忆策略" in passages
    assert "expandedContext: 父块背景说明" in passages
    assert "citationEvidence: 子块正文" in passages


def test_run_includes_rag_trace_with_audit_summary(monkeypatch):
    monkeypatch.setattr(
        workflow,
        "embed_query_with_resilience",
        lambda *args, **kwargs: SimpleNamespace(
            vector=[0.1, 0.2],
            cache_hit=False,
            attempts=1,
            latency_ms=8.5,
            status="ready",
        ),
    )
    monkeypatch.setattr(
        workflow,
        "_try_langchain_qa",
        lambda *args, **kwargs: {
            "answer": "检索练习和间隔重复都能提升长期记忆，但作用机制不同。",
            "answerMode": "grounded",
            "citations": [
                {"chunkId": "child-1", "snippet": "主动回忆来强化记忆提取路径"},
                {"chunkId": "missing", "snippet": "编造片段"},
            ],
        },
    )
    host = RunHost()

    result = workflow.run_knowledge_qa_workflow("run-1", "什么是检索练习？", ["doc-1"], host)

    assert result["answer"]["answerMode"] == "grounded"
    assert [citation["chunkId"] for citation in result["answer"]["citations"]] == ["child-1"]
    trace = result["answer"]["ragTrace"]
    assert trace["retrievalSummary"]["chunkCount"] == 2
    assert trace["mergeSummary"]["parentContextsAdded"] == 1
    assert trace["auditSummary"]["rejectedCitations"] == 1
    assert trace["citationAuditStatus"] == "filtered"