import json

from orchestration_service import server
from orchestration_service.graphs.supervisor_graph import SupervisorGraphRunner
from orchestration_service.graphs.supervisor_planner import SupervisorPlanner


class FakeHandler:
    def __init__(self, body):
        self.body = json.dumps(body).encode("utf-8")
        self.response = None

    def _read_body(self):
        return self.body

    def _write_json(self, status_code, payload):
        self.response = (status_code, payload)


class FakeHost:
    def __init__(self):
        self.requested_configs = []
        self.workflow_requests = []
        self.events = []
        self.checkpoints = []

    def get_config(self, config_id):
        self.requested_configs.append(config_id)
        return {
            "id": config_id,
            "provider": "openai",
            "model": "gpt-test",
            "authMode": "api_key",
            "isEnabled": True,
        }

    def get_api_key(self, config_id):
        return f"key-for-{config_id}"

    def get_config_for_workflow(self, workflow_type):
        self.workflow_requests.append(workflow_type)
        if workflow_type == "multi_agent":
            return (
                {
                    "id": "workflow-config",
                    "provider": "openai",
                    "model": "gpt-test",
                    "authMode": "api_key",
                    "isEnabled": True,
                },
                "workflow-key",
            )
        return None

    def emit_workflow_event(self, run_id, event_type, message=None, progress=None, payload=None):
        self.events.append({"runId": run_id, "eventType": event_type, "payload": payload})
        return {"stored": True}

    def save_checkpoint(self, run_id, checkpoint_type, payload=None):
        self.checkpoints.append({"runId": run_id, "checkpointType": checkpoint_type, "payload": payload})
        return {"stored": True}


def _supervisor_response(status="completed", error_category=None):
    return {
        "runtime": "langgraph_multi_agent",
        "graphVersion": "supervisor-graph-v1",
        "fallbackUsed": False,
        "status": status,
        "summary": "ok",
        "artifactRefs": {"trace": []},
        "qualityEnvelope": {
            "groundingStatus": "not_applicable",
            "auditStatus": "not_applicable",
            "confidence": 1.0,
            "riskLevel": "low",
            "reviewRequired": False,
            "blockingReasons": [],
        },
        "errorCategory": error_category,
        "decisionRecords": [],
        "budgetCounters": {},
        "artifacts": {},
    }


def test_agent_task_endpoint_invokes_supervisor(monkeypatch):
    fake_host = FakeHost()
    monkeypatch.setattr(server, "_host_gateway", fake_host)
    captured = {}

    def fake_run(self, run_id, **kwargs):
        captured["run_id"] = run_id
        captured.update(kwargs)
        return _supervisor_response()

    monkeypatch.setattr(SupervisorGraphRunner, "run", fake_run)

    handler_cls = server.build_handler(0)
    handler = FakeHandler(
        {
            "runId": "run-agent-1",
            "taskType": "compound_study_task",
            "userRequest": "Explain this material, make cards, and diagnose weak review topics.",
            "documentIds": ["doc-1"],
            "cardGroupIds": ["group-1"],
            "options": {"providerConfigId": "override-config", "allowFormalCardWrite": True},
        }
    )

    handler_cls._handle_agent_task(handler)

    assert handler.response[0] == 200
    assert handler.response[1]["runtime"] == "langgraph_multi_agent"
    assert fake_host.requested_configs == ["override-config"]
    assert captured["run_id"] == "run-agent-1"
    assert captured["document_ids"] == ["doc-1"]
    assert captured["card_group_ids"] == ["group-1"]
    assert captured["provider_config_id"] == "override-config"
    assert captured["planner_config"]["id"] == "override-config"
    assert captured["planner_api_key"] == "key-for-override-config"
    assert captured["options"]["allowFormalCardWrite"] is True


def test_agent_task_plain_qa_returns_200_blocked(monkeypatch):
    monkeypatch.setattr(server, "_host_gateway", FakeHost())

    handler_cls = server.build_handler(0)
    handler = FakeHandler(
        {
            "runId": "run-agent-2",
            "taskType": "compound_study_task",
            "userRequest": "Answer this question from the document.",
            "documentIds": ["doc-1"],
        }
    )

    handler_cls._handle_agent_task(handler)

    assert handler.response[0] == 200
    assert handler.response[1]["runtime"] == "langgraph_multi_agent"
    assert handler.response[1]["status"] == "failed"
    assert handler.response[1]["errorCategory"] == "not_compound_task"


def test_agent_task_missing_model_config_fails_without_real_model_call(monkeypatch):
    class MissingConfigHost(FakeHost):
        def get_config_for_workflow(self, workflow_type):
            self.workflow_requests.append(workflow_type)
            return None

    called = {"planner": False}

    def fail_if_called(self, **kwargs):
        called["planner"] = True
        raise AssertionError("planner should fail before a real model call")

    monkeypatch.setattr(server, "_host_gateway", MissingConfigHost())
    monkeypatch.setattr(SupervisorPlanner, "plan", fail_if_called)

    handler_cls = server.build_handler(0)
    handler = FakeHandler(
        {
            "runId": "run-agent-3",
            "taskType": "compound_study_task",
            "userRequest": "Explain the document, make cards, and diagnose weak study topics.",
            "documentIds": ["doc-1"],
        }
    )

    handler_cls._handle_agent_task(handler)

    assert handler.response[0] == 200
    assert handler.response[1]["status"] == "failed"
    assert handler.response[1]["errorCategory"] == "provider_auth_error"
    assert called["planner"] is False


def test_agent_task_workflow_assignment_falls_back_to_multi_agent(monkeypatch):
    fake_host = FakeHost()
    monkeypatch.setattr(server, "_host_gateway", fake_host)
    captured = {}

    def fake_run(self, run_id, **kwargs):
        captured.update(kwargs)
        return _supervisor_response()

    monkeypatch.setattr(SupervisorGraphRunner, "run", fake_run)

    handler_cls = server.build_handler(0)
    handler = FakeHandler(
        {
            "runId": "run-agent-4",
            "taskType": "compound_study_task",
            "userRequest": "Explain, create flashcards, and review weak topics.",
            "documentIds": ["doc-1"],
            "options": {},
        }
    )

    handler_cls._handle_agent_task(handler)

    assert handler.response[0] == 200
    assert fake_host.workflow_requests == ["agent_task", "multi_agent"]
    assert captured["provider_config_id"] == "workflow-config"
    assert captured["planner_api_key"] == "workflow-key"


def test_agent_task_endpoint_converts_runner_exception_to_failed_payload(monkeypatch):
    fake_host = FakeHost()
    monkeypatch.setattr(server, "_host_gateway", fake_host)

    def timeout_run(self, run_id, **kwargs):
        raise TimeoutError("timed out")

    monkeypatch.setattr(SupervisorGraphRunner, "run", timeout_run)

    handler_cls = server.build_handler(0)
    handler = FakeHandler(
        {
            "runId": "run-agent-timeout",
            "taskType": "compound_study_task",
            "userRequest": "Explain, create flashcards, and review weak topics.",
            "documentIds": ["doc-1"],
            "options": {"providerConfigId": "override-config"},
        }
    )

    handler_cls._handle_agent_task(handler)

    assert handler.response[0] == 200
    assert handler.response[1]["status"] == "failed"
    assert handler.response[1]["runtime"] == "langgraph_multi_agent"
    assert handler.response[1]["errorCategory"] == "provider_timeout"
    assert "provider_timeout" in handler.response[1]["qualityEnvelope"]["blockingReasons"]
