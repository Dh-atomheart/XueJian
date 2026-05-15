import json

from orchestration_service import server
from orchestration_service.graphs.knowledge_graph import KnowledgeGraphRunner


class FakeHandler:
    def __init__(self, body):
        self.body = json.dumps(body).encode("utf-8")
        self.response = None

    def _read_body(self):
        return self.body

    def _write_json(self, status_code, payload):
        self.response = (status_code, payload)


def test_knowledge_qa_endpoint_rejects_agent_runtime_without_emergency_flag(monkeypatch):
    monkeypatch.setattr(server, "_host_gateway", object())
    monkeypatch.setenv("XUEJIAN_AGENT_RUNTIME", "agent")
    monkeypatch.delenv("XUEJIAN_ENABLE_AGENT_RUNTIME_EMERGENCY", raising=False)

    handler_cls = server.build_handler(0)
    handler = FakeHandler({"runId": "run-1", "question": "检索练习有什么优点", "documentIds": ["doc-1"]})

    handler_cls._handle_knowledge_qa(handler)

    assert handler.response[0] == 400
    assert "runtime 'agent' is disabled" in handler.response[1]["error"]


def test_knowledge_qa_endpoint_rejects_unknown_runtime(monkeypatch):
    monkeypatch.setattr(server, "_host_gateway", object())
    monkeypatch.setenv("XUEJIAN_AGENT_RUNTIME", "legacy")
    monkeypatch.delenv("XUEJIAN_ENABLE_AGENT_RUNTIME_EMERGENCY", raising=False)

    handler_cls = server.build_handler(0)
    handler = FakeHandler({"runId": "run-1", "question": "检索练习有什么优点", "documentIds": ["doc-1"]})

    handler_cls._handle_knowledge_qa(handler)

    assert handler.response == (
        400,
        {
            "error": "unsupported knowledge QA runtime: legacy",
            "supportedRuntime": "langgraph_rag",
        },
    )


def test_knowledge_qa_endpoint_converts_runner_exception_to_failed_payload(monkeypatch):
    monkeypatch.setattr(server, "_host_gateway", object())
    monkeypatch.setenv("XUEJIAN_AGENT_RUNTIME", "langgraph_rag")

    def timeout_run(self, *args, **kwargs):
        raise TimeoutError("timed out")

    monkeypatch.setattr(KnowledgeGraphRunner, "run", timeout_run)

    handler_cls = server.build_handler(0)
    handler = FakeHandler({"runId": "run-qa-timeout", "question": "why?", "documentIds": ["doc-1"]})

    handler_cls._handle_knowledge_qa(handler)

    assert handler.response[0] == 200
    assert handler.response[1]["status"] == "failed"
    assert handler.response[1]["runtime"] == "langgraph_rag"
    assert handler.response[1]["errorCategory"] == "provider_timeout"
    assert handler.response[1]["answer"]["retrievalStatus"] == "provider_timeout"
    assert "provider_timeout" in handler.response[1]["qualityEnvelope"]["blockingReasons"]
