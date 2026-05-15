import pytest

from orchestration_service.graphs import knowledge_nodes
from orchestration_service.graphs.knowledge_graph import KnowledgeGraphRunner
from orchestration_service.workflows import knowledge_qa as workflow


def _structured_chunks(document_id: str = "doc-1"):
    return [
        {
            "id": f"{document_id}-parent-1",
            "documentId": document_id,
            "sectionId": "section-1",
            "anchorId": f"anchor-{document_id}-parent",
            "pageStart": 1,
            "pageEnd": 1,
            "chunkIndex": 0,
            "chunkKind": "parent",
            "content": "这一节说明检索练习的定义、优点与适用边界。",
            "tokenCount": 24,
            "metadata": None,
        },
        {
            "id": f"{document_id}-child-1",
            "documentId": document_id,
            "sectionId": "section-1",
            "anchorId": f"anchor-{document_id}-child-1",
            "pageStart": 1,
            "pageEnd": 1,
            "chunkIndex": 1,
            "chunkKind": "child",
            "content": "检索练习通过主动回忆强化提取路径，并帮助暴露知识盲点。",
            "tokenCount": 18,
            "metadata": None,
        },
    ]


def _sections(document_id: str = "doc-1"):
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


class GraphHost:
    def __init__(self, responses: dict[str, list[dict]]):
        self.responses = responses
        self.emitted_events: list[dict] = []
        self.saved_checkpoints: list[dict] = []
        self.search_calls = 0
        self.search_queries: list[str] = []
        self.recent_messages: list[dict[str, str]] = []

    def is_run_cancelled(self, run_id):
        return False

    def get_active_embedding_profile(self):
        return {"id": "profile-1"}

    def get_document_embedding_readiness(self, profile_id, document_ids=None):
        return {"status": "ready", "documents": []}

    def get_config_for_workflow(self, workflow_type):
        return ({"id": "config-1", "provider": "custom_openai", "model": "qa-model"}, "test-key")

    def list_recent_qa_messages(self, conversation_id, limit=4):
        return list(self.recent_messages)

    def search_hybrid(self, query, query_embedding=None, document_ids=None, limit=10, rrf_k=60):
        self.search_calls += 1
        self.search_queries.append(query)
        return [dict(item) for item in self.responses.get(query, [])]

    def list_chunks(self, document_id):
        return _structured_chunks(document_id)

    def list_sections(self, document_id):
        return _sections(document_id)

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


@pytest.fixture(autouse=True)
def _set_rerank_mode(monkeypatch):
    monkeypatch.setenv(workflow.RERANK_MODE_ENV, "local_rule")


def _assert_quality_envelope(envelope: dict):
    assert set(envelope) == {
        "groundingStatus",
        "auditStatus",
        "confidence",
        "riskLevel",
        "reviewRequired",
        "blockingReasons",
    }


def _assert_artifact(artifact: dict, artifact_type: str):
    assert artifact["artifactType"] == artifact_type
    assert isinstance(artifact["artifactId"], str)
    assert artifact["schemaVersion"] == 1
    assert isinstance(artifact["summary"], str)
    assert isinstance(artifact["sourceRefs"], list)
    assert artifact["createdBy"] == "langgraph_rag"
    _assert_quality_envelope(artifact["qualityEnvelope"])


def _assert_common_contract(result: dict):
    assert result["runtime"] == "langgraph_rag"
    assert result["graphVersion"] == "knowledge-graph-v1"
    assert isinstance(result["fallbackUsed"], bool)
    assert result["answer"]["ragTrace"] is not None
    _assert_quality_envelope(result["qualityEnvelope"])
    assert isinstance(result["artifactRefs"]["evidence"], list)
    assert result["artifactRefs"]["answer"].startswith("knowledge-qa://runs/")
    _assert_artifact(result["artifacts"]["evidence"], "evidence")
    _assert_artifact(result["artifacts"]["answer"], "answer")


def test_parity_single_document_grounded_answer(monkeypatch):
    monkeypatch.setattr(knowledge_nodes, "embed_query_with_resilience", _embed_result)
    monkeypatch.setattr(workflow, "_embed_optional_query", lambda *args, **kwargs: [0.1, 0.2])
    monkeypatch.setattr(workflow, "_try_langchain_qa", lambda *args, **kwargs: {
        "answer": "资料显示检索练习通过主动回忆强化提取路径。",
        "answerMode": "grounded",
        "citations": [{"chunkId": "child-1", "snippet": "主动回忆强化提取路径"}],
    })
    host = GraphHost(
        {
            "检索练习有什么优点": [
                _hybrid_hit("child-1", "检索练习通过主动回忆强化提取路径。", 0.92),
            ]
        }
    )

    result = KnowledgeGraphRunner(host).run("run-parity-1", "检索练习有什么优点", ["doc-1"])

    _assert_common_contract(result)
    assert result["answer"]["answerMode"] == "grounded"
    assert result["artifacts"]["answer"]["answerMode"] == "grounded"
    assert result["qualityEnvelope"]["groundingStatus"] == "grounded"


def test_parity_multi_document_grounded_answer(monkeypatch):
    monkeypatch.setattr(knowledge_nodes, "embed_query_with_resilience", _embed_result)
    monkeypatch.setattr(workflow, "_embed_optional_query", lambda *args, **kwargs: [0.1, 0.2])
    monkeypatch.setattr(workflow, "_try_langchain_qa", lambda *args, **kwargs: {
        "answer": "两份资料都说明检索练习能强化提取并暴露盲点。",
        "answerMode": "grounded",
        "citations": [{"chunkId": "child-2", "snippet": "暴露知识盲点"}],
    })
    host = GraphHost(
        {
            "检索练习有什么优点": [
                _hybrid_hit("child-1", "第一份资料说明它能强化提取路径。", 0.94, document_id="doc-1"),
                _hybrid_hit("child-2", "第二份资料说明它能暴露知识盲点。", 0.9, document_id="doc-2"),
            ]
        }
    )

    result = KnowledgeGraphRunner(host).run("run-parity-2", "检索练习有什么优点", ["doc-1", "doc-2"])

    _assert_common_contract(result)
    assert result["answer"]["answerMode"] == "grounded"
    assert set(result["artifacts"]["evidence"]["documentIds"]) == {"doc-1", "doc-2"}


def test_parity_no_relevant_content(monkeypatch):
    monkeypatch.setattr(knowledge_nodes, "embed_query_with_resilience", _embed_result)
    monkeypatch.setattr(workflow, "_embed_optional_query", lambda *args, **kwargs: [0.1, 0.2])
    monkeypatch.setattr(workflow, "_build_second_retrieval_query", lambda *args, **kwargs: "二次检索问题")
    host = GraphHost({})

    result = KnowledgeGraphRunner(host).run("run-parity-3", "检索练习有什么优点", ["doc-1"])

    _assert_common_contract(result)
    assert result["answer"]["answerMode"] == "no_relevant_content"
    assert result["answer"]["retrievalStatus"] == "no_hits"
    assert result["answer"]["citations"] == []
    assert result["qualityEnvelope"]["groundingStatus"] == "not_applicable"


def test_parity_fts_only_excerpt_fallback(monkeypatch):
    monkeypatch.setattr(knowledge_nodes, "embed_query_with_resilience", _embed_result)
    monkeypatch.setattr(workflow, "_embed_optional_query", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        workflow,
        "_try_langchain_qa",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("fts5 path should not call model")),
    )
    host = GraphHost(
        {
            "检索练习有什么优点": [
                {
                    "id": "lexical-1",
                    "chunkId": "lexical-1",
                    "documentId": "doc-1",
                    "sectionId": "section-1",
                    "anchorId": "anchor-lexical-1",
                    "chunkIndex": 1,
                    "pageStart": 1,
                    "content": "检索练习通过主动回忆强化提取路径。",
                    "score": 0.61,
                    "lexicalSource": "fts5_bm25",
                }
            ]
        }
    )

    result = KnowledgeGraphRunner(host).run("run-parity-4", "检索练习有什么优点", ["doc-1"])

    _assert_common_contract(result)
    assert result["answer"]["answerMode"] == "excerpt_fallback"
    assert result["answer"]["retrievalMode"] == "fts5"
    assert result["artifacts"]["evidence"]["qualityEnvelope"]["riskLevel"] == "high"
    assert result["artifacts"]["answer"]["qualityEnvelope"]["groundingStatus"] == "ungrounded"


def test_parity_embedding_missing(monkeypatch):
    monkeypatch.setattr(knowledge_nodes, "embed_query_with_resilience", _embed_result)
    host = GraphHost({})
    host.get_active_embedding_profile = lambda: None

    result = KnowledgeGraphRunner(host).run("run-parity-5", "检索练习有什么优点", ["doc-1"])

    _assert_common_contract(result)
    assert host.search_calls == 0
    assert result["answer"]["retrievalStatus"] == "embedding_missing"
    assert result["artifacts"]["evidence"]["retrievalStatus"] == "embedding_missing"
    assert result["artifacts"]["evidence"]["qualityEnvelope"]["riskLevel"] == "high"


def test_parity_rewrite_failure_falls_back_to_original_query(monkeypatch):
    monkeypatch.setattr(knowledge_nodes, "embed_query_with_resilience", _embed_result)
    monkeypatch.setattr(workflow, "_embed_optional_query", lambda *args, **kwargs: [0.1, 0.2])
    monkeypatch.setattr(workflow, "_rewrite_trigger_reason", lambda *args, **kwargs: "follow_up_context")
    monkeypatch.setattr(
        workflow,
        "_rewrite_query",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("rewrite failed")),
    )
    monkeypatch.setattr(workflow, "_try_langchain_qa", lambda *args, **kwargs: {
        "answer": "资料显示检索练习通过主动回忆强化提取路径。",
        "answerMode": "grounded",
        "citations": [{"chunkId": "child-1", "snippet": "主动回忆强化提取路径"}],
    })
    host = GraphHost(
        {
            "检索练习有什么优点": [
                _hybrid_hit("child-1", "检索练习通过主动回忆强化提取路径。", 0.92),
            ]
        }
    )
    host.recent_messages = [{"role": "user", "content": "继续说"}]

    result = KnowledgeGraphRunner(host).run(
        "run-parity-6",
        "检索练习有什么优点",
        ["doc-1"],
        conversation_id="conv-1",
    )

    _assert_common_contract(result)
    assert host.search_queries == ["检索练习有什么优点"]
    assert result["answer"]["answerMode"] == "grounded"
    assert result["answer"]["ragTrace"]["rewriteSummary"]["status"] == "failed"


def test_parity_citation_audit_failure_does_not_bypass_audit(monkeypatch):
    monkeypatch.setattr(knowledge_nodes, "embed_query_with_resilience", _embed_result)
    monkeypatch.setattr(workflow, "_embed_optional_query", lambda *args, **kwargs: [0.1, 0.2])
    monkeypatch.setattr(workflow, "_build_second_retrieval_query", lambda *args, **kwargs: "二次检索问题")

    answers = iter(
        [
            {
                "answer": "第一次回答引用失败。",
                "answerMode": "grounded",
                "citations": [{"chunkId": "missing-chunk", "snippet": "错误引用"}],
            },
            {
                "answer": "第二次回答仍然引用失败。",
                "answerMode": "grounded",
                "citations": [{"chunkId": "missing-chunk-2", "snippet": "再次错误引用"}],
            },
        ]
    )
    monkeypatch.setattr(workflow, "_try_langchain_qa", lambda *args, **kwargs: next(answers))
    host = GraphHost(
        {
            "检索练习有什么优点": [
                _hybrid_hit("child-1", "第一次检索只找到了不稳定证据。", 0.92),
            ],
            "二次检索问题": [
                _hybrid_hit("child-2", "补救后的证据说明检索练习能暴露知识盲点。", 0.95),
            ],
        }
    )

    result = KnowledgeGraphRunner(host).run("run-parity-7", "检索练习有什么优点", ["doc-1"])

    _assert_common_contract(result)
    assert result["answer"]["answerMode"] == "no_relevant_content"
    assert result["qualityEnvelope"]["auditStatus"] == "failed"
    assert result["artifacts"]["answer"]["qualityEnvelope"]["auditStatus"] == "failed"
    assert result["artifacts"]["answer"]["answerMode"] == "no_relevant_content"