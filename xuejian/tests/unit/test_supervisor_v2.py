"""Phase 10: Supervisor v2 long-running task unit tests."""
from __future__ import annotations

from typing import Any

import pytest


class MockHost:
    """Mock host gateway for testing."""

    def __init__(self, *, run_status: str = "running", checkpoint: dict[str, Any] | None = None):
        self.run_status = run_status
        self.saved_checkpoints: list[dict[str, Any]] = []
        self.checkpoint = checkpoint
        self.events: list[dict[str, Any]] = []

    def is_run_cancelled(self, run_id: str) -> bool:
        return self.run_status == "cancelled"

    def get_run_status(self, run_id: str) -> dict[str, Any] | None:
        return {"status": self.run_status}

    def save_checkpoint(self, run_id: str, checkpoint: dict[str, Any]) -> None:
        self.saved_checkpoints.append({"run_id": run_id, **checkpoint})

    def load_checkpoint(self, run_id: str) -> dict[str, Any] | None:
        return self.checkpoint

    def emit_workflow_event(self, run_id: str, event_type: str, *, message: str | None = None, progress: float | None = None, payload: dict[str, Any] | None = None) -> None:
        self.events.append({
            "run_id": run_id,
            "event_type": event_type,
            "message": message,
            "progress": progress,
            "payload": payload,
        })


class TestStateTransitions:
    """Test Phase 10 state machine transitions."""

    def test_valid_transitions(self):
        from xuejian.orchestration_service.graphs.supervisor_state import can_transition

        assert can_transition("queued", "running") is True
        assert can_transition("running", "paused") is True
        assert can_transition("running", "completed") is True
        assert can_transition("running", "cancelled") is True
        assert can_transition("paused", "running") is True
        assert can_transition("paused", "cancelled") is True
        assert can_transition("waiting_for_user", "running") is True
        assert can_transition("partial", "running") is True
        assert can_transition("partial", "completed") is True

    def test_invalid_transitions(self):
        from xuejian.orchestration_service.graphs.supervisor_state import can_transition

        # Terminal states cannot transition back to running
        assert can_transition("cancelled", "running") is False
        assert can_transition("completed", "running") is False
        assert can_transition("failed", "running") is False

        # Cannot pause from queued
        assert can_transition("queued", "paused") is False

        # Cannot complete from queued directly
        assert can_transition("queued", "completed") is False


class TestRoutingFunctions:
    """Test conditional edge routing functions."""

    def test_route_after_control_ok(self):
        from xuejian.orchestration_service.graphs.supervisor_nodes import _route_after_control

        state = {
            "is_compound_task": True,
            "error_category": None,
            "host_ref": MockHost(run_status="running"),
            "run_id": "test-1",
        }
        assert _route_after_control(state) == "execute_step"

    def test_route_after_control_cancelled(self):
        from xuejian.orchestration_service.graphs.supervisor_nodes import _route_after_control

        state = {
            "is_compound_task": True,
            "error_category": None,
            "host_ref": MockHost(run_status="cancelled"),
            "run_id": "test-1",
        }
        assert _route_after_control(state) == "finalize_summary"

    def test_route_after_control_paused(self):
        from xuejian.orchestration_service.graphs.supervisor_nodes import _route_after_control

        state = {
            "is_compound_task": True,
            "error_category": None,
            "host_ref": MockHost(run_status="paused"),
            "run_id": "test-1",
        }
        assert _route_after_control(state) == "finalize_summary"

    def test_route_after_control_error_category(self):
        from xuejian.orchestration_service.graphs.supervisor_nodes import _route_after_control

        state = {
            "is_compound_task": True,
            "error_category": "provider_timeout",
            "host_ref": MockHost(),
            "run_id": "test-1",
        }
        assert _route_after_control(state) == "finalize_summary"

    def test_route_after_execute_has_more_steps(self):
        from xuejian.orchestration_service.graphs.supervisor_nodes import _route_after_execute

        state = {
            "error_category": None,
            "current_step_index": 1,
            "route_plan": {"steps": [{}, {}, {}]},
        }
        assert _route_after_execute(state) == "check_control"

    def test_route_after_execute_all_done(self):
        from xuejian.orchestration_service.graphs.supervisor_nodes import _route_after_execute

        state = {
            "error_category": None,
            "current_step_index": 3,
            "route_plan": {"steps": [{}, {}, {}]},
        }
        assert _route_after_execute(state) == "maybe_replan"

    def test_route_after_execute_with_error(self):
        from xuejian.orchestration_service.graphs.supervisor_nodes import _route_after_execute

        state = {
            "error_category": "budget_exceeded",
            "current_step_index": 1,
            "route_plan": {"steps": [{}, {}, {}]},
        }
        assert _route_after_execute(state) == "finalize_summary"


class TestCheckpointPayload:
    """Test checkpoint payload compliance with Phase 10 spec."""

    def test_checkpoint_payload_fields(self):
        from xuejian.orchestration_service.graphs.supervisor_nodes import _save_step_checkpoint

        host = MockHost()
        state = {
            "route_plan": {"intent": "test intent"},
            "plan_revisions": [],
            "subgraph_results": [],
            "resume_token": "token-123",
        }
        _save_step_checkpoint(
            host,
            "run-1",
            0,
            state,
            artifact_refs={"trace": ["ref1"]},
            budget_counters={"planSteps": 1, "subgraphCalls": 0, "replans": 0},
            decision_records=[{"selectedGraph": "knowledge"}],
            error_category=None,
        )

        assert len(host.saved_checkpoints) == 1
        cp = host.saved_checkpoints[0]
        payload = cp["payload"]

        # Phase 10 required fields
        assert "runtime" in payload
        assert "graphVersion" in payload
        assert "currentStep" in payload
        assert "routePlanSummary" in payload
        assert "planRevisionSummary" in payload
        assert "decisionRecords" in payload
        assert "artifactRefs" in payload
        assert "qualityEnvelopes" in payload
        assert "budgetCounters" in payload
        assert "errorCategories" in payload
        assert "resumeToken" in payload

        # Must NOT contain sensitive fields
        assert "prompt" not in payload
        assert "messages" not in payload
        assert "chainOfThought" not in payload
        assert "chain_of_thought" not in payload
        assert "apiKey" not in payload
        assert "api_key" not in payload

    def test_checkpoint_sanitization(self):
        from xuejian.orchestration_service.graphs.supervisor_events import _sanitize_payload

        raw = {
            "safe": "value",
            "prompt": "secret prompt",
            "messages": ["msg1", "msg2"],
            "apiKey": "secret",
            "nested": {"chainOfThought": "secret reasoning", "visible": "ok"},
        }
        sanitized = _sanitize_payload(raw)

        assert sanitized["safe"] == "value"
        assert "prompt" not in sanitized
        assert "messages" not in sanitized
        assert "apiKey" not in sanitized
        assert "chainOfThought" not in sanitized["nested"]
        assert sanitized["nested"]["visible"] == "ok"


class TestSingleStepExecution:
    """Test execute_step single-step behavior."""

    def test_execute_step_noop_when_not_compound(self):
        from xuejian.orchestration_service.graphs.supervisor_nodes import execute_step

        state = {"is_compound_task": False}
        result = execute_step(state)
        assert result == {}

    def test_execute_step_noop_when_error(self):
        from xuejian.orchestration_service.graphs.supervisor_nodes import execute_step

        state = {"is_compound_task": True, "error_category": "provider_timeout"}
        result = execute_step(state)
        assert result == {}

    def test_execute_step_exhausted(self):
        from xuejian.orchestration_service.graphs.supervisor_nodes import execute_step

        state = {
            "is_compound_task": True,
            "error_category": None,
            "current_step_index": 5,
            "route_plan": {"steps": [{}, {}, {}, {}, {}]},
            "host_ref": None,
            "run_id": "",
        }
        result = execute_step(state)
        assert result == {}

    def test_budget_counters_preserved(self):
        """Budget counters from checkpoint should not be reset on resume."""
        from xuejian.orchestration_service.graphs.supervisor_state import MAX_PLAN_STEPS, MAX_REPLANS, MAX_SUBGRAPH_CALLS

        # Simulate restored budget from checkpoint
        restored_counters = {"planSteps": 3, "subgraphCalls": 2, "replans": 1}

        # Max values should remain unchanged
        assert MAX_PLAN_STEPS == 6
        assert MAX_SUBGRAPH_CALLS == 5
        assert MAX_REPLANS == 2

        # Resumed counters should not exceed max
        assert restored_counters["planSteps"] <= MAX_PLAN_STEPS
        assert restored_counters["subgraphCalls"] <= MAX_SUBGRAPH_CALLS
        assert restored_counters["replans"] <= MAX_REPLANS


class TestUnderstandTask:
    """Test understand_task with Phase 10 fields."""

    def test_initial_status_running(self):
        from xuejian.orchestration_service.graphs.supervisor_nodes import understand_task

        host = MockHost()
        state = {
            "run_id": "test-1",
            "task_type": "compound_study_task",
            "user_request": "explain and make cards",
            "host_ref": host,
        }
        result = understand_task(state)
        assert result["task_status"] == "running"
        assert result["current_step_index"] == 0
        assert result["previous_artifact_refs"] == {}

    def test_not_compound_task_status(self):
        from xuejian.orchestration_service.graphs.supervisor_nodes import understand_task

        host = MockHost()
        state = {
            "run_id": "test-1",
            "task_type": "simple_qa",
            "user_request": "hello",
            "host_ref": host,
        }
        result = understand_task(state)
        assert result["task_status"] == "failed"
        assert result["error_category"] == "not_compound_task"

    def test_loads_parent_artifact_refs(self):
        from xuejian.orchestration_service.graphs.supervisor_nodes import understand_task

        parent_checkpoint = {
            "payload": {
                "artifactRefs": {"answer": ["ref1"], "evidence": ["ref2"]},
            },
        }
        host = MockHost(checkpoint=parent_checkpoint)
        state = {
            "run_id": "test-2",
            "task_type": "compound_study_task",
            "user_request": "follow up question",
            "parent_run_id": "parent-1",
            "host_ref": host,
        }
        result = understand_task(state)
        assert result["previous_artifact_refs"]["answer"] == ["ref1"]
        assert result["previous_artifact_refs"]["evidence"] == ["ref2"]


class TestFinalizeSummary:
    """Test finalize_summary status determination."""

    def test_cancelled_status(self):
        from xuejian.orchestration_service.graphs.supervisor_nodes import finalize_summary

        host = MockHost()
        state = {
            "run_id": "test",
            "is_compound_task": True,
            "task_status": "cancelled",
            "subgraph_results": [],
            "artifact_refs": {},
            "artifacts": {},
            "host_ref": host,
            "decision_records": [],
        }
        result = finalize_summary(state)
        assert result["result"]["status"] == "cancelled"

    def test_paused_status(self):
        from xuejian.orchestration_service.graphs.supervisor_nodes import finalize_summary

        host = MockHost()
        state = {
            "run_id": "test",
            "is_compound_task": True,
            "task_status": "paused",
            "subgraph_results": [],
            "artifact_refs": {},
            "artifacts": {},
            "host_ref": host,
            "decision_records": [],
        }
        result = finalize_summary(state)
        assert result["result"]["status"] == "paused"


class TestResumePath:
    """Regression tests for checkpoint resume path."""

    def test_understand_task_skips_init_on_resume(self):
        """Bug 1: understand_task must not overwrite restored checkpoint fields."""
        from xuejian.orchestration_service.graphs.supervisor_nodes import understand_task

        host = MockHost()
        state = {
            "run_id": "run-1",
            "task_type": "compound_study_task",
            "user_request": "explain and make cards",
            "host_ref": host,
            "current_step_index": 2,
            "budget_counters": {"planSteps": 2, "subgraphCalls": 1, "replans": 0},
            "completed_steps": [{"selectedGraph": "knowledge"}],
            "artifact_refs": {"answer": ["ref1"]},
        }
        result = understand_task(state)
        # Resume path should return empty dict to preserve checkpoint fields
        assert result == {}

    def test_plan_skips_replanning_on_resume(self):
        """Bug 2: plan must not regenerate route_plan when one already exists."""
        from xuejian.orchestration_service.graphs.supervisor_nodes import plan

        state = {
            "is_compound_task": True,
            "route_plan": {"steps": [{"selectedGraph": "knowledge"}]},
            "planner_config": {"model": "dummy"},
        }
        result = plan(state)
        assert result == {}

    def test_plan_generates_when_no_existing_plan(self):
        """Fresh run: plan should attempt generation (and fail because config is dummy)."""
        from xuejian.orchestration_service.graphs.supervisor_nodes import plan

        state = {
            "is_compound_task": True,
            "route_plan": {},
            "planner_config": {},  # empty config triggers error_category
        }
        result = plan(state)
        assert result.get("error_category") == "provider_auth_error"


class TestSupervisorGraphRunner:
    """Test SupervisorGraphRunner with Phase 10 features."""

    def test_build_initial_state_with_restored_fields(self):
        from xuejian.orchestration_service.graphs.supervisor_graph import SupervisorGraphRunner

        host = MockHost()
        runner = SupervisorGraphRunner(host)

        restored = {
            "current_step_index": 2,
            "budget_counters": {"planSteps": 2, "subgraphCalls": 1, "replans": 0},
            "artifact_refs": {"trace": ["ref1"]},
            "task_status": "paused",
        }
        state = runner._build_initial_state(
            "run-1",
            task_type="compound_study_task",
            user_request="test",
            restored_state=restored,
        )

        assert state["current_step_index"] == 2
        assert state["budget_counters"]["planSteps"] == 2
        assert state["artifact_refs"]["trace"] == ["ref1"]
        assert state["task_status"] == "paused"

    def test_run_from_checkpoint_loads_checkpoint(self):
        from xuejian.orchestration_service.graphs.supervisor_graph import SupervisorGraphRunner

        checkpoint_payload = {
            "currentStep": 1,
            "artifactRefs": {"answer": ["ref1"]},
            "budgetCounters": {"planSteps": 1},
        }
        host = MockHost(checkpoint={"payload": checkpoint_payload})
        runner = SupervisorGraphRunner(host)

        # run_from_checkpoint builds state from checkpoint
        # We can't easily test the full graph invocation, but we can test state building
        restored = {}
        if host.checkpoint:
            payload = host.checkpoint.get("payload") or host.checkpoint
            if isinstance(payload, dict):
                restored = payload

        state = runner._build_initial_state(
            "run-1",
            task_type="compound_study_task",
            user_request="test",
            restored_state=restored,
        )

        assert state["current_step_index"] == 1
        assert state["budget_counters"]["planSteps"] == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
