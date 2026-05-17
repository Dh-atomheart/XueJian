from orchestration_service.clients.host_gateway import HostGatewayClient


def test_emit_rag_progress_posts_workflow_progress_event(monkeypatch):
    client = HostGatewayClient("http://host")
    calls = []

    def fake_post(path, payload):
        calls.append((path, payload))
        return {"stored": True}

    monkeypatch.setattr(client, "_post", fake_post)

    result = client.emit_rag_progress(
        "run-1",
        "retrieve",
        "completed",
        title="Retrieving documents",
        detail="Found chunks",
        progress=0.42,
        metrics={"chunkCount": 3},
    )

    assert result == {"stored": True}
    assert calls == [
        (
            "/tool-gateway/runs/run-1/events",
            {
                "eventType": "progress",
                "message": "Found chunks",
                "progress": 0.42,
                "payload": {
                    "stepKey": "retrieve",
                    "status": "completed",
                    "title": "Retrieving documents",
                    "detail": "Found chunks",
                    "progress": 0.42,
                    "metrics": {"chunkCount": 3},
                },
            },
        )
    ]


def test_get_study_review_summary_uses_read_only_route(monkeypatch):
    client = HostGatewayClient("http://host")
    calls = []

    def fake_get(path):
        calls.append(path)
        return {"totalCards": 0, "topicSummary": []}

    monkeypatch.setattr(client, "_get", fake_get)

    result = client.get_study_review_summary(document_id="doc-1", limit=25)

    assert result["totalCards"] == 0
    assert calls == ["/tool-gateway/study/review-summary?limit=25&documentId=doc-1"]
