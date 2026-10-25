import traceback

from celery import Celery

from automind.config import get_settings
from automind.db import SessionLocal, TrainingJob
from automind.decisions import run_pipeline

settings = get_settings()
celery_app = Celery("automind", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
)


@celery_app.task(name="automind.decision", soft_time_limit=570, time_limit=600)
def run_decision(identifier: str, token: str, kind: str, payload: dict):
    # Core dependencies load before worker readiness, outside the task's time limit.
    return run_pipeline(identifier, token, kind, payload)


@celery_app.task(name="automind.train", time_limit=86400)
def run_training(identifier: str):
    with SessionLocal() as db:
        job = db.get(TrainingJob, identifier)
        if not job or job.status != "queued":
            return
        job.status = "running"
        db.commit()
        config = job.config
        kind = job.kind

    def cancelled():
        with SessionLocal() as db:
            job = db.get(TrainingJob, identifier)
            return job is None or job.status in ("cancelled", "cancel_requested")

    try:
        if kind == "lora":
            from automind.ml.llm import train_lora

            result = train_lora(config, cancelled)
        elif kind == "vision":
            from automind.ml.vision_training import train_vision

            result = train_vision(config, cancelled)
        else:
            from automind.ml.forecasting import train_forecasting

            result = train_forecasting(config, cancelled)
        with SessionLocal() as db:
            job = db.get(TrainingJob, identifier)
            job.status = "cancelled" if cancelled() or result.get("cancelled") else "completed"
            job.result = result
            db.commit()
        return result
    except Exception:
        with SessionLocal() as db:
            job = db.get(TrainingJob, identifier)
            job.status = "cancelled" if cancelled() else "failed"
            job.error = None if cancelled() else traceback.format_exc()[-4000:]
            db.commit()
        if cancelled():
            return {"cancelled": True}
        raise
