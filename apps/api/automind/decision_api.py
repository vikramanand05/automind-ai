import hashlib
import hmac
import io
import re
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from automind import decisions, knowledge, production, vision
from automind.config import get_settings
from automind.db import (
    Component,
    ComponentBatch,
    DecisionReview,
    ImpactAssessment,
    Investigation,
    ModelRecord,
    QualityObservation,
    Recommendation,
    get_db,
    uid,
)
from automind.decision_schemas import AnalysisRequest, InvestigationCreate, ReviewRequest, ScenarioRequest
from automind.schemas import SyntheticRequest

router = APIRouter(prefix="/api/v1/decisions", tags=["Decision Intelligence"])
Db = Annotated[Session, Depends(get_db)]


def reviewer_identity(
    x_reviewer_id: Annotated[str | None, Header()] = None,
    x_review_token: Annotated[str | None, Header()] = None,
) -> str:
    settings = get_settings()
    if not re.fullmatch(r"[a-f0-9]{64}", settings.decision_review_token_sha256):
        raise HTTPException(503, "Decision review is not configured; initialize a local reviewer credential")
    if not x_reviewer_id or not x_review_token:
        raise HTTPException(401, "An authorized reviewer credential is required")
    supplied = hashlib.sha256(x_review_token.encode()).hexdigest()
    if not (
        hmac.compare_digest(x_reviewer_id.encode(), settings.decision_reviewer_id.encode())
        and hmac.compare_digest(supplied, settings.decision_review_token_sha256)
    ):
        raise HTTPException(403, "Reviewer is not authorized")
    return settings.decision_reviewer_id


def dispatch(identifier: str, token: str, kind: str, payload: dict):
    from automind.worker import run_decision

    return run_decision.apply_async(args=[identifier, token, kind, payload], queue="decisions", retry=False)


def enqueue(db: Session, identifier: str, kind: str, payload: dict) -> dict:
    item = decisions.get_investigation(db, identifier, lock=True)
    decisions.editable(item)
    if kind == "simulate" and item.stages["production_impact"]["state"] != "completed":
        raise HTTPException(409, "Complete production impact analysis before running scenarios")
    item.job_state, item.job_kind, item.job_token, item.job_error = "queued", kind, uid(), None
    reset = decisions.STAGES[1:] if kind == "analyze" else decisions.STAGES[4:]
    item.stages = item.stages | {s: {"state": "pending", "result": {}} for s in reset}
    decisions.audit(
        db, item, "job.queued", {"kind": kind, "run_token": item.job_token, "parameters": payload}
    )
    db.commit()
    try:
        task = dispatch(item.id, item.job_token, kind, payload)
        item.task_id = task.id
        db.commit()
    except Exception:
        item.job_state, item.job_error = (
            "failed",
            "Redis task dispatch failed; check the decision worker and broker",
        )
        decisions.audit(db, item, "job.dispatch_failed", {"kind": kind})
        db.commit()
        raise HTTPException(503, item.job_error) from None
    return decisions.detail(db, item)


@router.get("/capabilities")
def capabilities():
    settings = get_settings()
    return {
        "review_configured": bool(re.fullmatch(r"[a-f0-9]{64}", settings.decision_review_token_sha256)),
        "queue": "decisions",
        "worker_liveness": "Not inferred from broker connectivity",
        "review_effect": "Local database record only",
        "operational_execution_supported": False,
    }


@router.get("/investigations")
def investigations(db: Db):
    items = db.scalars(select(Investigation).order_by(Investigation.updated_at.desc()).limit(100)).all()

    def summary(item):
        batch = db.get(ComponentBatch, item.batch_id)
        return {
            "id": item.id,
            "title": item.title,
            "status": item.status,
            "severity": item.severity,
            "synthetic": item.synthetic,
            "component": db.get(Component, batch.component_id).code,
            "batch_code": batch.batch_code,
            "job_state": item.job_state,
            "created_at": item.created_at.isoformat(),
            "updated_at": item.updated_at.isoformat(),
        }

    opened = Investigation.status != "Closed"
    at_risk = db.scalars(select(Investigation).where(opened)).all()
    risky_components = set()
    for item in at_risk:
        assessment = decisions.latest(db, ImpactAssessment, item.id)
        if (
            assessment
            and item.stages["production_impact"]["result"].get("assessment_id") == assessment.id
            and assessment.result["potential_shortage"] > 0
        ):
            risky_components.add(db.get(ComponentBatch, item.batch_id).component_id)
    completed = db.scalars(
        select(Investigation)
        .where(Investigation.status == "Closed")
        .order_by(Investigation.updated_at.desc())
        .limit(5)
    ).all()
    return {
        "items": [summary(i) for i in items],
        "overview": {
            "active_investigations": db.scalar(select(func.count()).select_from(Investigation).where(opened)),
            "critical_incidents": db.scalar(
                select(func.count())
                .select_from(Investigation)
                .where(opened, Investigation.severity == "critical")
            ),
            "components_at_risk": len(risky_components),
            "pending_decisions": db.scalar(
                select(func.count())
                .select_from(Investigation)
                .where(Investigation.status == "Awaiting Review")
            ),
            "completed_investigations": db.scalar(
                select(func.count()).select_from(Investigation).where(Investigation.status == "Closed")
            ),
        },
        "recent_completed": [summary(i) for i in completed],
    }


@router.post("/investigations", status_code=201)
def create(request: InvestigationCreate, db: Db):
    return decisions.detail(db, decisions.create_investigation(db, request))


@router.post("/demo", status_code=201)
def synthetic_demo(db: Db):
    version = production.ingest_frame(
        db,
        production.synthetic_data(SyntheticRequest(days=240, components=3, seed=42)),
        "Decision demo · seed 42",
        True,
    )
    manual = Path("datasets/samples/decision-quality-demo.md")
    knowledge.ingest(db, manual.read_bytes(), manual.name)
    item = decisions.create_investigation(
        db,
        InvestigationCreate(
            title="Synthetic demonstration · pitting investigation",
            version_id=version["id"],
            component="CMP-001",
            batch_code="DEMO-" + uid()[:8],
            batch_quantity=40,
            inspected_quantity=40,
            rejected_quantity=12,
            reported_defect="pitting",
            severity="high",
            rejected_in_inventory=True,
            notes="Fictional reported counts for software verification. No model prediction or operational batch is claimed.",
        ),
        demo=True,
    )
    return enqueue(db, item.id, "analyze", AnalysisRequest().model_dump())


@router.get("/investigations/{identifier}")
def investigation(identifier: str, db: Db):
    return decisions.detail(db, decisions.get_investigation(db, identifier))


def attach_image(db: Session, identifier: str, data: bytes):
    item = decisions.get_investigation(db, identifier, lock=True)
    decisions.editable(item)
    image = vision.validate_image(data)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = buffer.getvalue()
    folder = get_settings().storage_dir / "decision-images"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{uid()}.png"
    target.write_bytes(encoded)
    observation = decisions.latest(db, QualityObservation, identifier)
    observation.image_artifact = str(target)
    observation.image_checksum = hashlib.sha256(encoded).hexdigest()
    observation.model_id = None
    observation.result = {
        "available": False,
        "kind": "unavailable",
        "reason": "Image attached; analyze to run checkpoint inference",
    }
    item.stages = item.stages | {s: {"state": "pending", "result": {}} for s in decisions.STAGES[1:]}
    item.job_state, item.job_token, item.job_error = "idle", None, None
    decisions.audit(
        db,
        item,
        "image.attached",
        {"normalized_sha256": observation.image_checksum, "upload_sha256": hashlib.sha256(data).hexdigest()},
    )
    db.commit()
    return decisions.detail(db, item)


@router.post("/investigations/{identifier}/image")
async def upload_image(identifier: str, db: Db, file: UploadFile = File(...)):
    data = await file.read(get_settings().max_upload_bytes + 1)
    if not data or len(data) > get_settings().max_upload_bytes:
        raise HTTPException(413 if data else 422, "Image is empty or exceeds upload limit")
    return await run_in_threadpool(attach_image, db, identifier, data)


@router.get("/investigations/{identifier}/image")
def inspection_image(identifier: str, db: Db):
    decisions.get_investigation(db, identifier)
    observation = decisions.latest(db, QualityObservation, identifier)
    target = Path(observation.image_artifact) if observation.image_artifact else None
    if (
        not target
        or not target.is_file()
        or not target.resolve().is_relative_to(get_settings().storage_dir.resolve())
    ):
        raise HTTPException(404, "Inspection image unavailable")
    return FileResponse(target, media_type="image/png", headers={"Cache-Control": "no-store"})


@router.post("/investigations/{identifier}/analyze", status_code=202)
def analyze(identifier: str, request: AnalysisRequest, db: Db):
    if request.model_id:
        model = db.get(ModelRecord, request.model_id)
        if not model or model.module != "vision":
            raise HTTPException(422, "Choose an existing vision model")
    return enqueue(db, identifier, "analyze", request.model_dump())


@router.post("/investigations/{identifier}/simulate", status_code=202)
def simulate(identifier: str, request: ScenarioRequest, db: Db):
    return enqueue(db, identifier, "simulate", request.model_dump())


@router.get("/investigations/{identifier}/recommendations")
def recommendations(identifier: str, db: Db):
    return decisions.detail(db, decisions.get_investigation(db, identifier))["recommendation"]


@router.post("/investigations/{identifier}/submit")
def submit(identifier: str, db: Db):
    item = decisions.get_investigation(db, identifier, lock=True)
    decisions.editable(item)
    recommendation = decisions.latest(db, Recommendation, identifier)
    current = item.stages["recommendation"]["result"].get("recommendation_id")
    if item.job_state != "completed" or not recommendation or current != recommendation.id:
        raise HTTPException(409, "A completed, current recommendation is required before review")
    item.status = "Awaiting Review"
    decisions.audit(
        db,
        item,
        "decision.submitted",
        {"recommendation_id": recommendation.id, "evidence_hash": recommendation.evidence_hash},
    )
    decisions.stage(db, item, "human_approval", "requires_review", {"status": item.status})
    return decisions.detail(db, item)


@router.post("/{identifier}/review")
def review(
    identifier: str, request: ReviewRequest, db: Db, reviewer: Annotated[str, Depends(reviewer_identity)]
):
    item = decisions.get_investigation(db, identifier, lock=True)
    recommendation = decisions.latest(db, Recommendation, identifier)
    if (
        not recommendation
        or recommendation.id != request.recommendation_id
        or not hmac.compare_digest(recommendation.evidence_hash, request.evidence_hash)
    ):
        raise HTTPException(409, "Recommendation evidence changed; reload the current record")
    if item.job_state in ("queued", "running"):
        raise HTTPException(409, "Review is unavailable while a job is active")
    if request.action == "close":
        if item.status not in ("Approved", "Rejected"):
            raise HTTPException(409, "Only approved or rejected decisions can be closed")
        next_status = "Closed"
    else:
        if item.status != "Awaiting Review":
            raise HTTPException(409, "This decision is not awaiting review")
        next_status = "Approved" if request.action == "approve" else "Rejected"
    item.status = next_status
    db.add(
        DecisionReview(
            investigation_id=item.id,
            recommendation_id=recommendation.id,
            reviewer=reviewer,
            status=next_status,
            comments=request.comments,
            evidence_hash=recommendation.evidence_hash,
        )
    )
    decisions.audit(
        db,
        item,
        "decision." + next_status.lower(),
        {
            "recommendation_id": recommendation.id,
            "evidence_hash": recommendation.evidence_hash,
            "acknowledge_limitations": request.acknowledge_limitations,
        },
        actor=reviewer,
    )
    decisions.stage(
        db,
        item,
        "human_approval",
        "completed" if next_status in ("Approved", "Closed") else "requires_review",
        {"status": next_status, "reviewer": reviewer, "operational_action_performed": False},
    )
    return decisions.detail(db, item)
