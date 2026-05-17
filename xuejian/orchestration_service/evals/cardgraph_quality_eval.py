"""CardGraph quality evaluation runner.

Runs the CardGraph against a FakeHost with synthetic chunks and real LLM
inference for card generation. Checks quote validity, dedupe gate, quality
gate, and evidence trust before formal writes.
"""
from __future__ import annotations

import uuid
from typing import Any

from ..graphs.card_graph import CardGraphRunner
from ..graphs.card_state import GRAPH_VERSION, RUNTIME
from ..tools import card_tools
from .eval_base import EvalResult, EvalSuite


class CardGraphFakeHost:
    """Minimal host scaffold for CardGraph eval."""

    def __init__(
        self,
        chunks: list[dict[str, Any]] | None = None,
        *,
        fail_write: bool = False,
        omit_created_ids: bool = False,
    ):
        self.chunks = chunks if chunks is not None else []
        self.persisted_candidates: list[dict[str, Any]] = []
        self.persisted_cards: list[dict[str, Any]] = []
        self.emitted_events: list[dict[str, Any]] = []
        self.saved_checkpoints: list[dict[str, Any]] = []
        self.fail_write = fail_write
        self.omit_created_ids = omit_created_ids

    def list_chunks(self, document_id: str) -> list[dict[str, Any]]:
        return list(self.chunks)

    def persist_candidates(self, run_id: str, document_id: str, candidates: list[dict[str, Any]]) -> dict[str, Any]:
        self.persisted_candidates.extend(candidates)
        return {"insertedCount": len(candidates), "duplicateCount": 0}

    def persist_cards(self, run_id: str, document_id: str, cards: list[dict[str, Any]]) -> dict[str, Any]:
        if self.fail_write:
            raise RuntimeError("host write failed")
        self.persisted_cards.extend(cards)
        return {
            "createdCount": len(cards),
            "createdCardIds": [] if self.omit_created_ids else [f"card-{i + 1}" for i, _c in enumerate(cards)],
            "skippedDuplicates": 0,
            "discardedLowQuality": 0,
        }

    def emit_workflow_event(self, run_id: str, event_type: str, message: str | None = None, progress: float | None = None, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        self.emitted_events.append({"runId": run_id, "eventType": event_type, "payload": payload})
        return {"stored": True}

    def save_checkpoint(self, run_id: str, checkpoint: dict[str, Any]) -> dict[str, Any]:
        self.saved_checkpoints.append({"runId": run_id, "checkpoint": checkpoint})
        return {"stored": True}


def _default_chunk() -> dict[str, Any]:
    return {
        "id": "chunk-1",
        "chunkId": "chunk-1",
        "documentId": "doc-1",
        "sectionId": "s-1",
        "anchorId": "a-1",
        "pageStart": 1,
        "chunkKind": "child",
        "content": "检索练习通过主动回忆强化提取路径，并帮助暴露知识盲点。",
        "score": 0.92,
    }


def _make_runner(host: CardGraphFakeHost) -> CardGraphRunner:
    return CardGraphRunner(host)


def _run_case(runner: CardGraphRunner, host: CardGraphFakeHost, **overrides: Any) -> dict[str, Any]:
    payload = {
        "document_ids": ["doc-1"],
        "source_chunk_ids": ["chunk-1"],
        "evidence_artifact_refs": ["knowledge-qa://runs/rag/evidence/chunk-1"],
        "card_count_hint": 3,
        "difficulty": "medium",
        "write_mode": "candidate",
        "provider_config_id": "config-1",
    }
    payload.update(overrides)
    run_id = f"eval-cardgraph-{uuid.uuid4().hex[:8]}"
    return runner.run(run_id, **payload)


def run_quote_invalid_case(*, monkeypatch_generation: Any | None = None) -> EvalResult:
    """Case cardgraph-q1: source quote invalid blocks formal write."""
    host = CardGraphFakeHost(chunks=[_default_chunk()])
    runner = _make_runner(host)

    if monkeypatch_generation is not None:
        monkeypatch_generation()

    result = _run_case(runner, host, write_mode="formal_card")
    error = result.get("errorCategory")
    status = result.get("status")
    created = result.get("createdCardIds") or []
    envelope = result.get("qualityEnvelope") or {}

    return EvalResult(
        case_id="cardgraph-q1",
        suite="cardgraph",
        runtime=RUNTIME,
        status=status or "unknown",
        quality_envelope=envelope,
        expected_behavior="source_quote_invalid blocks formal write, zero cards",
        actual_behavior=f"errorCategory={error}, createdCardIds={created}, status={status}",
        blocking_reasons=[] if error == "source_quote_invalid" and not created else ["expected source_quote_invalid but got something else"],
        trace_ref=f"card-graph://runs/{result.get('run_id', 'unknown')}/trace",
    )


def run_duplicate_case(*, monkeypatch_generation: Any | None = None) -> EvalResult:
    """Case cardgraph-q2: duplicate candidates block formal write."""
    host = CardGraphFakeHost(chunks=[_default_chunk()])
    runner = _make_runner(host)

    if monkeypatch_generation is not None:
        monkeypatch_generation()

    result = _run_case(runner, host, write_mode="formal_card")
    error = result.get("errorCategory")
    status = result.get("status")
    created = result.get("createdCardIds") or []

    return EvalResult(
        case_id="cardgraph-q2",
        suite="cardgraph",
        runtime=RUNTIME,
        status=status or "unknown",
        quality_envelope=result.get("qualityEnvelope") or {},
        expected_behavior="dedupe_required blocks formal write, zero cards",
        actual_behavior=f"errorCategory={error}, createdCardIds={created}, status={status}",
        blocking_reasons=[] if error == "dedupe_required" and not created else ["expected dedupe_required but got something else"],
        trace_ref=f"card-graph://runs/{result.get('run_id', 'unknown')}/trace",
    )


def run_low_quality_case(*, monkeypatch_generation: Any | None = None) -> EvalResult:
    """Case cardgraph-q3: low quality candidate rejected before write."""
    host = CardGraphFakeHost(chunks=[_default_chunk()])
    runner = _make_runner(host)

    if monkeypatch_generation is not None:
        monkeypatch_generation()

    result = _run_case(runner, host, write_mode="candidate")
    submitted = result.get("submittedCount", 0)
    candidates = result.get("candidates", [])
    discarded = result.get("discardedCandidates", [])
    total = len(candidates) + len(discarded)
    rejection_rate = len(discarded) / total if total else 0.0

    return EvalResult(
        case_id="cardgraph-q3",
        suite="cardgraph",
        runtime=RUNTIME,
        status=result.get("status") or "unknown",
        quality_envelope=result.get("qualityEnvelope") or {},
        expected_behavior="low quality candidates are dropped before write",
        actual_behavior=f"submittedCount={submitted}, candidates={len(candidates)}, discarded={len(discarded)}",
        blocking_reasons=[],
        trace_ref=f"card-graph://runs/{result.get('run_id', 'unknown')}/trace",
        metadata={"rejection_rate": round(rejection_rate, 3), "total_candidates": total},
    )


def run_evidence_not_trusted_case(*, monkeypatch_generation: Any | None = None) -> EvalResult:
    """Case cardgraph-q4: evidence not trusted blocks formal write."""
    host = CardGraphFakeHost(chunks=[_default_chunk()])
    runner = _make_runner(host)

    if monkeypatch_generation is not None:
        monkeypatch_generation()

    result = _run_case(
        runner,
        host,
        write_mode="formal_card",
        evidence_artifacts=[
            {
                "artifactType": "evidence",
                "sourceRefs": [],
                "qualityEnvelope": {"riskLevel": "high"},
            }
        ],
    )
    error = result.get("errorCategory")
    status = result.get("status")
    created = result.get("createdCardIds") or []

    return EvalResult(
        case_id="cardgraph-q4",
        suite="cardgraph",
        runtime=RUNTIME,
        status=status or "unknown",
        quality_envelope=result.get("qualityEnvelope") or {},
        expected_behavior="evidence_not_trusted blocks formal write, zero cards",
        actual_behavior=f"errorCategory={error}, createdCardIds={created}, status={status}",
        blocking_reasons=[] if error == "evidence_not_trusted" and not created else ["expected evidence_not_trusted but got something else"],
        trace_ref=f"card-graph://runs/{result.get('run_id', 'unknown')}/trace",
    )


def run_candidate_happy_path(*, monkeypatch_generation: Any | None = None) -> EvalResult:
    """Case cardgraph-q5: candidate write happy path."""
    host = CardGraphFakeHost(chunks=[_default_chunk()])
    runner = _make_runner(host)

    if monkeypatch_generation is not None:
        monkeypatch_generation()

    result = _run_case(runner, host, write_mode="candidate")
    status = result.get("status")
    submitted = result.get("submittedCount", 0)
    envelope = result.get("qualityEnvelope") or {}

    return EvalResult(
        case_id="cardgraph-q5",
        suite="cardgraph",
        runtime=RUNTIME,
        status=status or "unknown",
        quality_envelope=envelope,
        expected_behavior="completed, submittedCount>0, riskLevel=low",
        actual_behavior=f"status={status}, submittedCount={submitted}, riskLevel={envelope.get('riskLevel')}",
        blocking_reasons=[] if status == "completed" and submitted > 0 else ["expected completed happy path"],
        trace_ref=f"card-graph://runs/{result.get('run_id', 'unknown')}/trace",
    )


def run_all_cases(
    *,
    monkeypatch_generation: Any | None = None,
) -> EvalSuite:
    """Run all CardGraph quality eval cases and return the suite."""
    suite = EvalSuite(
        name="cardgraph-quality",
        runtime=RUNTIME,
        graph_version=GRAPH_VERSION,
    )
    suite.cases.append(run_quote_invalid_case(monkeypatch_generation=monkeypatch_generation))
    suite.cases.append(run_duplicate_case(monkeypatch_generation=monkeypatch_generation))
    suite.cases.append(run_low_quality_case(monkeypatch_generation=monkeypatch_generation))
    suite.cases.append(run_evidence_not_trusted_case(monkeypatch_generation=monkeypatch_generation))
    suite.cases.append(run_candidate_happy_path(monkeypatch_generation=monkeypatch_generation))

    # Aggregate metrics
    total = len(suite.cases)
    blocking = len(suite.blocking_failures())
    rejected = sum(1 for c in suite.cases if "rejected" in c.actual_behavior or "blocked" in c.actual_behavior)
    suite.summary = {
        "caseCount": total,
        "blockingFailures": blocking,
        "cardgraph_source_quote_invalid_write_count": sum(
            1 for c in suite.cases
            if c.case_id == "cardgraph-q1" and c.blocking_reasons
        ),
        "cardgraph_duplicate_formal_write_count": sum(
            1 for c in suite.cases
            if c.case_id == "cardgraph-q2" and c.blocking_reasons
        ),
        "rejection_rate": round(
            sum(c.metadata.get("rejection_rate", 0.0) for c in suite.cases) / total, 3
        ) if total else 0.0,
    }
    return suite
