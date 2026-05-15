import json

from orchestration_service import server


class FakeHandler:
    def __init__(self, body):
        self.body = json.dumps(body).encode("utf-8")
        self.response = None

    def _read_body(self):
        return self.body

    def _write_json(self, status_code, payload):
        self.response = (status_code, payload)


def test_card_animation_endpoint_returns_stable_failed_payload(monkeypatch):
    monkeypatch.setattr(server, "_host_gateway", object())

    def timeout_workflow(*args, **kwargs):
        raise TimeoutError("timed out")

    import orchestration_service.workflows.card_animation as workflow

    monkeypatch.setattr(workflow, "run_card_animation_workflow", timeout_workflow)

    handler_cls = server.build_handler(0)
    handler = FakeHandler(
        {
            "runId": "run-animation-timeout",
            "cardId": "card-1",
            "front": "front",
            "back": "back",
            "tags": [],
            "animType": "flashcard_reveal",
            "mode": "video_render",
        }
    )

    handler_cls._handle_card_animation(handler)

    assert handler.response[0] == 200
    assert handler.response[1]["status"] == "failed"
    assert handler.response[1]["errorCategory"] == "provider_timeout"
    assert handler.response[1]["errorCode"] == "provider_timeout"
    assert "provider_timeout" in handler.response[1]["qualityEnvelope"]["blockingReasons"]


def test_podcast_endpoint_returns_stable_failed_payload(monkeypatch):
    monkeypatch.setattr(server, "_host_gateway", object())

    def invalid_workflow(*args, **kwargs):
        raise ValueError("Storyboard parse validation failed: Field required; Extra inputs are not permitted")

    import orchestration_service.workflows.podcast as workflow

    monkeypatch.setattr(workflow, "run_podcast_workflow", invalid_workflow)

    handler_cls = server.build_handler(0)
    handler = FakeHandler(
        {
            "runId": "run-podcast-validation",
            "episodeId": "episode-1",
            "title": "podcast",
            "documentIds": ["doc-1"],
            "prompt": "explain",
            "style": "interview",
            "language": "zh-CN",
            "durationTier": "short",
            "ttsProvider": "auto",
            "audioFormat": "mp3",
        }
    )

    handler_cls._handle_podcast(handler)

    assert handler.response[0] == 200
    assert handler.response[1]["status"] == "failed"
    assert handler.response[1]["runtime"] == "podcast_generation"
    assert handler.response[1]["errorCategory"] == "provider_validation_failed"
    assert handler.response[1]["errorCode"] == "provider_validation_failed"
    assert "provider_validation_failed" in handler.response[1]["qualityEnvelope"]["blockingReasons"]
