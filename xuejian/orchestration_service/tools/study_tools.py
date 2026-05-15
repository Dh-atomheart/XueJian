from __future__ import annotations

from .qa_tools import TOOL_REGISTRY
from .registry import ToolDefinition
from .schemas import (
    SubmitReviewCandidatesInput,
    SubmitReviewCandidatesOutput,
    SuggestReviewScheduleInput,
    SuggestReviewScheduleOutput,
)


def suggest_review_schedule(tool_input: SuggestReviewScheduleInput) -> SuggestReviewScheduleOutput:
    suggestions: list[dict[str, object]] = []
    for card_id in tool_input.card_ids:
        confidence = float(tool_input.confidence_scores.get(card_id, 0.7))
        if confidence >= 0.8:
            interval_days = 7
            reason = "high_confidence_grounded_candidate"
        elif confidence >= 0.5:
            interval_days = 3
            reason = "medium_confidence_candidate"
        else:
            interval_days = 1
            reason = "low_confidence_needs_fast_followup"
        suggestions.append(
            {
                "cardId": card_id,
                "suggestedIntervalDays": interval_days,
                "reason": reason,
            }
        )
    return SuggestReviewScheduleOutput(suggestions=suggestions)


def submit_review_candidates(tool_input: SubmitReviewCandidatesInput) -> SubmitReviewCandidatesOutput:
    response = tool_input.host_ref.submit_review_candidates(
        tool_input.run_id,
        tool_input.candidates,
        dry_run=tool_input.dry_run,
        idempotency_key=tool_input.idempotency_key,
        dry_run_ref=tool_input.dry_run_ref,
        rollback_ref=tool_input.rollback_ref,
    )
    error_category = str(response.get("error") or "").strip() or None
    return SubmitReviewCandidatesOutput(
        accepted_count=int(response.get("acceptedCount") or 0),
        rejected_count=int(response.get("rejectedCount") or 0),
        created_review_candidate_ids=[
            item for item in response.get("createdReviewCandidateIds") or [] if isinstance(item, str)
        ],
        dry_run_ref=response.get("dryRunRef") if isinstance(response.get("dryRunRef"), str) else None,
        rollback_ref=response.get("rollbackRef") if isinstance(response.get("rollbackRef"), str) else None,
        skipped_duplicates=int(response.get("skippedDuplicates") or 0),
        response=response,
        error_category=error_category,
    )


TOOL_REGISTRY.register(
    ToolDefinition(
        tool_key="suggest_review_schedule",
        description="Suggest short-term review intervals for structured review candidates.",
        input_schema=SuggestReviewScheduleInput,
        output_schema=SuggestReviewScheduleOutput,
        handler=suggest_review_schedule,
        allowed_callers=("langgraph_study",),
    )
)
TOOL_REGISTRY.register(
    ToolDefinition(
        tool_key="submit_review_candidates",
        description="Submit structured review candidates through the host gateway.",
        input_schema=SubmitReviewCandidatesInput,
        output_schema=SubmitReviewCandidatesOutput,
        handler=submit_review_candidates,
        side_effect="persistent_via_rust",
        error_categories=(
            "route_not_implemented",
            "study_schedule_write_failed",
            "host_write_failed",
            "rollback_not_supported",
        ),
        allowed_callers=("langgraph_study",),
    )
)
