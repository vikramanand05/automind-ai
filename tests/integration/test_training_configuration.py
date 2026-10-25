from types import SimpleNamespace

from automind.db import TrainingJob


def test_catalog_and_validated_training_overrides(client, db, monkeypatch):
    from automind.main import settings
    from automind.worker import run_training

    catalog = client.get("/api/v1/training/configurations")
    assert catalog.status_code == 200
    selected = next(c for c in catalog.json() if c["name"] == "lora-cpu")
    assert selected["available"] and selected["parameters"]["lora_rank"] == 8
    monkeypatch.setattr(settings, "training_enabled", True)
    monkeypatch.setattr(
        run_training, "apply_async", lambda **kwargs: SimpleNamespace(id="explicit-broker-stub")
    )
    result = client.post(
        "/api/v1/training/jobs",
        json={
            "kind": "lora",
            "config_name": "lora-cpu",
            "dataset": selected["dataset"],
            "parameters": {"learning_rate": 0.001, "lora_rank": 4},
        },
    )
    assert result.status_code == 202, result.text
    stored = db.get(TrainingJob, result.json()["id"])
    assert stored.config["learning_rate"] == 0.001 and stored.config["lora_rank"] == 4
    assert stored.config["source_config"] == "lora-cpu"


def test_training_rejects_unsafe_dataset_and_unsupported_parameters(client, monkeypatch):
    from automind.main import settings

    monkeypatch.setattr(settings, "training_enabled", True)
    base = {"kind": "lora", "config_name": "lora-cpu"}
    assert (
        client.post("/api/v1/training/jobs", json=base | {"dataset": "../../outside.jsonl"}).status_code
        == 422
    )
    assert (
        client.post("/api/v1/training/jobs", json=base | {"parameters": {"batch_size": 0}}).status_code == 422
    )
    assert (
        client.post("/api/v1/training/jobs", json=base | {"parameters": {"hidden_size": 8}}).status_code
        == 422
    )
