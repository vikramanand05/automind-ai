import os
from uuid import uuid4

import pytest


@pytest.mark.services
def test_real_redis_celery_worker_records_job_failure(db):
    """Real broker/worker round trip; missing dataset is an intentional failure fixture."""
    url = os.environ.get("SERVICE_REDIS_URL")
    if not url:
        pytest.skip("Set SERVICE_REDIS_URL for the actual Celery transport test")
    # This test times Redis delivery, not a first import of the optional training module.
    # Preload before the timed round trip; the worker still executes the real failure path.
    from importlib import import_module

    from automind.db import TrainingJob
    from automind.worker import run_training
    from celery import Celery
    from celery.contrib.testing.worker import start_worker

    import_module("automind.ml.forecasting")

    app = Celery("automind-worker-test", broker=url, backend=url)
    app.conf.update(task_serializer="json", result_serializer="json", accept_content=["json"])
    queue = "automind-test-" + uuid4().hex

    @app.task(name=queue)
    def execute(identifier):
        return run_training.run(identifier)

    job = TrainingJob(
        kind="forecast", config={"dataset": "missing-async-fixture.csv", "component": "CMP-001"}
    )
    db.add(job)
    db.commit()
    with start_worker(app, perform_ping_check=False, pool="solo", queues=[queue], shutdown_timeout=30):
        result = execute.apply_async(args=[job.id], queue=queue)
        failure = result.get(timeout=30, propagate=False)
        assert isinstance(failure, FileNotFoundError)
        db.expire_all()
        assert db.get(TrainingJob, job.id).status == "failed"
        result.forget()
