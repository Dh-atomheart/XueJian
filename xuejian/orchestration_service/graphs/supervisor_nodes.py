from __future__ import annotations

from typing import Any

from .artifact_store import fetch_artifact_by_ref, persist_graph_artifacts
from .card_graph import CardGraphRunner
from .knowledge_graph import KnowledgeGraphRunner
from .study_graph import StudyGraphRunner
from .supervisor_events import build_quality_envelope, build_trace_artifact, emit_event, save_checkpoint
from .supervisor_planner import SupervisorPlanner
from .supervisor_policy import can_replan, is_compound_learning_task, policy_check_plan, policy_check_step
from .supervisor_state import GRAPH_VERSION, MAX_PLAN_STEPS, MAX_REPLANS, MAX_SUBGRAPH_CALLS, RUNTIME, SupervisorState


def _host(state: SupervisorState) -> Any:
    return state["host_ref"]


def _run_id(state: SupervisorState) -> str:
    return str(state.get("run_id") or "")


def _init_artifact_refs() -> dict[str, Any]:
    return {
        "evidence": [],
        "answer": [],
        "card_candidate": [],
        "formal_card_write": [],
        "learning_advice": [],
        "study_schedule_write": [],
        "trace": [],
    }


def _artifact_type(artifact: dict[str, Any]) -> str:
    return str(artifact.get("artifactType") or "")


def _merge_artifacts(state: SupervisorState, result: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    artifact_refs = dict(state.get("artifact_refs") or _init_artifact_refs())
    artifacts = dict(state.get("artifacts") or {})
    host = state.get("host_ref")
    for ref, artifact in (result.get("artifacts") or {}).items():
        if not isinstance(ref, str) or not isinstance(artifact, dict):
            continue
        artifacts[ref] = artifact
        kind = _artifact_type(artifact)
        if kind == "answer":
            artifact_refs.setdefault("answer", []).append(ref)
        elif kind == "evidence":
            artifact_refs.setdefault("evidence", []).append(ref)
        elif kind == "card_candidate":
            artifact_refs.setdefault("card_candidate", []).append(ref)
        elif kind == "formal_card_write":
            artifact_refs.setdefault("formal_card_write", []).append(ref)
        elif kind == "learning_advice":
            artifact_refs.setdefault("learning_advice", []).append(ref)
        elif kind == "study_schedule_write":
            artifact_refs.setdefault("study_schedule_write", []).append(ref)

    if isinstance(result.get("artifactRefs"), dict):
        refs = result["artifactRefs"]
        evidence = refs.get("evidence") or []
        if isinstance(evidence, list):
            for ref in evidence:
                if isinstance(ref, str):
                    artifact_refs.setdefault("evidence", []).append(ref)
                    if ref not in artifacts:
                        fetched = fetch_artifact_by_ref(host, ref)
                        if fetched:
                            artifacts[ref] = fetched.get("payload") if isinstance(fetched.get("payload"), dict) else fetched
        answer = refs.get("answer")
        if isinstance(answer, str):
            artifact_refs.setdefault("answer", []).append(answer)
            if answer not in artifacts:
                fetched = fetch_artifact_by_ref(host, answer)
                if fetched:
                    artifacts[answer] = fetched.get("payload") if isinstance(fetched.get("payload"), dict) else fetched

    if isinstance(result.get("cardArtifactRefs"), list):
        for ref in result["cardArtifactRefs"]:
            if isinstance(ref, str) and ref not in artifacts:
                artifact_refs.setdefault("card_candidate", []).append(ref)
                fetched = fetch_artifact_by_ref(host, ref)
                if fetched:
                    artifacts[ref] = fetched.get("payload") if isinstance(fetched.get("payload"), dict) else fetched
    if isinstance(result.get("learningAdviceArtifactRef"), str):
        artifact_refs.setdefault("learning_advice", []).append(result["learningAdviceArtifactRef"])
        ref = result["learningAdviceArtifactRef"]
        if ref not in artifacts:
            fetched = fetch_artifact_by_ref(host, ref)
            if fetched:
                artifacts[ref] = fetched.get("payload") if isinstance(fetched.get("payload"), dict) else fetched
    if isinstance(result.get("studyScheduleWriteArtifactRef"), str):
        artifact_refs.setdefault("study_schedule_write", []).append(result["studyScheduleWriteArtifactRef"])
        ref = result["studyScheduleWriteArtifactRef"]
        if ref not in artifacts:
            fetched = fetch_artifact_by_ref(host, ref)
            if fetched:
                artifacts[ref] = fetched.get("payload") if isinstance(fetched.get("payload"), dict) else fetched

    for key, value in list(artifact_refs.items()):
        if isinstance(value, list):
            artifact_refs[key] = list(dict.fromkeys(value))
    return artifact_refs, artifacts


def understand_task(state: SupervisorState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    is_compound = is_compound_learning_task(str(state.get("task_type") or ""), str(state.get("user_request") or ""))
    emit_event(
        host,
        run_id,
        "running",
        "Supervisor understood task",
        progress=0.1,
        payload={"runtime": RUNTIME, "graphVersion": GRAPH_VERSION, "isCompoundTask": is_compound},
    )
    return {
        "is_compound_task": is_compound,
        "artifact_refs": _init_artifact_refs(),
        "artifacts": {},
        "decision_records": [],
        "plan_revisions": [],
        "completed_steps": [],
        "subgraph_results": [],
        "budget_counters": {"planSteps": 0, "subgraphCalls": 0, "replans": 0},
        "error_category": None if is_compound else "not_compound_task",
    }


def plan(state: SupervisorState) -> dict[str, Any]:
    if not state.get("is_compound_task"):
        return {}
    if not state.get("planner_config"):
        return {"error_category": "provider_auth_error", "route_plan": {"steps": []}}
    try:
        planner = SupervisorPlanner(state.get("planner_config") or {}, str(state.get("planner_api_key") or ""))
        route_plan = planner.plan(
            user_request=str(state.get("user_request") or ""),
            document_ids=state.get("document_ids") or [],
            card_group_ids=state.get("card_group_ids") or [],
            options=state.get("options") or {},
            previous_records=state.get("decision_records") or [],
        )
    except TimeoutError:
        return {"error_category": "provider_timeout", "route_plan": {"steps": []}}
    except ValueError:
        return {"error_category": "schema_validation_failed", "route_plan": {"steps": []}}
    except Exception as exc:
        message = str(exc).casefold()
        if "timeout" in message or "timed out" in message:
            return {"error_category": "provider_timeout", "route_plan": {"steps": []}}
        if "json" in message or "validation" in message or "field required" in message or "extra inputs" in message:
            return {"error_category": "schema_validation_failed", "route_plan": {"steps": []}}
        return {"error_category": "provider_auth_error", "route_plan": {"steps": []}}
    return {"route_plan": route_plan}


def self_evaluate(state: SupervisorState) -> dict[str, Any]:
    route_plan = state.get("route_plan") or {}
    self_eval = route_plan.get("selfEval") if isinstance(route_plan, dict) else None
    if not isinstance(self_eval, dict):
        self_eval = {
            "necessity": "required",
            "riskLevel": "medium",
            "confidence": 0.5,
            "expectedBenefit": "orchestrate compound learning task",
            "reasonSummary": "planner omitted self evaluation",
        }
    return {"self_eval": self_eval}


def policy_check(state: SupervisorState) -> dict[str, Any]:
    if not state.get("is_compound_task") or state.get("error_category"):
        return {}
    plan_check = policy_check_plan(state.get("route_plan") or {})
    if plan_check["status"] == "passed":
        return {}
    records = list(state.get("decision_records") or [])
    records.append(
        {
            "intent": str((state.get("route_plan") or {}).get("intent") or state.get("user_request") or "")[:160],
            "selectedGraph": "summary",
            "inputArtifactRefs": [],
            "expectedArtifactType": "trace",
            "selfEval": state.get("self_eval") or {},
            "policyCheck": plan_check,
            "stopCondition": "plan_policy_rejected",
            "reasonSummary": "route plan rejected by policy",
        }
    )
    counters = dict(state.get("budget_counters") or {})
    counters["replans"] = int(counters.get("replans") or 0) + 1
    error = "budget_exceeded" if "budget_exceeded" in plan_check["blockingReasons"] or not can_replan(counters) else "blocked_by_policy"
    return {"decision_records": records, "budget_counters": counters, "error_category": error}


def _step_query(state: SupervisorState, step: dict[str, Any]) -> str:
    return str(step.get("question") or step.get("query") or state.get("user_request") or "")


def _execute_subgraph(state: SupervisorState, step: dict[str, Any]) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    selected_graph = str(step.get("selectedGraph") or "")
    document_ids = state.get("document_ids") or []
    options = state.get("options") or {}
    provider_config_id = str(options.get("providerConfigId") or state.get("provider_config_id") or "")

    if selected_graph == "knowledge":
        return KnowledgeGraphRunner(host).run(
            f"{run_id}-knowledge",
            _step_query(state, step),
            document_ids,
        )
    if selected_graph == "card":
        write_mode = "formal_card" if options.get("allowFormalCardWrite") else "candidate"
        evidence_refs = state.get("artifact_refs", {}).get("evidence") or []
        evidence_artifacts = [
            artifact
            for ref, artifact in (state.get("artifacts") or {}).items()
            if ref in evidence_refs and isinstance(artifact, dict)
        ]
        return CardGraphRunner(host).run(
            f"{run_id}-card",
            document_ids=document_ids,
            evidence_artifact_refs=evidence_refs,
            evidence_artifacts=evidence_artifacts,
            card_count_hint=int(step.get("cardCountHint") or options.get("cardCountHint") or 3),
            difficulty=str(step.get("difficulty") or "medium"),
            write_mode=write_mode,
            provider_config_id=provider_config_id,
        )
    if selected_graph == "study":
        return StudyGraphRunner(host).run(
            f"{run_id}-study",
            document_ids=document_ids,
            card_group_ids=state.get("card_group_ids") or [],
            enable_schedule_write=bool(options.get("allowStudyScheduleWrite")),
            dry_run=bool(options.get("studyScheduleDryRun", True)),
            write_target=str(options.get("studyScheduleWriteTarget") or "review_candidates"),
            idempotency_key=options.get("studyScheduleIdempotencyKey"),
            dry_run_ref=options.get("studyScheduleDryRunRef"),
            rollback_ref=options.get("studyScheduleRollbackRef"),
            max_review_candidates=int(options.get("maxReviewCandidates") or 10),
        )
    return {
        "status": "failed",
        "runtime": RUNTIME,
        "graphVersion": GRAPH_VERSION,
        "qualityEnvelope": {
            "groundingStatus": "not_applicable",
            "auditStatus": "not_applicable",
            "confidence": 0.0,
            "riskLevel": "high",
            "reviewRequired": True,
            "blockingReasons": ["blocked_by_policy"],
        },
        "errorCategory": "blocked_by_policy",
        "artifacts": {},
    }


def execute_step(state: SupervisorState) -> dict[str, Any]:
    if not state.get("is_compound_task") or state.get("error_category"):
        return {}

    steps = (state.get("route_plan") or {}).get("steps") or []
    decision_records = list(state.get("decision_records") or [])
    completed_steps = list(state.get("completed_steps") or [])
    subgraph_results = list(state.get("subgraph_results") or [])
    counters = dict(state.get("budget_counters") or {})
    artifact_refs = dict(state.get("artifact_refs") or _init_artifact_refs())
    artifacts = dict(state.get("artifacts") or {})
    error_category = None

    for index, step in enumerate(steps[:MAX_PLAN_STEPS]):
        counters["planSteps"] = int(counters.get("planSteps") or 0) + 1
        policy = policy_check_step(
            step,
            step_index=index,
            completed_artifacts=artifacts,
            budget_counters=counters,
            options=state.get("options") or {},
        )
        record = {
            "intent": str((state.get("route_plan") or {}).get("intent") or state.get("user_request") or "")[:160],
            "selectedGraph": str(step.get("selectedGraph") or ""),
            "inputArtifactRefs": [ref for ref in step.get("inputArtifactRefs") or [] if isinstance(ref, str)],
            "expectedArtifactType": str(step.get("expectedArtifactType") or ""),
            "selfEval": state.get("self_eval") or {},
            "policyCheck": policy,
            "stopCondition": "execute" if policy["status"] == "passed" else "policy_rejected",
            "reasonSummary": str(step.get("reasonSummary") or "")[:240],
        }
        decision_records.append(record)
        if policy["status"] != "passed":
            counters["replans"] = int(counters.get("replans") or 0) + 1
            error_category = "budget_exceeded" if not can_replan(counters) else "blocked_by_policy"
            break

        counters["subgraphCalls"] = int(counters.get("subgraphCalls") or 0) + 1
        result = _execute_subgraph(
            {
                **state,
                "artifact_refs": artifact_refs,
                "artifacts": artifacts,
                "budget_counters": counters,
            },
            step,
        )
        subgraph_results.append(result)
        artifact_refs, artifacts = _merge_artifacts(
            {
                **state,
                "artifact_refs": artifact_refs,
                "artifacts": artifacts,
            },
            result,
        )
        completed_steps.append(
            {
                "selectedGraph": step.get("selectedGraph"),
                "status": result.get("status"),
                "errorCategory": result.get("errorCategory"),
                "qualityEnvelope": result.get("qualityEnvelope"),
            }
        )

    if len(steps) > MAX_PLAN_STEPS:
        error_category = "budget_exceeded"

    return {
        "decision_records": decision_records,
        "completed_steps": completed_steps,
        "subgraph_results": subgraph_results,
        "budget_counters": counters,
        "artifact_refs": artifact_refs,
        "artifacts": artifacts,
        "error_category": error_category,
    }


def observe(state: SupervisorState) -> dict[str, Any]:
    if not state.get("is_compound_task"):
        return {}
    emit_event(
        _host(state),
        _run_id(state),
        "running",
        "Supervisor observed subgraph results",
        progress=0.82,
        payload={
            "runtime": RUNTIME,
            "graphVersion": GRAPH_VERSION,
            "subgraphCalls": int((state.get("budget_counters") or {}).get("subgraphCalls") or 0),
            "errorCategory": state.get("error_category"),
        },
    )
    return {}


def maybe_replan(state: SupervisorState) -> dict[str, Any]:
    # Phase 06 records policy rejection and budget usage, but does not run a second model call after executing steps.
    return {"plan_revisions": state.get("plan_revisions") or []}


def finalize_summary(state: SupervisorState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    subgraph_results = state.get("subgraph_results") or []
    error_category = state.get("error_category")
    if not state.get("is_compound_task"):
        error_category = "not_compound_task"

    status = "completed"
    if error_category and subgraph_results:
        status = "partial"
    elif error_category:
        status = "failed"
    elif any(result.get("status") in {"failed", "partial"} for result in subgraph_results):
        status = "partial"

    quality_envelope = build_quality_envelope(
        error_category=error_category,
        subgraph_results=subgraph_results,
        policy_blocked=error_category in {"blocked_by_policy", "budget_exceeded", "not_compound_task"},
    )
    artifact_refs = dict(state.get("artifact_refs") or _init_artifact_refs())
    artifacts = dict(state.get("artifacts") or {})
    trace_artifact = build_trace_artifact(
        run_id,
        state.get("decision_records") or [],
        quality_envelope,
        error_category=error_category,
    )
    artifacts.update(trace_artifact)
    persist_graph_artifacts(host, run_id, trace_artifact)
    trace_ref = next(iter(trace_artifact.keys()))
    artifact_refs.setdefault("trace", []).append(trace_ref)
    artifact_refs["trace"] = list(dict.fromkeys(artifact_refs["trace"]))

    completed = len([result for result in subgraph_results if result.get("status") == "completed"])
    summary = f"Orchestrated {len(subgraph_results)} subgraph calls; {completed} completed."
    if error_category == "not_compound_task":
        summary = "Request is not a compound learning task; use the dedicated QA or card workflow."
    elif error_category:
        summary = f"Orchestration ended with {error_category}; completed artifacts were preserved."

    result = {
        "runtime": RUNTIME,
        "graphVersion": GRAPH_VERSION,
        "fallbackUsed": False,
        "status": status,
        "summary": summary,
        "artifactRefs": artifact_refs,
        "qualityEnvelope": quality_envelope,
        "errorCategory": error_category,
        "decisionRecords": state.get("decision_records") or [],
        "budgetCounters": {
            "maxPlanSteps": MAX_PLAN_STEPS,
            "maxSubgraphCalls": MAX_SUBGRAPH_CALLS,
            "maxReplans": MAX_REPLANS,
            **(state.get("budget_counters") or {}),
        },
        "artifacts": artifacts,
    }
    save_checkpoint(host, run_id, "final_summary", result)
    emit_event(
        host,
        run_id,
        "completed",
        "Supervisor completed",
        progress=1.0,
        payload={
            "runtime": RUNTIME,
            "graphVersion": GRAPH_VERSION,
            "status": status,
            "errorCategory": error_category,
            "artifactTypes": list(artifact_refs.keys()),
        },
    )
    return {"quality_envelope": quality_envelope, "artifact_refs": artifact_refs, "artifacts": artifacts, "result": result}
