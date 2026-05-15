from __future__ import annotations

from typing import Any

from .supervisor_state import MAX_PLAN_STEPS, MAX_REPLANS, MAX_SUBGRAPH_CALLS


ALLOWED_GRAPHS = {"knowledge", "card", "study"}
ALLOWED_ARTIFACTS_BY_GRAPH = {
    "knowledge": {"answer", "evidence"},
    "card": {"card_candidate", "formal_card_write"},
    "study": {"learning_advice", "study_schedule_write"},
}
FORBIDDEN_SUPERVISOR_OUTPUTS = {
    "citation",
    "card_content",
    "learning_advice_content",
    "review_schedule_state",
}


def is_compound_learning_task(task_type: str, user_request: str) -> bool:
    if task_type != "compound_study_task":
        return False
    text = user_request.lower()
    intent_hits = 0
    intent_groups = [
        ("explain", "answer", "qa", "question", "问答", "解释", "说明"),
        ("card", "cards", "flashcard", "制卡", "卡片", "补卡"),
        ("study", "diagnose", "weak", "review", "学习", "诊断", "薄弱", "复习"),
    ]
    for group in intent_groups:
        if any(token in text for token in group):
            intent_hits += 1
    return intent_hits >= 2


def _quality_gate_passed(artifact: dict[str, Any]) -> bool:
    envelope = artifact.get("qualityEnvelope") if isinstance(artifact, dict) else None
    if not isinstance(envelope, dict):
        return False
    if envelope.get("riskLevel") == "high":
        return False
    if envelope.get("auditStatus") == "failed":
        return False
    return True


def policy_check_step(
    step: dict[str, Any],
    *,
    step_index: int,
    completed_artifacts: dict[str, Any],
    budget_counters: dict[str, int],
    options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    reasons: list[str] = []
    selected_graph = str(step.get("selectedGraph") or "")
    expected_artifact_type = str(step.get("expectedArtifactType") or "")

    if step_index >= MAX_PLAN_STEPS:
        reasons.append("budget_exceeded")
    if int(budget_counters.get("subgraphCalls") or 0) >= MAX_SUBGRAPH_CALLS:
        reasons.append("budget_exceeded")
    if selected_graph not in ALLOWED_GRAPHS:
        reasons.append("blocked_by_policy")
    if expected_artifact_type in FORBIDDEN_SUPERVISOR_OUTPUTS:
        reasons.append("blocked_by_policy")
    options = options or {}
    if expected_artifact_type == "study_schedule_write" and not options.get("allowStudyScheduleWrite"):
        reasons.append("blocked_by_policy")
    if selected_graph in ALLOWED_ARTIFACTS_BY_GRAPH and expected_artifact_type not in ALLOWED_ARTIFACTS_BY_GRAPH[selected_graph]:
        reasons.append("blocked_by_policy")

    for ref in step.get("inputArtifactRefs") or []:
        artifact = completed_artifacts.get(ref)
        if artifact is None:
            reasons.append("missing_input_artifact")
            continue
        if not _quality_gate_passed(artifact):
            reasons.append("quality_gate_failed")

    if step.get("usesLegacyRunner") or step.get("directSqliteWrite"):
        reasons.append("blocked_by_policy")
    if step.get("generatesBusinessContent"):
        reasons.append("blocked_by_policy")

    reasons = list(dict.fromkeys(reasons))
    return {
        "status": "rejected" if reasons else "passed",
        "blockingReasons": reasons,
    }


def policy_check_plan(route_plan: dict[str, Any]) -> dict[str, Any]:
    steps = route_plan.get("steps") if isinstance(route_plan, dict) else None
    if not isinstance(steps, list) or not steps:
        return {"status": "rejected", "blockingReasons": ["schema_validation_failed"]}
    if len(steps) > MAX_PLAN_STEPS:
        return {"status": "rejected", "blockingReasons": ["budget_exceeded"]}
    return {"status": "passed", "blockingReasons": []}


def can_replan(budget_counters: dict[str, int]) -> bool:
    return int(budget_counters.get("replans") or 0) < MAX_REPLANS
