from orchestration_service.tools import (
    TOOL_REGISTRY,
    ToolCallerNotAllowedError,
    ToolInputValidationError,
    ToolNotRegisteredError,
)


def test_registry_exposes_expected_qa_tools():
    tools = TOOL_REGISTRY.list_tools()

    assert tools[:7] == [
        "retrieve_evidence",
        "merge_parent_context",
        "rerank_evidence",
        "grade_retrieval_relevance",
        "pack_context",
        "audit_citations",
        "build_rag_trace",
    ]
    assert tools[7:] == [
        "content_map",
        "generate_card_candidates",
        "critique_card_candidates",
        "dedupe_card_candidates",
        "audit_card_source_quotes",
        "submit_card_candidates",
        "suggest_review_schedule",
        "submit_review_candidates",
    ]


def test_lookup_rejects_unregistered_tool():
    try:
        TOOL_REGISTRY.lookup("missing_tool")
    except ToolNotRegisteredError as exc:
        assert exc.error_category == "tool_not_registered"
    else:
        raise AssertionError("expected ToolNotRegisteredError")


def test_validate_input_rejects_invalid_payload():
    try:
        TOOL_REGISTRY.validate_input("retrieve_evidence", {"document_ids": ["doc-1"]})
    except ToolInputValidationError as exc:
        assert exc.error_category == "tool_input_invalid"
        assert exc.tool_key == "retrieve_evidence"
    else:
        raise AssertionError("expected ToolInputValidationError")


def test_invoke_build_rag_trace_returns_valid_payload():
    result = TOOL_REGISTRY.invoke(
        "build_rag_trace",
        {
            "readiness_status": "ready",
            "retrieval_mode": "hybrid",
            "chunks": [{"chunkId": "chunk-1", "documentId": "doc-1", "content": "alpha"}],
            "query_rewrite_used": False,
            "merge_summary": {"status": "not_run", "childChunksExpanded": 0, "parentContextsAdded": 0, "sectionContextsAdded": 0, "charsAdded": 0},
            "packing_summary": {"passageCount": 1, "totalChars": 5, "budgetChars": 8000},
            "audit_summary": {"totalCitations": 0, "validCitations": 0, "rejectedCitations": 0, "auditStatus": "clean"},
        },
        caller="langgraph_rag",
    )

    assert result["rag_trace"]["retrievalMode"] == "hybrid"
    assert result["rag_trace"]["retrievedDocumentCount"] == 1
    assert result["rag_trace"]["retrievalSummary"]["chunkCount"] == 1


def test_invoke_blocks_caller_not_in_allowed_callers():
    try:
        TOOL_REGISTRY.invoke(
            "suggest_review_schedule",
            {
                "card_ids": ["card-1"],
                "confidence_scores": {"card-1": 0.9},
            },
            caller="unauthorized_agent",
        )
    except ToolCallerNotAllowedError as exc:
        assert exc.error_category == "caller_not_allowed"
        assert exc.tool_key == "suggest_review_schedule"
        assert exc.caller == "unauthorized_agent"
    else:
        raise AssertionError("expected ToolCallerNotAllowedError")


def test_invoke_blocks_missing_caller_for_whitelisted_tool():
    try:
        TOOL_REGISTRY.invoke(
            "suggest_review_schedule",
            {
                "card_ids": ["card-1"],
                "confidence_scores": {"card-1": 0.9},
            },
        )
    except ToolCallerNotAllowedError as exc:
        assert exc.error_category == "caller_not_allowed"
        assert exc.tool_key == "suggest_review_schedule"
        assert exc.caller is None
    else:
        raise AssertionError("expected ToolCallerNotAllowedError")