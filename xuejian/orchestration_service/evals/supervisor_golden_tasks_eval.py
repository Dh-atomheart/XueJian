"""Supervisor golden task evaluation runner.

Runs the SupervisorGraph against a FakeHost with a mocked planner to
validate routing, policy enforcement, budget limits, and partial success
handling without needing full Tauri runtime.
"""
from __future__ import annotations

import uuid
from typing import Any

from ..graphs.card_graph import CardGraphRunner
from ..graphs.study_graph import StudyGraphRunner
from ..graphs.supervisor_graph import SupervisorGraphRunner
from ..graphs.supervisor_nodes import KnowledgeGraphRunner
from ..graphs.supervisor_planner import SupervisorPlanner
from ..graphs.supervisor_state import GRAPH_VERSION, MAX_REPLANS, RUNTIME
from .eval_base import EvalResult, EvalSuite


class SupervisorFakeHost:
    """Minimal host scaffold for Supervisor eval."""

    def __init__(self):
        self.events: list[dict[str, Any]] = []
        self.checkpoints: list[dict[str, Any]] = []

    def emit_workflow_event(self, run_id: str, event_type: str, message: str | None = None, progress: float | None = None, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        self.events.append({"runId": run_id, "eventType": event_type, "payload": payload})
        return {"stored": True}

    def save_checkpoint(self, run_id: str, checkpoint: dict[str, Any]) -> dict[str, Any]:
        self.checkpoints.append({"runId": run_id, "checkpoint": checkpoint})
        return {"stored": True}

    def load_checkpoint(self, run_id: str) -> dict[str, Any] | None:
        return None


def _default_quality(risk: str = "low", reasons: list[str] | None = None) -> dict[str, Any]:
    return {
        "groundingStatus": "not_applicable",
        "auditStatus": "not_applicable",
        "confidence": 0.8 if risk == "low" else 0.2,
        "riskLevel": risk,
        "reviewRequired": risk != "low",
        "blockingReasons": reasons or [],
    }


def _knowledge_result() -> dict[str, Any]:
    return {
        "status": "completed",
        "runtime": "langgraph_rag",
        "artifactRefs": {
            "evidence": ["knowledge-qa://runs/run/evidence/chunk-1"],
            "answer": "knowledge-qa://runs/run/answer",
        },
        "qualityEnvelope": _default_quality(),
        "errorCategory": None,
        "artifacts": {
            "knowledge-qa://runs/run/evidence/chunk-1": {
                "artifactId": "knowledge-qa://runs/run/evidence/chunk-1",
                "artifactType": "evidence",
                "qualityEnvelope": _default_quality(),
                "summary": "evidence",
            },
            "knowledge-qa://runs/run/answer": {
                "artifactId": "knowledge-qa://runs/run/answer",
                "artifactType": "answer",
                "qualityEnvelope": _default_quality(),
                "summary": "answer",
            },
        },
    }


def _card_result() -> dict[str, Any]:
    return {
        "status": "completed",
        "runtime": "langgraph_card",
        "cardArtifactRefs": ["card-graph://runs/run/card_candidate/0"],
        "qualityEnvelope": _default_quality(),
        "errorCategory": None,
        "artifacts": {
            "card-graph://runs/run/card_candidate/0": {
                "artifactId": "card-graph://runs/run/card_candidate/0",
                "artifactType": "card_candidate",
                "qualityEnvelope": _default_quality(),
                "summary": "candidate",
            }
        },
    }


def _study_result() -> dict[str, Any]:
    return {
        "status": "completed",
        "runtime": "langgraph_study",
        "learningAdviceArtifactRef": "study-graph://runs/run/learning_advice",
        "qualityEnvelope": _default_quality(),
        "errorCategory": None,
        "artifacts": {
            "study-graph://runs/run/learning_advice": {
                "artifactId": "study-graph://runs/run/learning_advice",
                "artifactType": "learning_advice",
                "qualityEnvelope": _default_quality(),
                "summary": "advice",
            }
        },
    }


def _run(
    host: SupervisorFakeHost,
    *,
    task_type: str = "compound_study_task",
    user_request: str = "Explain retrieval practice, make cards, and diagnose weak review topics.",
    document_ids: list[str] | None = None,
    options: dict[str, Any] | None = None,
    planner_config: dict[str, Any] | None = None,
    planner_api_key: str = "",
    provider_config_id: str = "",
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "task_type": task_type,
        "user_request": user_request,
        "document_ids": document_ids or ["doc-1"],
        "options": options or {},
        "provider_config_id": provider_config_id,
    }
    if planner_config is not None:
        payload["planner_config"] = planner_config
    if planner_api_key:
        payload["planner_api_key"] = planner_api_key
    run_id = f"eval-supervisor-{uuid.uuid4().hex[:8]}"
    return SupervisorGraphRunner(host).run(run_id, **payload)


def run_non_compound_task_case() -> EvalResult:
    """Case supervisor-g1: non-compound task is rejected."""
    host = SupervisorFakeHost()
    result = _run(host, task_type="knowledge_qa", user_request="What is retrieval practice?")
    status = result.get("status")
    error = result.get("errorCategory")
    envelope = result.get("qualityEnvelope") or {}
    return EvalResult(
        case_id="supervisor-g1",
        suite="supervisor",
        runtime=RUNTIME,
        status=status or "unknown",
        quality_envelope=envelope,
        expected_behavior="status=failed, errorCategory=not_compound_task",
        actual_behavior=f"status={status}, error={error}",
        blocking_reasons=[] if status == "failed" and error == "not_compound_task" else ["expected not_compound_task rejection"],
        trace_ref=f"supervisor-graph://runs/{result.get('run_id', 'unknown')}/trace",
    )


def run_forbidden_graph_blocked_case(
    monkeypatch_planner: Any | None = None,
    monkeypatch_knowledge: Any | None = None,
    monkeypatch_card: Any | None = None,
    monkeypatch_study: Any | None = None,
) -> EvalResult:
    """Case supervisor-g2: forbidden graph step is rejected by policy."""
    import orchestration_service.graphs.supervisor_nodes as supervisor_nodes

    host = SupervisorFakeHost()

    def bad_plan(self: Any, **kwargs: Any) -> dict[str, Any]:
        return {
            "intent": "bad step",
            "steps": [
                {"selectedGraph": "forbidden_graph", "expectedArtifactType": "answer", "reasonSummary": "bad"},
            ],
            "selfEval": {"necessity": "required", "riskLevel": "medium", "confidence": 0.7},
        }

    original_plan = SupervisorPlanner.plan
    SupervisorPlanner.plan = bad_plan  # type: ignore[method-assign]
    original_knowledge = supervisor_nodes.KnowledgeGraphRunner
    original_card = supervisor_nodes.CardGraphRunner
    original_study = supervisor_nodes.StudyGraphRunner

    class FakeK:
        def __init__(self, host: Any) -> None:
            pass
        def run(self, *a: Any, **k: Any) -> dict[str, Any]:
            return _knowledge_result()
    class FakeC:
        def __init__(self, host: Any) -> None:
            pass
        def run(self, *a: Any, **k: Any) -> dict[str, Any]:
            return _card_result()
    class FakeS:
        def __init__(self, host: Any) -> None:
            pass
        def run(self, *a: Any, **k: Any) -> dict[str, Any]:
            return _study_result()
    supervisor_nodes.KnowledgeGraphRunner = FakeK  # type: ignore[misc]
    supervisor_nodes.CardGraphRunner = FakeC  # type: ignore[misc]
    supervisor_nodes.StudyGraphRunner = FakeS  # type: ignore[misc]

    try:
        result = _run(
            host,
            planner_config={"id": "config-1", "isEnabled": True},
            planner_api_key="key",
        )
    finally:
        SupervisorPlanner.plan = original_plan  # type: ignore[method-assign]
        supervisor_nodes.KnowledgeGraphRunner = original_knowledge  # type: ignore[misc]
        supervisor_nodes.CardGraphRunner = original_card  # type: ignore[misc]
        supervisor_nodes.StudyGraphRunner = original_study  # type: ignore[misc]

    error = result.get("errorCategory")
    status = result.get("status")
    records = result.get("decisionRecords", [])
    policy_rejected = any(r.get("policyCheck", {}).get("status") == "rejected" for r in records)

    return EvalResult(
        case_id="supervisor-g2",
        suite="supervisor",
        runtime=RUNTIME,
        status=status or "unknown",
        quality_envelope=result.get("qualityEnvelope") or {},
        expected_behavior="policy rejects forbidden graph, errorCategory=blocked_by_policy",
        actual_behavior=f"status={status}, error={error}, policy_rejected={policy_rejected}",
        blocking_reasons=[] if policy_rejected else ["expected policy rejection"],
        trace_ref=f"supervisor-graph://runs/{result.get('run_id', 'unknown')}/trace",
    )


def run_budget_exceeded_case(
    monkeypatch_knowledge: Any | None = None,
    monkeypatch_card: Any | None = None,
    monkeypatch_study: Any | None = None,
) -> EvalResult:
    """Case supervisor-g3: budget exceeded after max replans."""
    import orchestration_service.graphs.supervisor_nodes as supervisor_nodes

    host = SupervisorFakeHost()

    def failing_plan(self: Any, **kwargs: Any) -> dict[str, Any]:
        # Exceed MAX_PLAN_STEPS so policy_check_plan rejects with budget_exceeded
        steps = [
            {"selectedGraph": "knowledge", "expectedArtifactType": "answer", "reasonSummary": f"step-{i}"}
            for i in range(8)
        ]
        return {
            "intent": "failing plan",
            "steps": steps,
            "selfEval": {"necessity": "required", "riskLevel": "low", "confidence": 0.9},
        }

    original_plan = SupervisorPlanner.plan
    SupervisorPlanner.plan = failing_plan  # type: ignore[method-assign]
    original_knowledge = supervisor_nodes.KnowledgeGraphRunner
    class FakeKBudget:
        def __init__(self, host: Any) -> None:
            pass
        def run(self, *a: Any, **k: Any) -> dict[str, Any]:
            return _knowledge_result()
    supervisor_nodes.KnowledgeGraphRunner = FakeKBudget  # type: ignore[misc]

    try:
        result = _run(
            host,
            planner_config={"id": "config-1", "isEnabled": True},
            planner_api_key="key",
        )
    finally:
        SupervisorPlanner.plan = original_plan  # type: ignore[method-assign]
        supervisor_nodes.KnowledgeGraphRunner = original_knowledge  # type: ignore[misc]

    error = result.get("errorCategory")
    status = result.get("status")
    counters = result.get("budgetCounters", {})
    replans = counters.get("replans", 0)

    return EvalResult(
        case_id="supervisor-g3",
        suite="supervisor",
        runtime=RUNTIME,
        status=status or "unknown",
        quality_envelope=result.get("qualityEnvelope") or {},
        expected_behavior="errorCategory=budget_exceeded when replans exceed MAX_REPLANS",
        actual_behavior=f"status={status}, error={error}, replans={replans}",
        blocking_reasons=[] if error == "budget_exceeded" else ["expected budget_exceeded"],
        trace_ref=f"supervisor-graph://runs/{result.get('run_id', 'unknown')}/trace",
        metadata={"replans": replans, "maxReplans": MAX_REPLANS},
    )


def run_partial_success_case(
    monkeypatch_knowledge: Any | None = None,
    monkeypatch_card: Any | None = None,
    monkeypatch_study: Any | None = None,
) -> EvalResult:
    """Case supervisor-g4: partial success when subgraph fails."""
    import orchestration_service.graphs.supervisor_nodes as supervisor_nodes

    host = SupervisorFakeHost()

    def good_plan(self: Any, **kwargs: Any) -> dict[str, Any]:
        return {
            "intent": "explain and diagnose",
            "steps": [
                {"selectedGraph": "knowledge", "expectedArtifactType": "answer", "reasonSummary": "explain"},
                {"selectedGraph": "study", "expectedArtifactType": "learning_advice", "reasonSummary": "diagnose"},
            ],
            "selfEval": {"necessity": "required", "riskLevel": "low", "confidence": 0.8},
        }

    original_plan = SupervisorPlanner.plan
    SupervisorPlanner.plan = good_plan  # type: ignore[method-assign]
    original_knowledge = supervisor_nodes.KnowledgeGraphRunner
    original_card = supervisor_nodes.CardGraphRunner
    original_study = supervisor_nodes.StudyGraphRunner

    class FakeKPartial:
        def __init__(self, host: Any) -> None:
            pass
        def run(self, *a: Any, **k: Any) -> dict[str, Any]:
            r = _knowledge_result()
            r["status"] = "failed"
            r["qualityEnvelope"] = _default_quality("high", ["embedding_missing"])
            r["errorCategory"] = "embedding_missing"
            return r
    class FakeCPartial:
        def __init__(self, host: Any) -> None:
            pass
        def run(self, *a: Any, **k: Any) -> dict[str, Any]:
            return _card_result()
    class FakeSPartial:
        def __init__(self, host: Any) -> None:
            pass
        def run(self, *a: Any, **k: Any) -> dict[str, Any]:
            return _study_result()

    supervisor_nodes.KnowledgeGraphRunner = FakeKPartial  # type: ignore[misc]
    supervisor_nodes.CardGraphRunner = FakeCPartial  # type: ignore[misc]
    supervisor_nodes.StudyGraphRunner = FakeSPartial  # type: ignore[misc]

    try:
        result = _run(
            host,
            planner_config={"id": "config-1", "isEnabled": True},
            planner_api_key="key",
        )
    finally:
        SupervisorPlanner.plan = original_plan  # type: ignore[method-assign]
        supervisor_nodes.KnowledgeGraphRunner = original_knowledge  # type: ignore[misc]
        supervisor_nodes.CardGraphRunner = original_card  # type: ignore[misc]
        supervisor_nodes.StudyGraphRunner = original_study  # type: ignore[misc]

    status = result.get("status")
    records = result.get("decisionRecords", [])
    completed_steps = result.get("completedSteps", [])

    return EvalResult(
        case_id="supervisor-g4",
        suite="supervisor",
        runtime=RUNTIME,
        status=status or "unknown",
        quality_envelope=result.get("qualityEnvelope") or {},
        expected_behavior="status=partial, artifacts preserved, failure recorded",
        actual_behavior=f"status={status}, decisionRecords={len(records)}, completedSteps={len(completed_steps)}",
        blocking_reasons=[] if status == "partial" else ["expected partial status"],
        trace_ref=f"supervisor-graph://runs/{result.get('run_id', 'unknown')}/trace",
        metadata={"decisionRecordCount": len(records), "completedStepCount": len(completed_steps)},
    )


def run_formal_card_write_option_case(
    monkeypatch_knowledge: Any | None = None,
    monkeypatch_card: Any | None = None,
    monkeypatch_study: Any | None = None,
) -> EvalResult:
    """Case supervisor-g5: formal card write option propagated."""
    import orchestration_service.graphs.supervisor_nodes as supervisor_nodes

    host = SupervisorFakeHost()
    seen: dict[str, Any] = {}

    def card_plan(self: Any, **kwargs: Any) -> dict[str, Any]:
        return {
            "intent": "explain and make formal cards",
            "steps": [
                {"selectedGraph": "card", "expectedArtifactType": "formal_card_write", "reasonSummary": "formal"},
            ],
            "selfEval": {"necessity": "required", "riskLevel": "medium", "confidence": 0.7},
        }

    class TrappingCardGraphRunner:
        def __init__(self, host: Any):
            self.host = host

        def run(self, run_id: str, **kwargs: Any) -> dict[str, Any]:
            seen.update(kwargs)
            return _card_result()

    original_plan = SupervisorPlanner.plan
    SupervisorPlanner.plan = card_plan  # type: ignore[method-assign]
    original_card = supervisor_nodes.CardGraphRunner
    supervisor_nodes.CardGraphRunner = TrappingCardGraphRunner  # type: ignore[misc]
    original_knowledge = supervisor_nodes.KnowledgeGraphRunner
    original_study = supervisor_nodes.StudyGraphRunner
    class FakeKFormal:
        def __init__(self, host: Any) -> None:
            pass
        def run(self, *a: Any, **k: Any) -> dict[str, Any]:
            return _knowledge_result()
    class FakeSFormal:
        def __init__(self, host: Any) -> None:
            pass
        def run(self, *a: Any, **k: Any) -> dict[str, Any]:
            return _study_result()
    supervisor_nodes.KnowledgeGraphRunner = FakeKFormal  # type: ignore[misc]
    supervisor_nodes.StudyGraphRunner = FakeSFormal  # type: ignore[misc]

    try:
        result = _run(
            host,
            options={"allowFormalCardWrite": True},
            planner_config={"id": "config-1", "isEnabled": True},
            planner_api_key="key",
            provider_config_id="config-1",
        )
    finally:
        SupervisorPlanner.plan = original_plan  # type: ignore[method-assign]
        supervisor_nodes.CardGraphRunner = original_card  # type: ignore[misc]
        supervisor_nodes.KnowledgeGraphRunner = original_knowledge  # type: ignore[misc]
        supervisor_nodes.StudyGraphRunner = original_study  # type: ignore[misc]

    write_mode = seen.get("write_mode")
    return EvalResult(
        case_id="supervisor-g5",
        suite="supervisor",
        runtime=RUNTIME,
        status=result.get("status") or "unknown",
        quality_envelope=result.get("qualityEnvelope") or {},
        expected_behavior="CardGraph receives write_mode=formal_card",
        actual_behavior=f"write_mode={write_mode}",
        blocking_reasons=[] if write_mode == "formal_card" else ["expected formal_card write mode"],
        trace_ref=f"supervisor-graph://runs/{result.get('run_id', 'unknown')}/trace",
    )


def run_all_cases() -> EvalSuite:
    """Run all Supervisor golden task eval cases and return the suite."""
    suite = EvalSuite(
        name="supervisor-golden-tasks",
        runtime=RUNTIME,
        graph_version=GRAPH_VERSION,
    )
    suite.cases.append(run_non_compound_task_case())
    suite.cases.append(run_forbidden_graph_blocked_case())
    suite.cases.append(run_budget_exceeded_case())
    suite.cases.append(run_partial_success_case())
    suite.cases.append(run_formal_card_write_option_case())

    total = len(suite.cases)
    policy_bypass = sum(
        1 for c in suite.cases
        if c.case_id == "supervisor-g2" and c.blocking_reasons
    )
    budget_bypass = sum(
        1 for c in suite.cases
        if c.case_id == "supervisor-g3" and c.blocking_reasons
    )
    partial_count = sum(1 for c in suite.cases if c.status == "partial")
    suite.summary = {
        "caseCount": total,
        "blockingFailures": len(suite.blocking_failures()),
        "supervisor_policy_bypass_count": policy_bypass,
        "supervisor_budget_bypass_count": budget_bypass,
        "supervisor_partial_success_rate": round(partial_count / total, 3) if total else 0.0,
    }
    return suite
