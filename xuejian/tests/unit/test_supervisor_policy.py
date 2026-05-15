from orchestration_service.graphs.supervisor_policy import is_compound_learning_task, policy_check_plan, policy_check_step
from orchestration_service.graphs.supervisor_state import MAX_PLAN_STEPS, MAX_SUBGRAPH_CALLS


def test_policy_rejects_plain_qa_and_plain_card_tasks():
    assert not is_compound_learning_task("compound_study_task", "Answer this question about the document")
    assert not is_compound_learning_task("compound_study_task", "Make flashcards from this document")
    assert is_compound_learning_task("compound_study_task", "Explain this, make cards, and diagnose weak review topics")


def test_policy_rejects_forbidden_outputs_and_legacy_paths():
    policy = policy_check_step(
        {
            "selectedGraph": "knowledge",
            "expectedArtifactType": "citation",
            "usesLegacyRunner": True,
        },
        step_index=0,
        completed_artifacts={},
        budget_counters={"subgraphCalls": 0},
    )

    assert policy["status"] == "rejected"
    assert "blocked_by_policy" in policy["blockingReasons"]


def test_policy_rejects_study_schedule_write_in_phase_06():
    policy = policy_check_step(
        {"selectedGraph": "study", "expectedArtifactType": "study_schedule_write"},
        step_index=0,
        completed_artifacts={},
        budget_counters={"subgraphCalls": 0},
    )

    assert policy["status"] == "rejected"
    assert "blocked_by_policy" in policy["blockingReasons"]


def test_policy_allows_study_schedule_write_with_explicit_phase_08_switch():
    policy = policy_check_step(
        {"selectedGraph": "study", "expectedArtifactType": "study_schedule_write"},
        step_index=0,
        completed_artifacts={},
        budget_counters={"subgraphCalls": 0},
        options={"allowStudyScheduleWrite": True},
    )

    assert policy["status"] == "passed"
    assert policy["blockingReasons"] == []


def test_policy_rejects_high_risk_input_artifact():
    policy = policy_check_step(
        {
            "selectedGraph": "card",
            "expectedArtifactType": "formal_card_write",
            "inputArtifactRefs": ["artifact-1"],
        },
        step_index=0,
        completed_artifacts={
            "artifact-1": {
                "artifactType": "evidence",
                "qualityEnvelope": {"riskLevel": "high", "auditStatus": "failed"},
            }
        },
        budget_counters={"subgraphCalls": 0},
    )

    assert policy["status"] == "rejected"
    assert "quality_gate_failed" in policy["blockingReasons"]


def test_policy_rejects_budget_exceeded():
    plan_policy = policy_check_plan({"steps": [{} for _ in range(MAX_PLAN_STEPS + 1)]})
    assert plan_policy == {"status": "rejected", "blockingReasons": ["budget_exceeded"]}

    step_policy = policy_check_step(
        {"selectedGraph": "knowledge", "expectedArtifactType": "answer"},
        step_index=0,
        completed_artifacts={},
        budget_counters={"subgraphCalls": MAX_SUBGRAPH_CALLS},
    )
    assert "budget_exceeded" in step_policy["blockingReasons"]
