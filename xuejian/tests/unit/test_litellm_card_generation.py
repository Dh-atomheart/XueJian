from orchestration_service.workflows import litellm_card_generation as workflow


class FakeHost:
    def __init__(self):
        self.messages = []
        self.progress_updates = []
        self.checkpoint_updates = []
        self.cancelled = False
        self.checkpoint = None

    def get_config(self, config_id):
        return {"id": config_id, "provider": "openai", "model": "gpt-test", "authMode": "api_key"}

    def get_api_key(self, config_id):
        return "test-key"

    def list_chunks(self, document_id):
        return [
            {
                "id": "chunk-1",
                "pageStart": 1,
                "pageEnd": 1,
                "content": "系统思维强调反馈回路。",
            }
        ]

    def is_job_cancelled(self, job_id):
        return self.cancelled

    def update_background_job_progress(
        self,
        job_id,
        *,
        progress_current=None,
        progress_total=None,
        progress_message=None,
    ):
        self.progress_updates.append(
            {
                "job_id": job_id,
                "progress_current": progress_current,
                "progress_total": progress_total,
                "progress_message": progress_message,
            }
        )
        return {"ok": True}

    def get_background_job_checkpoint(self, job_id):
        return self.checkpoint

    def update_background_job_checkpoint(self, job_id, checkpoint):
        self.checkpoint_updates.append({"job_id": job_id, "checkpoint": checkpoint})
        self.checkpoint = checkpoint
        return {"ok": True}


def test_litellm_workflow_uses_chinese_prompt_and_density(monkeypatch):
    host = FakeHost()

    def fake_completion(config, api_key, messages, temperature, max_tokens, **kwargs):
        host.messages.append(messages)
        assert "Chinese knowledge review cards" in messages[0]["content"]
        assert "knowledge_point" in messages[1]["content"]
        assert "concept_explanation" in messages[1]["content"]
        assert "up to 2 compact Chinese knowledge review cards" in messages[1]["content"]
        assert "一个具体问题？" not in messages[1]["content"]
        assert "front asks one point" not in messages[0]["content"]
        assert kwargs.get("response_format") == {"type": "json_object"}
        source_quote = workflow._chunk_content(host.list_chunks("doc-1")[0])[:12]
        return f"""{{
          "cards": [{{
            "title": "间隔重复",
            "front": "间隔重复：核心机制",
            "back": "间隔重复通过拉开复习间隔来强化长期记忆。",
            "sourcePage": 1,
            "sourceQuote": "{source_quote}",
            "sourceChunkId": "chunk-1",
            "tags": ["学习方法"]
          }}]
        }}"""
        return """[
          {
            "title": "系统思维",
            "front": "系统思维强调什么？",
            "back": "系统思维强调反馈回路。",
            "sourcePage": 1,
            "sourceQuote": "系统思维强调反馈回路",
            "sourceChunkId": "chunk-1",
            "tags": ["系统思维"]
          }
        ]"""

    monkeypatch.setattr(workflow, "litellm_completion", fake_completion)

    result = workflow.run_litellm_card_generation(
        job_id="job-1",
        document_id="doc-1",
        group_id="group-1",
        page_start=None,
        page_end=None,
        density="high",
        provider_config_id="config-1",
        host=host,
    )

    assert len(result.cards) == 1
    assert host.messages
    assert host.progress_updates[-1]["progress_current"] == 1
    assert host.progress_updates[-1]["progress_total"] == 1


def test_prompt_contract_is_knowledge_point_oriented():
    chunk = {
        "id": "chunk-1",
        "pageStart": 3,
        "pageEnd": 3,
        "content": "间隔重复通过拉开复习间隔来强化长期记忆。",
    }

    prompt = workflow._build_user_prompt(chunk, 1)

    assert "knowledge_point" in prompt
    assert "concept_explanation" in prompt
    assert "json object" in prompt
    assert '"cards"' in prompt
    assert "一个具体问题？" not in prompt
    assert "compact flashcards" not in prompt
    assert "front asks one point" not in workflow.SYSTEM_PROMPT


def test_extract_json_array_accepts_json_object_and_markdown_fence():
    items = workflow._extract_json_array(
        """```json
        {"cards":[{"title":"T","front":"Front text","back":"Back text","sourcePage":1,"sourceQuote":"Quote text","sourceChunkId":"chunk-1","tags":[]}]}
        ```"""
    )

    assert len(items) == 1
    assert items[0]["sourceChunkId"] == "chunk-1"


def test_litellm_workflow_retries_once_after_invalid_json(monkeypatch):
    host = FakeHost()
    calls = []
    source_quote = workflow._chunk_content(host.list_chunks("doc-1")[0])[:12]

    def fake_completion(config, api_key, messages, temperature, max_tokens, **kwargs):
        calls.append(messages)
        if len(calls) == 1:
            return f"""{{"cards":[{{"title":"Broken","front":"A quote " inside","back":"Back text","sourcePage":1,"sourceQuote":"{source_quote}","sourceChunkId":"chunk-1","tags":[]}}]}}"""
        assert "previous response was not valid JSON" in messages[-1]["content"]
        return f"""{{"cards":[{{"title":"Fixed","front":"Front text","back":"Back text","sourcePage":1,"sourceQuote":"{source_quote}","sourceChunkId":"chunk-1","tags":[]}}]}}"""

    monkeypatch.setattr(workflow, "litellm_completion", fake_completion)

    result = workflow.run_litellm_card_generation(
        job_id="job-1",
        document_id="doc-1",
        group_id="group-1",
        page_start=None,
        page_end=None,
        density="low",
        provider_config_id="config-1",
        host=host,
    )

    assert len(result.cards) == 1
    assert result.cards[0].title == "Fixed"
    assert len(calls) == 2


def test_litellm_workflow_resumes_from_checkpoint(monkeypatch):
    host = FakeHost()
    chunks = [
        {
            "id": "chunk-1",
            "pageStart": 1,
            "pageEnd": 1,
            "content": "First chunk source quote for resume testing.",
        },
        {
            "id": "chunk-2",
            "pageStart": 2,
            "pageEnd": 2,
            "content": "Second chunk source quote for resume testing.",
        },
    ]
    host.list_chunks = lambda document_id: chunks
    host.checkpoint = {
        "nextChunkIndex": 1,
        "totalChunks": 2,
        "discardedCount": 1,
        "cards": [
            {
                "title": "Existing",
                "front": "Existing front text",
                "back": "Existing back text",
                "source": {
                    "chunkId": "chunk-1",
                    "page": 1,
                    "quote": "First chunk source quote",
                },
                "tags": [],
            }
        ],
    }
    calls = []

    def fake_completion(config, api_key, messages, temperature, max_tokens, **kwargs):
        calls.append(messages)
        assert "sourceChunkId: chunk-2" in messages[-1]["content"]
        return """{"cards":[{
          "title":"Second",
          "front":"Second front text",
          "back":"Second back text",
          "sourcePage":2,
          "sourceQuote":"Second chunk source quote",
          "sourceChunkId":"chunk-2",
          "tags":[]
        }]}"""

    monkeypatch.setattr(workflow, "litellm_completion", fake_completion)

    result = workflow.run_litellm_card_generation(
        job_id="job-1",
        document_id="doc-1",
        group_id="group-1",
        page_start=None,
        page_end=None,
        density="low",
        provider_config_id="config-1",
        host=host,
    )

    assert len(calls) == 1
    assert [card.title for card in result.cards] == ["Existing", "Second"]
    assert result.discarded_count == 1
    assert host.checkpoint_updates[-1]["checkpoint"]["nextChunkIndex"] == 2


def test_litellm_workflow_stops_when_job_is_cancelled(monkeypatch):
    host = FakeHost()
    host.cancelled = True

    def fake_completion(*args, **kwargs):
        raise AssertionError("completion should not be called after cancellation")

    monkeypatch.setattr(workflow, "litellm_completion", fake_completion)

    try:
        workflow.run_litellm_card_generation(
            job_id="job-1",
            document_id="doc-1",
            group_id="group-1",
            page_start=None,
            page_end=None,
            density="low",
            provider_config_id="config-1",
            host=host,
        )
    except workflow.JobCancelled:
        pass
    else:
        raise AssertionError("expected JobCancelled")
