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


def test_ragas_eval_endpoint_uses_existing_host_gateway(monkeypatch, tmp_path):
    fake_host = object()
    monkeypatch.setattr(server, "_host_gateway", fake_host)
    captured = {}

    def fake_run_with_host(host, args):
        captured["host"] = host
        captured["args"] = args
        return tmp_path / "ragas-run"

    import orchestration_service.evals.ragas_knowledge_qa_eval as eval_module

    monkeypatch.setattr(eval_module, "run_with_host", fake_run_with_host)

    handler_cls = server.build_handler(0)
    handler = FakeHandler(
        {
            "documentIds": ["doc-1", "doc-2"],
            "size": 5,
            "out": str(tmp_path / "out"),
            "refreshDataset": True,
            "maxChunkChars": 900,
        }
    )

    handler_cls._handle_ragas_knowledge_qa_eval(handler)

    assert handler.response[0] == 200
    assert handler.response[1]["status"] == "ok"
    assert handler.response[1]["summaryPath"].endswith("summary.md")
    assert captured["host"] is fake_host
    assert captured["args"].document_ids == "doc-1,doc-2"
    assert captured["args"].size == 5
    assert captured["args"].refresh_dataset is True
    assert captured["args"].max_chunk_chars == 900


def test_ragas_eval_endpoint_defaults_to_200_plus_size(monkeypatch, tmp_path):
    fake_host = object()
    monkeypatch.setattr(server, "_host_gateway", fake_host)
    captured = {}

    def fake_run_with_host(host, args):
        captured["args"] = args
        return tmp_path / "ragas-run"

    import orchestration_service.evals.ragas_knowledge_qa_eval as eval_module

    monkeypatch.setattr(eval_module, "run_with_host", fake_run_with_host)

    handler_cls = server.build_handler(0)
    handler = FakeHandler({"documentIds": ["doc-1"]})

    handler_cls._handle_ragas_knowledge_qa_eval(handler)

    assert handler.response[0] == 200
    assert captured["args"].size >= 200


def test_ragas_eval_endpoint_requires_host_gateway(monkeypatch):
    monkeypatch.setattr(server, "_host_gateway", None)

    handler_cls = server.build_handler(0)
    handler = FakeHandler({"documentIds": ["doc-1"]})

    handler_cls._handle_ragas_knowledge_qa_eval(handler)

    assert handler.response == (503, {"status": "failed", "error": "host_gateway_unavailable"})
