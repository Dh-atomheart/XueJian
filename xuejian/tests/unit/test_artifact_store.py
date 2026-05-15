from orchestration_service.clients.host_gateway import HostGatewayClient
from orchestration_service.graphs.artifact_store import persist_graph_artifacts


def test_host_gateway_artifact_methods_use_public_routes(monkeypatch):
    client = HostGatewayClient("http://host")
    calls = []

    def fake_post(path, payload):
        calls.append(("POST", path, payload))
        return {"ok": True}

    def fake_get(path):
        calls.append(("GET", path, None))
        if path.startswith("/tool-gateway/artifacts?"):
            return {"items": [{"artifactId": "a"}]}
        return {"artifactId": "a"}

    monkeypatch.setattr(client, "_post", fake_post)
    monkeypatch.setattr(client, "_get", fake_get)

    assert client.create_artifact("run-1", {"artifactId": "a", "artifactType": "trace"}) == {"ok": True}
    assert client.create_artifacts("run-1", [{"artifactId": "b"}]) == {"ok": True}
    assert client.get_artifact("study-graph://runs/run-1/learning_advice") == {"artifactId": "a"}
    assert client.list_artifacts(run_id="run-1", artifact_type="trace", lifecycle_status="created", limit=5) == [
        {"artifactId": "a"}
    ]
    assert client.mark_artifact_lifecycle("trace://a", "consumed") == {"ok": True}

    assert calls[0] == (
        "POST",
        "/tool-gateway/artifacts",
        {"runId": "run-1", "artifactId": "a", "artifactType": "trace"},
    )
    assert calls[1] == (
        "POST",
        "/tool-gateway/artifacts",
        {"runId": "run-1", "artifacts": [{"artifactId": "b"}]},
    )
    assert calls[2] == ("GET", "/tool-gateway/artifacts/study-graph%3A%2F%2Fruns%2Frun-1%2Flearning_advice", None)
    assert calls[3] == (
        "GET",
        "/tool-gateway/artifacts?limit=5&runId=run-1&artifactType=trace&lifecycleStatus=created",
        None,
    )
    assert calls[4] == (
        "POST",
        "/tool-gateway/artifacts/trace%3A%2F%2Fa/lifecycle",
        {"lifecycleStatus": "consumed"},
    )


def test_persist_graph_artifacts_redacts_sensitive_fields():
    class Host:
        def __init__(self):
            self.payload = None

        def create_artifacts(self, run_id, artifacts):
            self.payload = {"runId": run_id, "artifacts": artifacts}
            return {"created": 1}

    host = Host()
    result = persist_graph_artifacts(
        host,
        "run-1",
        {
            "trace://a": {
                "artifactId": "trace://a",
                "artifactType": "trace",
                "schemaVersion": 1,
                "summary": "trace",
                "sourceRefs": [],
                "qualityEnvelope": {"riskLevel": "low"},
                "createdBy": "langgraph_multi_agent",
                "payload": {
                    "prompt": "hidden",
                    "messages": ["hidden"],
                    "nested": {"apiKey": "hidden", "visible": "ok"},
                },
            }
        },
    )

    assert result == (True, None)
    artifact = host.payload["artifacts"]["trace://a"]
    assert artifact["payload"] == {"nested": {"visible": "ok"}}


def test_persist_graph_artifacts_failure_is_non_fatal():
    class Host:
        def create_artifacts(self, run_id, artifacts):
            raise RuntimeError("host unavailable")

    result = persist_graph_artifacts(Host(), "run-1", {"trace://a": {"artifactId": "trace://a"}})

    assert result == (False, "artifact_write_failed")
