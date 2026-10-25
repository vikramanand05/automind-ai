import io

from PIL import Image


def test_knowledge_vertical_slice(client):
    response = client.post(
        "/api/v1/knowledge/documents",
        files={
            "file": (
                "manual.md",
                b"Conveyor inspections occur every 14 days in this fictional factory.",
                "text/markdown",
            )
        },
    )
    assert response.status_code == 201, response.text
    identifier = response.json()["id"]
    assert len(client.get("/api/v1/knowledge/documents").json()) == 1
    answer = client.post("/api/v1/knowledge/query", json={"question": "conveyor inspection interval"})
    assert answer.status_code == 200, answer.text
    assert answer.json()["sources"][0]["document_id"] == identifier
    assert "14 days" in answer.json()["answer"]
    assert client.delete(f"/api/v1/knowledge/documents/{identifier}").status_code == 204


def test_invalid_upload_and_schema(client):
    assert client.post("/api/v1/knowledge/documents", files={"file": ("bad.exe", b"bad")}).status_code == 422
    assert client.post("/api/v1/knowledge/query", json={"question": "x", "top_k": 99}).status_code == 422
    assert client.post("/api/v1/production/synthetic", json={"days": -1}).status_code == 422


def test_production_vertical_slice(client):
    uploaded = client.post("/api/v1/production/synthetic", json={"days": 90, "components": 1, "seed": 42})
    assert uploaded.status_code == 201, uploaded.text
    dataset = uploaded.json()
    result = client.post(
        "/api/v1/production/forecast",
        json={"version_id": dataset["id"], "component": "CMP-001", "horizon": 14},
    )
    assert result.status_code == 200, result.text
    assert len(result.json()["forecast"]) == 14
    assert result.json()["synthetic"] is True
    simulated = client.post(
        "/api/v1/production/simulate", json={"version_id": dataset["id"], "component": "CMP-001"}
    )
    assert simulated.status_code == 200 and simulated.json()["simulation"]
    experiments = client.get("/api/v1/experiments").json()
    assert len(experiments) == 1 and experiments[0]["metrics"]["mae"] >= 0
    assert client.get("/api/v1/pipelines").json()[0]["report"]["valid"]


def test_vision_honest_untrained_state(client):
    assert client.get("/api/v1/vision/models").json()["status"] == "model_not_trained"
    stream = io.BytesIO()
    Image.new("RGB", (32, 32), "gray").save(stream, format="PNG")
    result = client.post(
        "/api/v1/vision/predict", files={"file": ("surface.png", stream.getvalue(), "image/png")}
    )
    assert result.status_code == 409 and "Model not trained" in result.json()["error"]["message"]


def test_training_disabled_and_health(client):
    result = client.post("/api/v1/training/jobs", json={"kind": "lora", "config_name": "lora-cpu"})
    assert result.status_code == 409
    assert client.get("/health/live").status_code == 200
    assert client.get("/health/ready").status_code == 503
    assert "automind_requests_total" in client.get("/metrics").text


def test_errors_and_api_key(client, monkeypatch):
    from automind.main import settings

    monkeypatch.setattr(settings, "api_key", "test-key")
    assert client.get("/api/v1/system/status").status_code == 401
    assert client.get("/api/v1/system/status", headers={"X-API-Key": "test-key"}).status_code == 200


def test_rate_limit(client, monkeypatch):
    from automind.main import settings

    monkeypatch.setattr(settings, "rate_limit_per_minute", 2)
    for _ in range(2):
        assert client.post("/api/v1/knowledge/query", json={"question": "unknown"}).status_code == 200
    assert client.post("/api/v1/knowledge/query", json={"question": "unknown"}).status_code == 429
