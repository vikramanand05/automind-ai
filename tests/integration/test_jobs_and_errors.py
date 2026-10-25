from types import SimpleNamespace

import pytest
from automind.db import TrainingJob
from sqlalchemy import select


def test_training_job_metadata_with_explicit_broker_stub(client, db, monkeypatch):
    """Tests HTTP metadata persistence, not training performance or Redis delivery."""
    from automind.main import settings
    from automind.worker import run_training

    monkeypatch.setattr(settings, "training_enabled", True)
    monkeypatch.setattr(run_training, "apply_async", lambda **kwargs: SimpleNamespace(id="broker-fixture"))
    result = client.post("/api/v1/training/jobs", json={"kind": "lora", "config_name": "lora-cpu"})
    assert result.status_code == 202, result.text
    assert db.get(TrainingJob, result.json()["id"]).status == "queued"
    assert client.get("/api/v1/training/jobs/" + result.json()["id"]).status_code == 200


def test_worker_records_real_missing_dataset_failure(db):
    from automind.worker import run_training

    job = TrainingJob(kind="forecast", config={"dataset": "missing-fixture.csv", "component": "CMP-001"})
    db.add(job)
    db.commit()
    with pytest.raises(FileNotFoundError):
        run_training.run(job.id)
    db.expire_all()
    stored = db.scalar(select(TrainingJob).where(TrainingJob.id == job.id))
    assert stored.status == "failed" and "FileNotFoundError" in stored.error


def test_malformed_pdf_and_consistent_not_found(client):
    result = client.post("/api/v1/knowledge/documents", files={"file": ("broken.pdf", b"not a pdf")})
    assert result.status_code == 422
    result = client.get("/api/v1/does-not-exist")
    assert result.status_code == 404 and "error" in result.json()


def test_invalid_csv_records_pipeline_failure(client):
    result = client.post("/api/v1/production/datasets", files={"file": ("wrong.csv", b"a,b\n1,2")})
    assert result.status_code == 422
    executions = client.get("/api/v1/pipelines").json()
    assert executions[0]["status"] == "failed" and not executions[0]["report"]["valid"]
