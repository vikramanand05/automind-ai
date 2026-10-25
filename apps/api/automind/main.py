import json
import logging
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from threading import Lock
from typing import Annotated

import redis
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from pypdf.errors import PyPdfError
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from automind import knowledge, production
from automind.body_limit import BodyLimitMiddleware
from automind.config import get_settings
from automind.db import (
    Audit,
    DatasetVersion,
    Document,
    Evaluation,
    Experiment,
    Forecast,
    ModelRecord,
    PipelineExecution,
    SessionLocal,
    TrainingJob,
    engine,
    get_db,
)
from automind.decision_api import router as decision_router
from automind.schemas import (
    ForecastRequest,
    JobRequest,
    KnowledgeQuery,
    SimulationRequest,
    SyntheticRequest,
    TrainingParameters,
)

settings = get_settings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)
REQUESTS = Counter("automind_requests_total", "HTTP requests", ["method", "path", "status"])
LATENCY = Histogram("automind_request_duration_seconds", "HTTP request duration", ["path"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Schema changes are applied via Alembic, never silently at startup.
    yield


app = FastAPI(
    title="AutoMind AI",
    version="0.1.0",
    lifespan=lifespan,
    description="Local industrial AI. Synthetic data and unavailable models are explicitly labelled.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "X-API-Key", "X-Reviewer-ID", "X-Review-Token"],
)
app.add_middleware(BodyLimitMiddleware, limit=settings.max_upload_bytes + 65536)
app.include_router(decision_router)
Db = Annotated[Session, Depends(get_db)]
rate_windows: dict[str, deque] = defaultdict(deque)
rate_lock = Lock()
EXPENSIVE = (
    "/knowledge/query",
    "/production/forecast",
    "/production/simulate",
    "/vision/predict",
    "/training/jobs",
    "/analyze",
    "/simulate",
    "/review",
    "/demo",
)


@app.middleware("http")
async def controls(request: Request, call_next):
    start = time.perf_counter()
    path = request.url.path
    if path.startswith("/api/") and settings.api_key:
        import hmac

        if not hmac.compare_digest(request.headers.get("X-API-Key", ""), settings.api_key):
            return JSONResponse(
                {"error": {"code": "unauthorized", "message": "Valid X-API-Key required"}}, 401
            )
    length = request.headers.get("content-length")
    if length and (not length.isdigit() or int(length) > settings.max_upload_bytes + 65536):
        return JSONResponse(
            {"error": {"code": "upload_too_large", "message": "Upload exceeds configured limit"}}, 413
        )
    if request.method == "POST" and any(path.endswith(p) for p in EXPENSIVE):
        client = request.client.host if request.client else "unknown"
        with rate_lock:
            window = rate_windows[client]
            now = time.monotonic()
            while window and window[0] < now - 60:
                window.popleft()
            if len(window) >= settings.rate_limit_per_minute:
                return JSONResponse(
                    {"error": {"code": "rate_limit", "message": "Retry after one minute"}}, 429
                )
            window.append(now)
    response = await call_next(request)
    route = request.scope.get("route")
    route_name = route.path if route else "unmatched"
    REQUESTS.labels(request.method, route_name, response.status_code).inc()
    LATENCY.labels(route_name).observe(time.perf_counter() - start)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


@app.exception_handler(StarletteHTTPException)
async def http_error(request, exc):
    return JSONResponse(
        {"error": {"code": str(exc.status_code), "message": str(exc.detail)}}, exc.status_code
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse({"error": {"code": "validation", "message": str(exc)}}, 422)


@app.exception_handler(ValueError)
async def value_error(request, exc):
    return JSONResponse({"error": {"code": "invalid_input", "message": str(exc)[:1000]}}, 422)


@app.exception_handler(ImportError)
async def dependency_error(request, exc):
    return JSONResponse(
        {
            "error": {
                "code": "optional_dependency",
                "message": "This operation requires optional ML dependencies. See MODEL_TRAINING.md for installation.",
            }
        },
        503,
    )


@app.exception_handler(IntegrityError)
async def conflict_error(request, exc):
    return JSONResponse(
        {"error": {"code": "conflict", "message": "Record conflicts with existing data"}}, 409
    )


@app.exception_handler(Exception)
async def internal_error(request, exc):
    logger.exception("Request failed: %s", request.url.path)
    return JSONResponse(
        {"error": {"code": "internal_error", "message": "Operation failed; inspect API logs"}}, 500
    )


def connections() -> dict:
    result = {"database": "unavailable", "redis": "unavailable"}
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            connection.execute(text("SELECT version_num FROM alembic_version"))
        result["database"] = "connected"
    except Exception:
        pass
    try:
        redis.Redis.from_url(settings.redis_url, socket_connect_timeout=1, socket_timeout=1).ping()
        result["redis"] = "connected"
    except redis.RedisError:
        pass
    return result


@app.get("/health/live")
def live():
    return {"status": "alive", "version": app.version}


@app.get("/health/ready")
def ready():
    state = connections()
    healthy = all(v == "connected" for v in state.values())
    return JSONResponse({"status": "ready" if healthy else "degraded", **state}, 200 if healthy else 503)


@app.get("/metrics", include_in_schema=False)
def prometheus():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/api/v1/system/status")
def status(db: Db):
    state = connections()
    counts = {
        "documents": db.scalar(select(func.count()).select_from(Document)),
        "datasets": db.scalar(select(func.count()).select_from(DatasetVersion)),
        "experiments": db.scalar(select(func.count()).select_from(Experiment)),
        "models": db.scalar(select(func.count()).select_from(ModelRecord)),
    }
    return {
        "version": app.version,
        "public_api_url": settings.public_api_url,
        **state,
        "counts": counts,
        "training_enabled": settings.training_enabled,
        "database_backend": engine.dialect.name,
        "embedding_mode": settings.embedding_mode,
        "llm_mode": settings.llm_mode,
        "modules": [
            {
                "name": "Industrial Knowledge",
                "state": "available",
                "detail": "FAISS retrieval + cited excerpts",
            },
            {
                "name": "Manufacturing Vision",
                "state": "requires_checkpoint",
                "detail": "Register trained weights to enable inference",
            },
            {
                "name": "Production Intelligence",
                "state": "available",
                "detail": "Temporal forecasts + inventory simulation",
            },
        ],
    }


async def upload_bytes(file: UploadFile) -> bytes:
    data = await file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(413, "File exceeds upload limit")
    if not data:
        raise HTTPException(422, "File is empty")
    return data


@app.post("/api/v1/knowledge/documents", status_code=201)
async def upload_document(
    db: Db, file: UploadFile = File(...), chunk_size: int = Form(180), overlap: int = Form(30)
):
    if chunk_size > 1000:
        raise HTTPException(422, "Chunk size cannot exceed 1000 words")
    data = await upload_bytes(file)
    # Parsing/retrieval are synchronous CPU tasks: run outside the event loop.
    from starlette.concurrency import run_in_threadpool

    try:
        return await run_in_threadpool(knowledge.ingest, db, data, file.filename or "", chunk_size, overlap)
    except (UnicodeError, OSError, PyPdfError) as exc:
        raise HTTPException(422, "Document could not be decoded") from exc


@app.get("/api/v1/knowledge/documents")
def documents(db: Db):
    return [
        knowledge.document_dict(d)
        for d in db.scalars(select(Document).order_by(Document.created_at.desc())).all()
    ]


@app.delete("/api/v1/knowledge/documents/{identifier}", status_code=204)
def delete_document(identifier: str, db: Db):
    knowledge.remove_document(db, identifier)


@app.post("/api/v1/knowledge/rebuild")
def rebuild(db: Db):
    return knowledge.rebuild_index(db)


@app.post("/api/v1/knowledge/query")
def ask(request: KnowledgeQuery, db: Db):
    return knowledge.query(db, request)


@app.post("/api/v1/production/synthetic", status_code=201)
def generate_synthetic(request: SyntheticRequest, db: Db):
    return production.ingest_frame(
        db, production.synthetic_data(request), f"Synthetic production · seed {request.seed}", True
    )


@app.post("/api/v1/production/datasets", status_code=201)
async def upload_dataset(db: Db, file: UploadFile = File(...), synthetic: bool = Form(False)):
    data = await upload_bytes(file)
    from starlette.concurrency import run_in_threadpool

    try:
        return await run_in_threadpool(
            production.ingest_frame, db, production.read_csv(data), file.filename or "CSV", synthetic
        )
    except Exception as exc:
        if isinstance(exc, (IntegrityError, HTTPException)):
            raise
        db.rollback()
        db.add(PipelineExecution(status="failed", report={"valid": False, "error": str(exc)[:700]}))
        db.commit()
        raise HTTPException(422, f"Dataset validation failed: {str(exc)[:700]}") from exc


@app.get("/api/v1/production/datasets")
def datasets(db: Db):
    return [
        production.version_dict(db, v)
        for v in db.scalars(select(DatasetVersion).order_by(DatasetVersion.created_at.desc())).all()
    ]


@app.post("/api/v1/production/forecast")
def forecast(request: ForecastRequest, db: Db):
    return production.forecast(db, request)


@app.get("/api/v1/production/forecasts")
def forecasts(db: Db):
    return [
        f.result | {"id": f.id}
        for f in db.scalars(select(Forecast).order_by(Forecast.created_at.desc()).limit(50)).all()
    ]


@app.post("/api/v1/production/simulate")
def simulate(request: SimulationRequest, db: Db):
    return production.inventory_simulation(db, request)


@app.get("/api/v1/production/inventory")
def inventory(version_id: str, component: str, db: Db):
    return production.inventory_simulation(db, SimulationRequest(version_id=version_id, component=component))


@app.get("/api/v1/pipelines")
def pipelines(db: Db):
    return [
        {
            "id": p.id,
            "status": p.status,
            "version_id": p.dataset_version_id,
            "report": p.report,
            "created_at": p.created_at.isoformat(),
        }
        for p in db.scalars(
            select(PipelineExecution).order_by(PipelineExecution.created_at.desc()).limit(100)
        ).all()
    ]


@app.get("/api/v1/experiments")
def experiments(db: Db):
    result = []
    for exp in db.scalars(select(Experiment).order_by(Experiment.created_at.desc()).limit(100)).all():
        evaluation = db.scalar(select(Evaluation).where(Evaluation.experiment_id == exp.id))
        result.append(
            {
                "id": exp.id,
                "module": exp.module,
                "model": exp.model,
                "dataset_version_id": exp.dataset_version_id,
                "config": exp.config,
                "provenance": exp.provenance,
                "duration_seconds": exp.duration_seconds,
                "mlflow_run_id": exp.mlflow_run_id,
                "metrics": evaluation.metrics if evaluation else {},
                "artifacts": evaluation.artifacts if evaluation else {},
                "created_at": exp.created_at.isoformat(),
            }
        )
    return result


@app.get("/api/v1/experiments/{identifier}")
def experiment(identifier: str, db: Db):
    for exp in experiments(db):
        if exp["id"] == identifier:
            return exp
    raise HTTPException(404, "Experiment not found")


@app.get("/api/v1/models")
def models(db: Db):
    return [
        {
            "id": m.id,
            "name": m.name,
            "module": m.module,
            "version": m.version,
            "state": m.state,
            "metadata": m.metadata_json,
        }
        for m in db.scalars(select(ModelRecord)).all()
    ]


@app.post("/api/v1/models/{identifier}/activate")
def activate_model(identifier: str, db: Db):
    model = db.get(ModelRecord, identifier)
    if not model:
        raise HTTPException(404, "Model not found")
    if not Path(model.artifact).is_file():
        raise HTTPException(409, "Checkpoint artifact is missing")
    for other in db.scalars(select(ModelRecord).where(ModelRecord.module == model.module)).all():
        if other.state == "active":
            other.state = "archived"
    model.state = "active"
    db.add(Audit(action="model.activate", target=model.id))
    db.commit()
    if model.module == "knowledge":
        from automind.ml.llm import load_llm

        load_llm.cache_clear()
    return {"id": model.id, "state": model.state}


@app.get("/api/v1/vision/models")
def vision_models(db: Db):
    return {
        "models": [m for m in models(db) if m["module"] == "vision"],
        "architectures": ["resnet50", "efficientnet_b0", "vit_b_16"],
        "status": "available"
        if db.scalar(select(ModelRecord).where(ModelRecord.module == "vision", ModelRecord.state == "active"))
        else "model_not_trained",
    }


@app.get("/api/v1/vision/evaluations")
def vision_evaluations(db: Db):
    return [e for e in experiments(db) if e["module"] == "vision"]


@app.post("/api/v1/vision/predict")
async def vision_predict(db: Db, file: UploadFile = File(...), model_id: str | None = Form(None)):
    from automind.vision import predict

    data = await upload_bytes(file)
    from starlette.concurrency import run_in_threadpool

    return await run_in_threadpool(predict, db, data, model_id)


@app.get("/api/v1/artifacts/{filename}")
def artifact(filename: str):
    from fastapi.responses import FileResponse

    if not filename.endswith(".png") or Path(filename).name != filename:
        raise HTTPException(404, "Artifact not found")
    path = settings.storage_dir / "explanations" / filename
    if not path.is_file():
        raise HTTPException(404, "Artifact not found")
    return FileResponse(path, media_type="image/png")


def job_dict(job):
    return {
        "id": job.id,
        "kind": job.kind,
        "status": job.status,
        "config": job.config,
        "error": job.error,
        "result": job.result,
        "created_at": job.created_at.isoformat(),
    }


@app.get("/api/v1/training/jobs")
def jobs(db: Db):
    return [
        job_dict(j)
        for j in db.scalars(select(TrainingJob).order_by(TrainingJob.created_at.desc()).limit(100)).all()
    ]


@app.get("/api/v1/training/configurations")
def training_configurations():
    import yaml

    result = []
    for path in sorted(Path("experiments/configurations").glob("*.yaml")):
        content = yaml.safe_load(path.read_text(encoding="utf-8"))
        result.append(
            {
                "name": path.stem,
                "kind": content["kind"],
                "dataset": content["dataset"],
                "available": Path(content["dataset"]).exists(),
                "parameters": {
                    key: value
                    for key, value in content.items()
                    if key in TrainingParameters.model_fields
                    and isinstance(value, (int, float))
                    and not isinstance(value, bool)
                },
            }
        )
    return result


@app.post("/api/v1/training/jobs", status_code=202)
def submit_job(request: JobRequest, db: Db):
    if not settings.training_enabled:
        raise HTTPException(
            409, "Training is disabled. Enable TRAINING_ENABLED and start a full-profile worker."
        )
    config = Path("experiments/configurations") / f"{request.config_name}.yaml"
    if not config.is_file():
        raise HTTPException(422, "Unknown configuration")
    import yaml

    content = yaml.safe_load(config.read_text())
    if content.get("kind") != request.kind:
        raise HTTPException(422, "Configuration kind does not match job kind")
    if request.dataset is not None:
        allowed = {c["dataset"] for c in training_configurations() if c["kind"] == request.kind}
        if request.dataset not in allowed:
            raise HTTPException(422, "Dataset must be selected from the approved configuration catalog")
        content["dataset"] = request.dataset
    parameters = request.parameters.model_dump(exclude_none=True)
    if any(key not in content for key in parameters):
        raise HTTPException(422, "A parameter is not supported by this task configuration")
    content.update(parameters)
    content["source_config"] = request.config_name
    job = TrainingJob(kind=request.kind, config=content)
    db.add(job)
    db.flush()
    db.add(Audit(action="training.submit", target=job.id))
    db.commit()
    try:
        from automind.worker import run_training

        result = run_training.apply_async(args=[job.id], task_id=job.id, retry=False)
        job.task_id = result.id
        db.commit()
    except Exception as exc:
        job.status, job.error = "failed", "Broker unavailable; restart Redis and submit a new job"
        db.commit()
        raise HTTPException(503, job.error) from exc
    return job_dict(job)


@app.get("/api/v1/training/jobs/{identifier}")
def job_detail(identifier: str, db: Db):
    job = db.get(TrainingJob, identifier)
    if not job:
        raise HTTPException(404, "Job not found")
    return job_dict(job)


@app.post("/api/v1/training/jobs/{identifier}/cancel")
def cancel_job(identifier: str, db: Db):
    job = db.get(TrainingJob, identifier)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status not in ("queued", "running", "cancel_requested"):
        raise HTTPException(409, "Job has already finished")
    from automind.worker import celery_app

    # Cooperative cancellation; never kill an unrelated worker process.
    celery_app.control.revoke(job.task_id or job.id, terminate=False)
    job.status = "cancelled" if job.status == "queued" else "cancel_requested"
    db.add(Audit(action="training.cancel", target=job.id))
    db.commit()
    return job_dict(job)


@app.get("/api/v1/training/jobs/{identifier}/events")
def job_events(identifier: str):
    async def stream():
        import asyncio

        for _ in range(120):
            with SessionLocal() as db:
                job = db.get(TrainingJob, identifier)
                if not job:
                    yield 'event: error\ndata: {"message":"Job not found"}\n\n'
                    return
                yield f"data: {json.dumps(job_dict(job))}\n\n"
                if job.status in ("completed", "failed", "cancelled"):
                    return
            await asyncio.sleep(2)

    return StreamingResponse(stream(), media_type="text/event-stream")
