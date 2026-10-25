from collections.abc import Generator
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from automind.config import get_settings


def uid() -> str:
    return str(uuid4())


def now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Record:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class User(Record, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str | None] = mapped_column(Text)


class Document(Record, Base):
    __tablename__ = "documents"
    filename: Mapped[str] = mapped_column(String(255))
    checksum: Mapped[str] = mapped_column(String(64), unique=True)
    size: Mapped[int]
    chunks: Mapped[int] = mapped_column(default=0)


class Chunk(Record, Base):
    __tablename__ = "document_chunks"
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    page: Mapped[int | None]
    ordinal: Mapped[int]
    text: Mapped[str] = mapped_column(Text)


class Dataset(Record, Base):
    __tablename__ = "datasets"
    name: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(40))
    synthetic: Mapped[bool] = mapped_column(default=False)


class DatasetVersion(Record, Base):
    __tablename__ = "dataset_versions"
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"), index=True)
    checksum: Mapped[str] = mapped_column(String(64), unique=True)
    artifact: Mapped[str] = mapped_column(Text)
    row_count: Mapped[int]
    quality: Mapped[dict] = mapped_column(JSON, default=dict)


class TrainingJob(Record, Base):
    __tablename__ = "training_jobs"
    kind: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    config: Mapped[dict] = mapped_column(JSON)
    task_id: Mapped[str | None] = mapped_column(String(100))
    error: Mapped[str | None] = mapped_column(Text)
    result: Mapped[dict | None] = mapped_column(JSON)


class ModelRecord(Record, Base):
    __tablename__ = "models"
    name: Mapped[str] = mapped_column(String(100))
    module: Mapped[str] = mapped_column(String(40), index=True)
    version: Mapped[str] = mapped_column(String(100))
    state: Mapped[str] = mapped_column(String(20), default="candidate")
    artifact: Mapped[str] = mapped_column(Text)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    __table_args__ = (UniqueConstraint("name", "version"),)


class Experiment(Record, Base):
    __tablename__ = "experiments"
    module: Mapped[str] = mapped_column(String(40), index=True)
    model: Mapped[str] = mapped_column(String(100))
    dataset_version_id: Mapped[str | None] = mapped_column(ForeignKey("dataset_versions.id"))
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    provenance: Mapped[dict] = mapped_column(JSON, default=dict)
    mlflow_run_id: Mapped[str | None] = mapped_column(String(100))
    duration_seconds: Mapped[float] = mapped_column(default=0.0)


class Evaluation(Record, Base):
    __tablename__ = "evaluation_results"
    experiment_id: Mapped[str] = mapped_column(ForeignKey("experiments.id"), index=True)
    metrics: Mapped[dict] = mapped_column(JSON)
    artifacts: Mapped[dict] = mapped_column(JSON, default=dict)


class VisionPrediction(Record, Base):
    __tablename__ = "vision_predictions"
    model_id: Mapped[str] = mapped_column(ForeignKey("models.id"))
    prediction: Mapped[dict] = mapped_column(JSON)


class Component(Record, Base):
    __tablename__ = "production_components"
    code: Mapped[str] = mapped_column(String(100), unique=True)
    category: Mapped[str] = mapped_column(String(100))


class Demand(Record, Base):
    __tablename__ = "historical_demand"
    component_id: Mapped[str] = mapped_column(ForeignKey("production_components.id"), index=True)
    version_id: Mapped[str] = mapped_column(ForeignKey("dataset_versions.id"), index=True)
    date: Mapped[str] = mapped_column(String(10))
    demand: Mapped[float]
    features: Mapped[dict] = mapped_column(JSON)
    __table_args__ = (UniqueConstraint("version_id", "component_id", "date"),)


class Inventory(Record, Base):
    __tablename__ = "inventory_records"
    component_id: Mapped[str] = mapped_column(ForeignKey("production_components.id"), index=True)
    version_id: Mapped[str] = mapped_column(ForeignKey("dataset_versions.id"), index=True)
    date: Mapped[str] = mapped_column(String(10))
    level: Mapped[float]


class Forecast(Record, Base):
    __tablename__ = "forecasts"
    version_id: Mapped[str] = mapped_column(ForeignKey("dataset_versions.id"), index=True)
    component: Mapped[str] = mapped_column(String(100))
    model: Mapped[str] = mapped_column(String(60))
    result: Mapped[dict] = mapped_column(JSON)


class PipelineExecution(Record, Base):
    __tablename__ = "pipeline_executions"
    status: Mapped[str] = mapped_column(String(20))
    dataset_version_id: Mapped[str | None] = mapped_column(ForeignKey("dataset_versions.id"))
    report: Mapped[dict] = mapped_column(JSON)


class Audit(Record, Base):
    __tablename__ = "audit_events"
    action: Mapped[str] = mapped_column(String(80), index=True)
    target: Mapped[str] = mapped_column(String(100))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)


class ComponentBatch(Record, Base):
    __tablename__ = "component_batches"
    component_id: Mapped[str] = mapped_column(ForeignKey("production_components.id"), index=True)
    version_id: Mapped[str] = mapped_column(ForeignKey("dataset_versions.id"), index=True)
    batch_code: Mapped[str] = mapped_column(String(100), index=True)
    quantity: Mapped[int]
    synthetic: Mapped[bool] = mapped_column(default=False)
    __table_args__ = (UniqueConstraint("version_id", "component_id", "batch_code"),)


class Investigation(Record, Base):
    __tablename__ = "decision_investigations"
    batch_id: Mapped[str] = mapped_column(ForeignKey("component_batches.id"), index=True)
    title: Mapped[str] = mapped_column(String(180))
    status: Mapped[str] = mapped_column(String(30), default="Draft", index=True)
    severity: Mapped[str] = mapped_column(String(20), index=True)
    synthetic: Mapped[bool] = mapped_column(default=False)
    input_data: Mapped[dict] = mapped_column(JSON)
    stages: Mapped[dict] = mapped_column(JSON, default=dict)
    job_state: Mapped[str] = mapped_column(String(20), default="idle", index=True)
    job_kind: Mapped[str | None] = mapped_column(String(30))
    job_token: Mapped[str | None] = mapped_column(String(36))
    task_id: Mapped[str | None] = mapped_column(String(100))
    job_error: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class QualityObservation(Record, Base):
    __tablename__ = "quality_observations"
    investigation_id: Mapped[str] = mapped_column(ForeignKey("decision_investigations.id"), index=True)
    model_id: Mapped[str | None] = mapped_column(ForeignKey("models.id"), index=True)
    source: Mapped[str] = mapped_column(String(30))
    image_artifact: Mapped[str | None] = mapped_column(Text)
    image_checksum: Mapped[str | None] = mapped_column(String(64))
    reported_defect: Mapped[str] = mapped_column(String(100))
    inspected_quantity: Mapped[int]
    rejected_quantity: Mapped[int]
    result: Mapped[dict] = mapped_column(JSON, default=dict)


class InvestigationEvent(Record, Base):
    __tablename__ = "investigation_events"
    investigation_id: Mapped[str] = mapped_column(ForeignKey("decision_investigations.id"), index=True)
    stage: Mapped[str] = mapped_column(String(40))
    state: Mapped[str] = mapped_column(String(30))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)


class ImpactAssessment(Record, Base):
    __tablename__ = "production_impact_assessments"
    investigation_id: Mapped[str] = mapped_column(ForeignKey("decision_investigations.id"), index=True)
    forecast_id: Mapped[str] = mapped_column(ForeignKey("forecasts.id"), index=True)
    evaluation_id: Mapped[str] = mapped_column(ForeignKey("evaluation_results.id"), index=True)
    version_id: Mapped[str] = mapped_column(ForeignKey("dataset_versions.id"), index=True)
    result: Mapped[dict] = mapped_column(JSON)


class DecisionScenario(Record, Base):
    __tablename__ = "decision_scenarios"
    investigation_id: Mapped[str] = mapped_column(ForeignKey("decision_investigations.id"), index=True)
    assessment_id: Mapped[str] = mapped_column(ForeignKey("production_impact_assessments.id"), index=True)
    run_token: Mapped[str] = mapped_column(String(36), index=True)
    code: Mapped[str] = mapped_column(String(10))
    assumptions: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict] = mapped_column(JSON)
    __table_args__ = (UniqueConstraint("run_token", "code"),)


class Recommendation(Record, Base):
    __tablename__ = "decision_recommendations"
    investigation_id: Mapped[str] = mapped_column(ForeignKey("decision_investigations.id"), index=True)
    assessment_id: Mapped[str] = mapped_column(ForeignKey("production_impact_assessments.id"))
    run_token: Mapped[str] = mapped_column(String(36), index=True)
    evidence_hash: Mapped[str] = mapped_column(String(64))
    result: Mapped[dict] = mapped_column(JSON)


class DecisionReview(Record, Base):
    __tablename__ = "decision_reviews"
    investigation_id: Mapped[str] = mapped_column(ForeignKey("decision_investigations.id"), index=True)
    recommendation_id: Mapped[str] = mapped_column(ForeignKey("decision_recommendations.id"), index=True)
    reviewer: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(30))
    comments: Mapped[str] = mapped_column(Text)
    evidence_hash: Mapped[str] = mapped_column(String(64))


class DecisionAudit(Record, Base):
    __tablename__ = "decision_audit_events"
    investigation_id: Mapped[str] = mapped_column(ForeignKey("decision_investigations.id"), index=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    actor: Mapped[str] = mapped_column(String(80))
    detail: Mapped[dict] = mapped_column(JSON)


Index("ix_chunks_document_ordinal", Chunk.document_id, Chunk.ordinal, unique=True)
settings = get_settings()
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    **({"connect_args": {"check_same_thread": False}} if settings.database_url.startswith("sqlite") else {}),
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Generator:
    with SessionLocal() as session:
        yield session
