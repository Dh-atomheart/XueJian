from orchestration_service.schemas.ai_card_generation import AiCardGenerationResult


def test_parse_llm_json_accepts_grounded_card():
    chunk = {
        "id": "chunk-1",
        "content": "系统思维强调反馈回路，并关注系统内部要素之间的关系。",
    }
    result = AiCardGenerationResult.parse_llm_json(
        [
            {
                "title": "系统思维",
                "front": "系统思维强调什么？",
                "back": "系统思维强调反馈回路。",
                "sourcePage": 1,
                "sourceQuote": "系统思维强调反馈回路",
                "sourceChunkId": "chunk-1",
                "tags": ["系统思维"],
            }
        ],
        {"chunk-1": chunk},
    )

    assert len(result.cards) == 1
    assert result.discarded_count == 0
    assert result.cards[0].source.chunk_id == "chunk-1"


def test_parse_llm_json_discards_missing_required_fields():
    result = AiCardGenerationResult.parse_llm_json(
        [{"title": "No source", "front": "front", "back": "back"}],
        {},
    )

    assert result.cards == []
    assert result.discarded_count == 1


def test_parse_llm_json_discards_quote_not_in_chunk():
    result = AiCardGenerationResult.parse_llm_json(
        [
            {
                "title": "系统思维",
                "front": "系统思维强调什么？",
                "back": "系统思维强调反馈回路。",
                "sourcePage": 1,
                "sourceQuote": "文档外的内容",
                "sourceChunkId": "chunk-1",
                "tags": [],
            }
        ],
        {"chunk-1": {"id": "chunk-1", "content": "系统思维强调反馈回路。"}},
    )

    assert result.cards == []
    assert result.discarded_count == 1


def test_parse_llm_json_normalizes_whitespace_and_case_for_quote_check():
    result = AiCardGenerationResult.parse_llm_json(
        [
            {
                "title": "Feedback",
                "front": "What matters?",
                "back": "Feedback loops.",
                "sourcePage": 1,
                "sourceQuote": "feedback loops",
                "sourceChunkId": "chunk-1",
                "tags": [],
            }
        ],
        {"chunk-1": {"id": "chunk-1", "content": "Feedback\n\nloops are important."}},
    )

    assert len(result.cards) == 1
    assert result.discarded_count == 0


def test_parse_llm_json_infers_single_chunk_source_id_and_page():
    result = AiCardGenerationResult.parse_llm_json(
        [
            {
                "title": "Feedback",
                "front": "What matters?",
                "back": "Feedback loops.",
                "sourceQuote": "Feedback loops",
                "tags": [],
            }
        ],
        {"chunk-1": {"id": "chunk-1", "pageStart": 7, "content": "Feedback loops are important."}},
    )

    assert len(result.cards) == 1
    assert result.discarded_count == 0
    assert result.cards[0].source.chunk_id == "chunk-1"
    assert result.cards[0].source.page == 7
