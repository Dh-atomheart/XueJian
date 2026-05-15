import json

from orchestration_service import server
from orchestration_service.graphs.card_graph import CardGraphRunner
from orchestration_service.workflows.card_generation_agent import CardGenerationAgentRunner


class FakeHandler:
    def __init__(self, body):
        self.body = json.dumps(body).encode("utf-8")
        self.response = None

    def _read_body(self):
        return self.body

    def _write_json(self, status_code, payload):
        self.response = (status_code, payload)


def test_agent_card_generation_endpoint_uses_card_graph(monkeypatch):
    monkeypatch.setattr(server, "_host_gateway", object())
    called = {"card_graph": False, "legacy_runner": False}

    def fake_card_graph_run(self, run_id, **kwargs):
        called["card_graph"] = True
        assert kwargs["document_ids"] == ["doc-1"]
        assert kwargs["write_mode"] == "candidate"
        return {
            "status": "completed",
            "runtime": "langgraph_card",
            "graphVersion": "card-graph-v1",
            "fallbackUsed": False,
            "cardArtifactRefs": [],
            "createdCardIds": [],
            "qualityEnvelope": {
                "groundingStatus": "not_applicable",
                "auditStatus": "not_applicable",
                "confidence": 0.0,
                "riskLevel": "low",
                "reviewRequired": False,
                "blockingReasons": [],
            },
            "errorCategory": None,
        }

    def fail_legacy_runner(*args, **kwargs):
        called["legacy_runner"] = True
        raise AssertionError("legacy CardGenerationAgentRunner should not be used")

    monkeypatch.setattr(CardGraphRunner, "run", fake_card_graph_run)
    monkeypatch.setattr(CardGenerationAgentRunner, "run", fail_legacy_runner)

    handler_cls = server.build_handler(0)
    handler = FakeHandler(
        {
            "runId": "run-card-1",
            "documentId": "doc-1",
            "density": "medium",
            "providerConfigId": "config-1",
        }
    )

    handler_cls._handle_agent_card_generation(handler)

    assert handler.response[0] == 200
    assert handler.response[1]["runtime"] == "langgraph_card"
    assert called == {"card_graph": True, "legacy_runner": False}


def test_agent_card_generation_endpoint_converts_runner_exception_to_failed_payload(monkeypatch):
    monkeypatch.setattr(server, "_host_gateway", object())

    def timeout_run(self, run_id, **kwargs):
        raise TimeoutError("timed out")

    monkeypatch.setattr(CardGraphRunner, "run", timeout_run)

    handler_cls = server.build_handler(0)
    handler = FakeHandler(
        {
            "runId": "run-card-timeout",
            "documentId": "doc-1",
            "density": "medium",
            "providerConfigId": "config-1",
        }
    )

    handler_cls._handle_agent_card_generation(handler)

    assert handler.response[0] == 200
    assert handler.response[1]["status"] == "failed"
    assert handler.response[1]["runtime"] == "langgraph_card"
    assert handler.response[1]["errorCategory"] == "provider_timeout"
    assert "provider_timeout" in handler.response[1]["qualityEnvelope"]["blockingReasons"]
