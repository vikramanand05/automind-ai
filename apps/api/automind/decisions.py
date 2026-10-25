"""Persisted investigation orchestration. No external operational execution adapter exists."""

import hashlib
import json
import logging
import math
import re
from pathlib import Path
from time import perf_counter

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from automind import knowledge, production, vision
from automind.config import get_settings
from automind.db import (
    Component,
    ComponentBatch,
    Dataset,
    DecisionAudit,
    DecisionReview,
    DecisionScenario,
    Document,
    Evaluation,
    ImpactAssessment,
    Investigation,
    InvestigationEvent,
    ModelRecord,
    QualityObservation,
    Recommendation,
    SessionLocal,
    now,
)
from automind.decision_schemas import AnalysisRequest, InvestigationCreate, ScenarioRequest
from automind.decision_simulation import simulate_scenarios
from automind.schemas import ForecastRequest, KnowledgeQuery, SimulationRequest
from automind.tracking import record_experiment

log = logging.getLogger(__name__)
STAGES = [
    "quality_signal",
    "defect_analysis",
    "knowledge_retrieval",
    "production_impact",
    "scenario_simulation",
    "recommendation",
    "human_approval",
]


def get_investigation(db: Session, identifier: str, lock=False) -> Investigation:
    query = select(Investigation).where(Investigation.id == identifier)
    item = db.scalar(query.with_for_update() if lock else query)
    if not item:
        raise HTTPException(404, "Investigation not found")
    return item


def latest(db: Session, cls, identifier: str):
    return db.scalar(
        select(cls)
        .where(cls.investigation_id == identifier)
        .order_by(cls.created_at.desc(), cls.id.desc())
        .limit(1)
    )


def audit(db: Session, item: Investigation, action: str, detail=None, actor="workspace"):
    db.add(
        DecisionAudit(
            investigation_id=item.id,
            action=action,
            actor=actor,
            detail=(detail or {}) | {"operational_action_performed": False},
        )
    )
    item.updated_at = now()


def stage(db: Session, item: Investigation, name: str, state: str, result=None):
    detail = result or {}
    item.stages = item.stages | {name: {"state": state, "result": detail, "updated_at": now().isoformat()}}
    db.add(InvestigationEvent(investigation_id=item.id, stage=name, state=state, detail=detail))
    item.updated_at = now()
    db.commit()


def editable(item: Investigation):
    if item.status != "Draft":
        raise HTTPException(
            409, "Submitted evidence is immutable. Create a new investigation for revised evidence."
        )
    if item.job_state in ("queued", "running"):
        raise HTTPException(409, "An investigation job is already queued or running")


def create_investigation(db: Session, request: InvestigationCreate, demo=False) -> Investigation:
    frame, version = production.load_component(db, request.version_id, request.component)
    if request.rejected_in_inventory and request.rejected_quantity > float(frame.inventory_level.iloc[-1]):
        raise ValueError(
            "Rejected units included in recorded inventory cannot exceed that inventory snapshot"
        )
    component = db.scalar(select(Component).where(Component.code == request.component))
    dataset = db.get(Dataset, version.dataset_id)
    batch = db.scalar(
        select(ComponentBatch).where(
            ComponentBatch.version_id == version.id,
            ComponentBatch.component_id == component.id,
            ComponentBatch.batch_code == request.batch_code,
        )
    )
    if batch and batch.quantity != request.batch_quantity:
        raise HTTPException(409, "The existing batch has a different declared quantity")
    if not batch:
        batch = ComponentBatch(
            component_id=component.id,
            version_id=version.id,
            batch_code=request.batch_code,
            quantity=request.batch_quantity,
            synthetic=dataset.synthetic or demo,
        )
        db.add(batch)
        db.flush()
    item = Investigation(
        batch_id=batch.id,
        title=request.title,
        severity=request.severity,
        synthetic=dataset.synthetic or demo,
        input_data=request.model_dump() | {"synthetic_demonstration": demo},
        stages={s: {"state": "pending", "result": {}} for s in STAGES},
    )
    db.add(item)
    db.flush()
    db.add(
        QualityObservation(
            investigation_id=item.id,
            source="synthetic_demo" if demo else "operator_report",
            reported_defect=request.reported_defect,
            inspected_quantity=request.inspected_quantity,
            rejected_quantity=request.rejected_quantity,
            result={
                "available": False,
                "reason": "No image inference has been executed",
                "kind": "reported_observation",
            },
        )
    )
    audit(db, item, "investigation.created", {"synthetic_demo": demo, "dataset_version": version.id})
    stage(
        db,
        item,
        "quality_signal",
        "completed",
        {
            "kind": "synthetic_demo" if demo else "operator_report",
            "reported_defect": request.reported_defect,
            "inspected_quantity": request.inspected_quantity,
            "rejected_quantity": request.rejected_quantity,
            "batch_association": "Operator-declared, not inferred or verified against an ERP",
        },
    )
    return item


def detail(db: Session, item: Investigation) -> dict:
    batch = db.get(ComponentBatch, item.batch_id)
    component = db.get(Component, batch.component_id)
    observation = latest(db, QualityObservation, item.id)
    assessment = latest(db, ImpactAssessment, item.id)
    recommendation = latest(db, Recommendation, item.id)
    if assessment and item.stages["production_impact"]["result"].get("assessment_id") != assessment.id:
        assessment = None
    if (
        recommendation
        and item.stages["recommendation"]["result"].get("recommendation_id") != recommendation.id
    ):
        recommendation = None
    scenarios = db.scalars(
        select(DecisionScenario)
        .where(
            DecisionScenario.investigation_id == item.id,
            DecisionScenario.run_token == (recommendation.run_token if recommendation else item.job_token),
        )
        .order_by(DecisionScenario.code)
    ).all()
    reviews = db.scalars(
        select(DecisionReview)
        .where(DecisionReview.investigation_id == item.id)
        .order_by(DecisionReview.created_at)
    ).all()
    events = db.scalars(
        select(InvestigationEvent)
        .where(InvestigationEvent.investigation_id == item.id)
        .order_by(InvestigationEvent.created_at, InvestigationEvent.id)
    ).all()
    audits = db.scalars(
        select(DecisionAudit)
        .where(DecisionAudit.investigation_id == item.id)
        .order_by(DecisionAudit.created_at)
    ).all()
    return {
        "id": item.id,
        "title": item.title,
        "status": item.status,
        "severity": item.severity,
        "synthetic": item.synthetic,
        "created_at": item.created_at.isoformat(),
        "updated_at": item.updated_at.isoformat(),
        "input": item.input_data,
        "batch": {
            "id": batch.id,
            "code": batch.batch_code,
            "quantity": batch.quantity,
            "component": component.code,
            "version_id": batch.version_id,
        },
        "stages": item.stages,
        "job": {
            "state": item.job_state,
            "kind": item.job_kind,
            "task_id": item.task_id,
            "error": item.job_error,
        },
        "quality": {
            "id": observation.id,
            "source": observation.source,
            "model_id": observation.model_id,
            "image_url": f"/api/v1/decisions/investigations/{item.id}/image"
            if observation.image_artifact
            else None,
            "image_checksum": observation.image_checksum,
            "reported_defect": observation.reported_defect,
            "inspected_quantity": observation.inspected_quantity,
            "rejected_quantity": observation.rejected_quantity,
            "prediction": observation.result,
        },
        "impact": None
        if not assessment
        else {
            "id": assessment.id,
            "evaluation_id": assessment.evaluation_id,
            "forecast_id": assessment.forecast_id,
            **assessment.result,
        },
        "scenarios": [{"id": s.id, **s.result} for s in scenarios],
        "recommendation": None
        if not recommendation
        else {
            "id": recommendation.id,
            "evidence_hash": recommendation.evidence_hash,
            "created_at": recommendation.created_at.isoformat(),
            **recommendation.result,
        },
        "reviews": [
            {
                "id": r.id,
                "reviewer": r.reviewer,
                "status": r.status,
                "comments": r.comments,
                "recommendation_id": r.recommendation_id,
                "evidence_hash": r.evidence_hash,
                "created_at": r.created_at.isoformat(),
            }
            for r in reviews
        ],
        "events": [
            {
                "id": e.id,
                "stage": e.stage,
                "state": e.state,
                "detail": e.detail,
                "created_at": e.created_at.isoformat(),
            }
            for e in events
        ],
        "audit": [
            {
                "id": a.id,
                "action": a.action,
                "actor": a.actor,
                "detail": a.detail,
                "created_at": a.created_at.isoformat(),
            }
            for a in audits
        ],
        "operational_action_performed": False,
    }


def analyze_quality(db: Session, item: Investigation, request: AnalysisRequest):
    observation = latest(db, QualityObservation, item.id)
    stage(db, item, "defect_analysis", "running")
    selected = (
        db.get(ModelRecord, request.model_id)
        if request.model_id
        else db.scalar(
            select(ModelRecord).where(ModelRecord.module == "vision", ModelRecord.state == "active")
        )
    )
    reason = (
        "No inspection image attached" if not observation.image_artifact else "No active vision checkpoint"
    )
    if not observation.image_artifact or not selected or selected.module != "vision":
        observation.result = {
            "available": False,
            "reason": reason,
            "kind": "unavailable",
            "reported_defect": observation.reported_defect,
        }
        stage(db, item, "defect_analysis", "requires_review", observation.result)
        return
    try:
        result = vision.predict(db, Path(observation.image_artifact).read_bytes(), selected.id)
        if not math.isfinite(result["confidence"]):
            raise ValueError("Checkpoint returned a non-finite confidence")
        observation.model_id = selected.id
        observation.result = result | {
            "kind": "model_prediction",
            "available": True,
            "inference_timestamp": now().isoformat(),
        }
        stage(db, item, "defect_analysis", "completed", observation.result)
    except (HTTPException, ImportError, ValueError, OSError) as exc:
        observation.result = {
            "available": False,
            "kind": "unavailable",
            "reason": str(exc.detail if isinstance(exc, HTTPException) else exc)[:500],
        }
        stage(db, item, "defect_analysis", "requires_review", observation.result)


def analyze_knowledge(db: Session, item: Investigation, request: AnalysisRequest):
    observation = latest(db, QualityObservation, item.id)
    defect = observation.result.get("predicted_class", observation.reported_defect)
    question = f"{defect} defect possible causes and reinspection investigation steps for {item.input_data['component']}"
    stage(db, item, "knowledge_retrieval", "running", {"query": question})
    generation_error = None
    try:
        answer = knowledge.query(db, KnowledgeQuery(question=question, model=request.explanation_mode))
    except (HTTPException, ImportError, OSError, ValueError) as exc:
        # Explicitly expose a generation failure; retain independently available source evidence.
        generation_error = str(exc.detail if isinstance(exc, HTTPException) else exc)[:500]
        sources = knowledge.retrieve(db, question, 4, 0.12)
        answer = {
            "sources": sources,
            "answer": "Requested language generation unavailable; inspect retrieved passages.",
            "mode": "retrieval_only",
            "sufficient_evidence": bool(sources),
            "embedding_mode": get_settings().embedding_mode,
        }
    sources = answer["sources"]
    causes, steps = [], []
    for index, source in enumerate(sources):
        doc = db.get(Document, source["document_id"])
        source["document_checksum"] = doc.checksum if doc else None
        for sentence in re.split(r"(?<=[.!?])\s+", source["text"]):
            if re.search(r"\b(cause|causes|possible|may|due to)\b", sentence, re.I):
                causes.append(
                    {
                        "text": sentence[:1000],
                        "citation": index + 1,
                        "status": "Documented possibility; NOT a verified root cause",
                    }
                )
            if re.search(r"\b(reinspect|inspect|verify|check|quarantine)\b", sentence, re.I):
                steps.append({"text": sentence[:1000], "citation": index + 1})
    evidence = answer | {
        "query": question,
        "requested_mode": request.explanation_mode,
        "generation_error": generation_error,
        "possible_causes": causes[:6],
        "investigation_steps": steps[:6],
        "verified_root_cause": False,
        "interpretation": "Model-generated explanations are hypotheses; source matches are evidence, not causal proof",
    }
    stage(
        db,
        item,
        "knowledge_retrieval",
        "completed" if sources and not generation_error else "requires_review",
        evidence,
    )


def assess_impact(db: Session, item: Investigation, request: AnalysisRequest) -> ImpactAssessment:
    stage(db, item, "production_impact", "running")
    data = item.input_data
    frame, version = production.load_component(db, data["version_id"], data["component"])
    observation = latest(db, QualityObservation, item.id)
    stock = float(frame.inventory_level.iloc[-1])
    rejected_stock = observation.rejected_quantity if data["rejected_in_inventory"] else 0
    if rejected_stock > stock:
        raise ValueError("Reported rejected stock exceeds the recorded inventory snapshot")
    start = perf_counter()
    predicted = production.forecast(
        db,
        ForecastRequest(
            version_id=version.id,
            component=data["component"],
            model=request.forecast_model,
            horizon=request.horizon,
        ),
    )
    policy = production.inventory_simulation(
        db, SimulationRequest(version_id=version.id, component=data["component"])
    )
    total = sum(p["predicted"] for p in predicted["forecast"])
    usable = max(0.0, stock - rejected_stock)
    result = {
        "kind": "deterministic_calculation",
        "synthetic": item.synthetic,
        "component": data["component"],
        "batch_code": data["batch_code"],
        "inspected_quantity": observation.inspected_quantity,
        "rejected_quantity": observation.rejected_quantity,
        "recorded_inventory": stock,
        "usable_inventory": usable,
        "inventory_as_of": str(frame.date.iloc[-1].date()),
        "forecast_demand": round(total, 3),
        "potential_shortage": round(max(0.0, total - usable), 3),
        "supplier_lead_time_days": int(math.ceil(frame.supplier_lead_time.iloc[-1])),
        "supplier_reliability": float(frame.supplier_reliability.iloc[-1]),
        "unit_cost": float(frame.unit_cost.iloc[-1]),
        "forecast": predicted,
        "inventory_policy": policy,
        "assumptions": {
            "stock_scope": "Rejects subtracted from recorded stock"
            if rejected_stock
            else "Reported rejects are outside the recorded stock snapshot",
            "batch_link": "Operator-declared association, not verified against a manufacturing system",
            "quantity_source": "Operator report; a single image prediction is not a batch reject rate",
            "shortage_formula": "max(0, sum(forecast demand) - usable inventory); no inbound receipts assumed",
            "time_scope": "Dataset observation and forecast dates, not necessarily today's operations",
            "forecast_uncertainty": predicted["interval_method"],
        },
    }
    exp = record_experiment(
        db,
        "decision",
        "stock-coverage-rule-v1",
        version.id,
        {
            "investigation_id": item.id,
            "component": data["component"],
            "evaluation_protocol": "decision-stock-coverage-v1",
            "forecast_id": predicted["id"],
        },
        {
            "potential_shortage": result["potential_shortage"],
            "usable_inventory": usable,
            "forecast_demand": total,
        },
        perf_counter() - start,
        version.checksum,
        artifacts={"forecast_id": predicted["id"], "investigation_id": item.id},
    )
    db.flush()
    evaluation = db.scalar(select(Evaluation).where(Evaluation.experiment_id == exp.id))
    result["experiment_id"] = exp.id
    assessment = ImpactAssessment(
        investigation_id=item.id,
        forecast_id=predicted["id"],
        evaluation_id=evaluation.id,
        version_id=version.id,
        result=result,
    )
    db.add(assessment)
    db.commit()
    stage(db, item, "production_impact", "completed", {"assessment_id": assessment.id, **result})
    return assessment


def simulate_and_recommend(
    db: Session, item: Investigation, assessment: ImpactAssessment, parameters: ScenarioRequest, token: str
):
    stage(db, item, "scenario_simulation", "running")
    scenarios = simulate_scenarios(assessment.result, parameters)
    for result in scenarios:
        db.add(
            DecisionScenario(
                investigation_id=item.id,
                assessment_id=assessment.id,
                run_token=token,
                code=result["code"],
                assumptions=result["assumptions"],
                result=result,
            )
        )
    stage(
        db,
        item,
        "scenario_simulation",
        "completed",
        {"codes": [s["code"] for s in scenarios], "parameters": parameters.model_dump()},
    )
    stage(db, item, "recommendation", "running")
    # Quality gate first; then compare original-date service, unserved units and declared costs.
    chosen = min(
        scenarios,
        key=lambda s: (
            -s["service_level"],
            s["unserved_units"],
            s["procurement_cost"] + s["reinspection_cost"] + s["holding_cost"],
        ),
    )
    observation = latest(db, QualityObservation, item.id)
    knowledge_result = item.stages["knowledge_retrieval"]["result"]
    gaps = [
        f"{s.replace('_', ' ')}: {v['state']}"
        for s, v in item.stages.items()
        if s in ("defect_analysis", "knowledge_retrieval") and v["state"] != "completed"
    ]
    result = {
        "engine": "quality-gated-scenario-rule-v1",
        "kind": "decision_support",
        "selected_scenario": chosen["code"],
        "proposed_action": f"Review scenario {chosen['code']}: {chosen['name']}. Quarantine reported rejects and verify quality before release.",
        "rationale": "Rank by original-due-date service, then unserved units, then stated simulated costs. This is not economic optimization or a production command.",
        "supporting_evidence": [
            {
                "kind": observation.source,
                "reference": observation.id,
                "detail": "Operator-declared inspection quantities and batch link",
            },
            {
                "kind": "model_prediction" if observation.result.get("available") else "unavailable",
                "reference": observation.model_id,
                "detail": observation.result,
            },
            {
                "kind": "retrieved_evidence",
                "references": [s["chunk_id"] for s in knowledge_result.get("sources", [])],
            },
            {
                "kind": "deterministic_calculation",
                "reference": assessment.id,
                "detail": {"potential_shortage": assessment.result["potential_shortage"]},
            },
            {
                "kind": "simulation",
                "reference": chosen["code"],
                "detail": "Fixed original forecast demand denominator",
            },
        ],
        "model_outputs": {
            "vision": observation.result,
            "forecast_model": assessment.result["forecast"]["model"],
            "evaluation_id": assessment.evaluation_id,
        },
        "explanation": {
            "mode": knowledge_result.get("mode"),
            "text": knowledge_result.get("answer"),
            "status": "Hypothesis / retrieved context; never a verified root cause or authorization",
        },
        "assumptions": chosen["assumptions"],
        "expected_simulated_impact": {
            k: chosen[k]
            for k in (
                "service_level",
                "unserved_units",
                "ending_inventory",
                "estimated_delay_days",
                "holding_cost",
                "procurement_cost",
                "reinspection_cost",
            )
        },
        "uncertainty": gaps
        + [
            "Forecast residual bands are uncalibrated",
            "Batch association and quantities are operator-declared",
            "Recovery yield and delivery timing are scenario assumptions, not predictions",
        ],
        "operational_risks": [
            "Do not release rejected units without approved reinspection",
            "Supplier arrivals may differ from the assumed day",
            "Historical dataset stock may not describe current stock",
            "Procurement, capacity and schedule constraints need human review",
        ],
        "alternative_actions": [
            {
                "code": s["code"],
                "action": s["name"],
                "service_level": s["service_level"],
                "unserved_units": s["unserved_units"],
            }
            for s in scenarios
            if s["code"] != chosen["code"]
        ],
        "requires_human_approval": True,
        "operational_action_performed": False,
    }
    evidence = {
        "input": item.input_data,
        "image_checksum": observation.image_checksum,
        "prediction": observation.result,
        "knowledge": knowledge_result,
        "impact": assessment.result,
        "scenarios": scenarios,
        "recommendation": result,
    }
    digest = hashlib.sha256(json.dumps(evidence, sort_keys=True, allow_nan=False).encode()).hexdigest()
    recommendation = Recommendation(
        investigation_id=item.id,
        assessment_id=assessment.id,
        run_token=token,
        evidence_hash=digest,
        result=result,
    )
    db.add(recommendation)
    db.flush()
    audit(
        db,
        item,
        "recommendation.generated",
        {"recommendation_id": recommendation.id, "evidence_hash": digest},
    )
    stage(
        db,
        item,
        "recommendation",
        "requires_review",
        {
            "recommendation_id": recommendation.id,
            "evidence_hash": digest,
            "proposed_action": result["proposed_action"],
        },
    )
    stage(db, item, "human_approval", "pending", {"status": "Draft", "operational_action_performed": False})


def run_pipeline(identifier: str, token: str, kind: str, payload: dict):
    with SessionLocal() as db:
        item = get_investigation(db, identifier, lock=True)
        if item.job_state != "queued" or item.job_token != token:
            return {"ignored": True}
        item.job_state = "running"
        audit(db, item, "job.started", {"kind": kind, "run_token": token})
        db.commit()
        current = "defect_analysis" if kind == "analyze" else "scenario_simulation"
        try:
            if kind == "analyze":
                request = AnalysisRequest.model_validate(payload)
                analyze_quality(db, item, request)
                current = "knowledge_retrieval"
                analyze_knowledge(db, item, request)
                current = "production_impact"
                assessment = assess_impact(db, item, request)
                parameters = ScenarioRequest()
            else:
                assessment = latest(db, ImpactAssessment, identifier)
                if not assessment:
                    raise ValueError("Analyze production impact before simulating scenarios")
                parameters = ScenarioRequest.model_validate(payload)
            current = "scenario_simulation"
            simulate_and_recommend(db, item, assessment, parameters, token)
            item.job_state = "completed"
            audit(db, item, "job.completed", {"kind": kind, "run_token": token})
            db.commit()
            return {
                "investigation_id": identifier,
                "state": "completed",
                "operational_action_performed": False,
            }
        except Exception as exc:
            db.rollback()
            log.exception("Decision investigation job failed: %s", identifier)
            item = get_investigation(db, identifier)
            item.job_state = "failed"
            item.job_error = str(exc.detail if isinstance(exc, HTTPException) else exc)[:1000]
            audit(db, item, "job.failed", {"kind": kind, "error": item.job_error})
            stage(db, item, current, "failed", {"error": item.job_error})
            return {"investigation_id": identifier, "state": "failed", "operational_action_performed": False}
