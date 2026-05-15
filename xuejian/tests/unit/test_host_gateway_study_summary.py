from orchestration_service.clients.host_gateway import HostGatewayClient


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
