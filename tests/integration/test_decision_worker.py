import os
from uuid import uuid4

import pytest


@pytest.mark.services
def test_real_redis_decision_pipeline(client, db, monkeypatch):
    """Actual Redis/Celery delivery with synthetic RAG/forecast/simulation evidence."""
    url = os.environ.get("SERVICE_REDIS_URL")
    if not url:
        pytest.skip("Set SERVICE_REDIS_URL to test real decision transport")
    from automind import decision_api
    from automind.db import Investigation
    from automind.worker import run_decision
    from celery import Celery
    from celery.contrib.testing.worker import start_worker

    app = Celery("decision-transport-test", broker=url, backend=url)
    app.conf.update(task_serializer="json", result_serializer="json", accept_content=["json"])
    queue = "decision-test-" + uuid4().hex

    @app.task(name=queue)
    def execute(*args):
        return run_decision.run(*args)

    monkeypatch.setattr(
        decision_api,
        "dispatch",
        lambda identifier, token, kind, payload: execute.apply_async(
            args=[identifier, token, kind, payload], queue=queue
        ),
    )
    with start_worker(app, perform_ping_check=False, pool="solo", queues=[queue], shutdown_timeout=30):
        response = client.post("/api/v1/decisions/demo")
        assert response.status_code == 201, response.text
        identifier = response.json()["id"]
        result = app.AsyncResult(response.json()["job"]["task_id"])
        assert result.get(timeout=90)["state"] == "completed"
        db.expire_all()
        assert db.get(Investigation, identifier).job_state == "completed"
        detail = client.get(f"/api/v1/decisions/investigations/{identifier}").json()
        assert detail["recommendation"] and len(detail["scenarios"]) == 4
        assert detail["stages"]["knowledge_retrieval"]["result"]["sources"]
        assert detail["status"] == "Draft" and not detail["operational_action_performed"]
        result.forget()
