from orchestration_service.graphs import supervisor_nodes
from orchestration_service.graphs.supervisor_graph import SupervisorGraphRunner, build_supervisor_graph
from orchestration_service.graphs.supervisor_planner import SupervisorPlanner


class SupervisorHost:
    def __init__(self):
        self.events = []
        self.checkpoints = []

    def emit_workflow_event(self, run_id, event_type, message=None, progress=None, payload=None):
        self.events.append({"runId": run_id, "eventType": event_type, "payload": payload})
        return {"stored": True}

    def save_checkpoint(self, run_id, checkpoint):
        self.checkpoints.append({"runId": run_id, "checkpoint": checkpoint})
        return {"stored": True}


def _quality(risk="low", reasons=None):
    return {
        "groundingStatus": "not_applicable",
        "auditStatus": "not_applicable",
        "confidence": 0.8 if risk == "low" else 0.2,
        "riskLevel": risk,
        "reviewRequired": risk != "low",
        "blockingReasons": reasons or [],
    }


def _knowledge_result():
    return {
        "status": "completed",
        "runtime": "langgraph_rag",
        "artifactRefs": {
            "evidence": ["knowledge-qa://runs/run/evidence/chunk-1"],
            "answer": "knowledge-qa://runs/run/answer",
        },
        "qualityEnvelope": _quality(),
        "errorCategory": None,
        "artifacts": {
            "knowledge-qa://runs/run/evidence/chunk-1": {
                "artifactId": "knowledge-qa://runs/run/evidence/chunk-1",
                "artifactType": "evidence",
                "qualityEnvelope": _quality(),
                "summary": "evidence",
            },
            "knowledge-qa://runs/run/answer": {
                "artifactId": "knowledge-qa://runs/run/answer",
                "artifactType": "answer",
                "qualityEnvelope": _quality(),
                "summary": "answer",
            },
        },
    }


def _card_result():
    return {
        "status": "completed",
        "runtime": "langgraph_card",
        "cardArtifactRefs": ["card-graph://runs/run/card_candidate/0"],
        "qualityEnvelope": _quality(),
        "errorCategory": None,
        "artifacts": {
            "card-graph://runs/run/card_candidate/0": {
                "artifactId": "card-graph://runs/run/card_candidate/0",
                "artifactType": "card_candidate",
                "qualityEnvelope": _quality(),
                "summary": "candidate",
            }
        },
    }


def _study_result():
    return {
        "status": "completed",
        "runtime": "langgraph_study",
        "learningAdviceArtifactRef": "study-graph://runs/run/learning_advice",
        "qualityEnvelope": _quality(),
        "errorCategory": None,
        "artifacts": {
            "study-graph://runs/run/learning_advice": {
                "artifactId": "study-graph://runs/run/learning_advice",
                "artifactType": "learning_advice",
                "qualityEnvelope": _quality(),
                "summary": "advice",
            }
        },
    }


def test_supervisor_graph_compiles():
    assert build_supervisor_graph() is not None


def test_supervisor_runs_compound_route_plan(monkeypatch):
    def fake_plan(self, **kwargs):
        return {
            "intent": "explain, make cards, diagnose study",
            "steps": [
                {"selectedGraph": "knowledge", "expectedArtifactType": "answer", "reasonSummary": "explain"},
                {"selectedGraph": "card", "expectedArtifactType": "card_candidate", "reasonSummary": "make cards"},
                {"selectedGraph": "study", "expectedArtifactType": "learning_advice", "reasonSummary": "diagnose"},
            ],
            "selfEval": {"necessity": "required", "riskLevel": "low", "confidence": 0.9, "reasonSummary": "compound"},
        }

    calls = []
    monkeypatch.setattr(SupervisorPlanner, "plan", fake_plan)
    monkeypatch.setattr(supervisor_nodes.KnowledgeGraphRunner, "run", lambda self, *args, **kwargs: calls.append("knowledge") or _knowledge_result())
    monkeypatch.setattr(supervisor_nodes.CardGraphRunner, "run", lambda self, *args, **kwargs: calls.append(("card", kwargs["write_mode"])) or _card_result())
    monkeypatch.setattr(supervisor_nodes.StudyGraphRunner, "run", lambda self, *args, **kwargs: calls.append("study") or _study_result())

    result = SupervisorGraphRunner(SupervisorHost()).run(
        "run-supervisor-1",
        task_type="compound_study_task",
        user_request="Explain retrieval practice, make cards, and diagnose weak review topics.",
        document_ids=["doc-1"],
        options={"allowFormalCardWrite": False},
        planner_config={"id": "config-1", "isEnabled": True},
        planner_api_key="key",
        provider_config_id="config-1",
    )

    assert result["status"] == "completed"
    assert result["runtime"] == "langgraph_multi_agent"
    assert calls == ["knowledge", ("card", "candidate"), "study"]
    assert result["artifactRefs"]["evidence"] == ["knowledge-qa://runs/run/evidence/chunk-1"]
    assert result["artifactRefs"]["card_candidate"] == ["card-graph://runs/run/card_candidate/0"]
    assert result["artifactRefs"]["learning_advice"] == ["study-graph://runs/run/learning_advice"]
    assert len(result["decisionRecords"]) == 3


def test_supervisor_partial_when_subgraph_high_risk(monkeypatch):
    def fake_plan(self, **kwargs):
        return {
            "intent": "explain and diagnose",
            "steps": [
                {"selectedGraph": "knowledge", "expectedArtifactType": "answer", "reasonSummary": "explain"},
                {"selectedGraph": "study", "expectedArtifactType": "learning_advice", "reasonSummary": "diagnose"},
            ],
            "selfEval": {"necessity": "required", "riskLevel": "low", "confidence": 0.8},
        }

    bad_knowledge = _knowledge_result()
    bad_knowledge["status"] = "failed"
    bad_knowledge["qualityEnvelope"] = _quality("high", ["embedding_missing"])
    monkeypatch.setattr(SupervisorPlanner, "plan", fake_plan)
    monkeypatch.setattr(supervisor_nodes.KnowledgeGraphRunner, "run", lambda *args, **kwargs: bad_knowledge)
    monkeypatch.setattr(supervisor_nodes.StudyGraphRunner, "run", lambda *args, **kwargs: _study_result())

    result = SupervisorGraphRunner(SupervisorHost()).run(
        "run-supervisor-2",
        task_type="compound_study_task",
        user_request="Explain the document and diagnose weak study topics.",
        document_ids=["doc-1"],
        planner_config={"id": "config-1", "isEnabled": True},
        planner_api_key="key",
    )

    assert result["status"] == "partial"
    assert result["qualityEnvelope"]["riskLevel"] == "high"
    assert "embedding_missing" in result["qualityEnvelope"]["blockingReasons"]


def test_supervisor_formal_card_write_follows_option(monkeypatch):
    monkeypatch.setattr(
        SupervisorPlanner,
        "plan",
        lambda self, **kwargs: {
            "intent": "explain and make formal cards",
            "steps": [{"selectedGraph": "card", "expectedArtifactType": "formal_card_write", "reasonSummary": "formal"}],
            "selfEval": {"necessity": "required", "riskLevel": "medium", "confidence": 0.7},
        },
    )
    seen = {}
    monkeypatch.setattr(supervisor_nodes.CardGraphRunner, "run", lambda self, *args, **kwargs: seen.update(kwargs) or _card_result())

    SupervisorGraphRunner(SupervisorHost()).run(
        "run-supervisor-3",
        task_type="compound_study_task",
        user_request="Explain the material and make cards for study.",
        document_ids=["doc-1"],
        options={"allowFormalCardWrite": True},
        planner_config={"id": "config-1", "isEnabled": True},
        planner_api_key="key",
        provider_config_id="config-1",
    )

    assert seen["write_mode"] == "formal_card"


def test_supervisor_passes_study_schedule_write_options(monkeypatch):
    monkeypatch.setattr(
        SupervisorPlanner,
        "plan",
        lambda self, **kwargs: {
            "intent": "diagnose and write study schedule",
            "steps": [{"selectedGraph": "study", "expectedArtifactType": "study_schedule_write", "reasonSummary": "schedule"}],
            "selfEval": {"necessity": "required", "riskLevel": "medium", "confidence": 0.7},
        },
    )
    seen = {}
    monkeypatch.setattr(supervisor_nodes.StudyGraphRunner, "run", lambda self, *args, **kwargs: seen.update(kwargs) or _study_result())

    result = SupervisorGraphRunner(SupervisorHost()).run(
        "run-supervisor-study-write",
        task_type="compound_study_task",
        user_request="Explain the material and diagnose review needs for study.",
        document_ids=["doc-1"],
        options={
            "allowStudyScheduleWrite": True,
            "studyScheduleDryRun": False,
            "studyScheduleIdempotencyKey": "study-schedule:run:test",
            "studyScheduleDryRunRef": "dry-1",
            "studyScheduleRollbackRef": "rollback-1",
        },
        planner_config={"id": "config-1", "isEnabled": True},
        planner_api_key="key",
    )

    assert result["status"] == "completed"
    assert seen["enable_schedule_write"] is True
    assert seen["dry_run"] is False
    assert seen["idempotency_key"] == "study-schedule:run:test"
    assert seen["dry_run_ref"] == "dry-1"
    assert seen["rollback_ref"] == "rollback-1"


def test_supervisor_returns_stable_failed_payload_on_planner_timeout(monkeypatch):
    def timeout_plan(self, **kwargs):
        raise TimeoutError("timed out")

    monkeypatch.setattr(SupervisorPlanner, "plan", timeout_plan)

    result = SupervisorGraphRunner(SupervisorHost()).run(
        "run-supervisor-timeout",
        task_type="compound_study_task",
        user_request="Explain the material, make cards, and diagnose weak topics.",
        document_ids=["doc-1"],
        planner_config={"id": "config-1", "isEnabled": True},
        planner_api_key="key",
        provider_config_id="config-1",
    )

    assert result["status"] == "failed"
    assert result["runtime"] == "langgraph_multi_agent"
    assert result["graphVersion"] == "supervisor-graph-v1"
    assert result["errorCategory"] == "provider_timeout"
    assert "provider_timeout" in result["qualityEnvelope"]["blockingReasons"]
