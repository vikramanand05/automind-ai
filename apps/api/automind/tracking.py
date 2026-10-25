import importlib.metadata
import logging
import platform
import subprocess

from sqlalchemy.orm import Session

from automind.config import get_settings
from automind.db import Evaluation, Experiment

logger = logging.getLogger(__name__)


def provenance(seed: int, checksum: str, model: str) -> dict:
    try:
        commit = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], stderr=subprocess.DEVNULL, timeout=3, text=True
        ).strip()
    except (OSError, subprocess.SubprocessError):
        commit = "uncommitted"
    dependencies = {}
    for package in (
        "automind-ai",
        "numpy",
        "pandas",
        "pillow",
        "scikit-learn",
        "torch",
        "torchvision",
        "transformers",
        "peft",
        "trl",
        "datasets",
        "xgboost",
        "xgboost-cpu",
        "faiss-cpu",
    ):
        try:
            dependencies[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            pass
    return {
        "git_commit": commit,
        "seed": seed,
        "dataset_checksum": checksum,
        "model_identifier": model,
        "python": platform.python_version(),
        "hardware": platform.platform(),
        "dependencies": dependencies,
    }


def record_experiment(
    db: Session,
    module: str,
    model: str,
    version: str | None,
    config: dict,
    metrics: dict,
    duration: float,
    checksum: str,
    artifacts: dict | None = None,
) -> Experiment:
    info = provenance(config.get("seed", 42), checksum, model)
    experiment = Experiment(
        module=module,
        model=model,
        dataset_version_id=version,
        config=config,
        provenance=info,
        duration_seconds=duration,
    )
    db.add(experiment)
    db.flush()
    db.add(Evaluation(experiment_id=experiment.id, metrics=metrics, artifacts=artifacts or {}))
    # Local DB is authoritative. Remote tracking outage must not destroy a valid experiment.
    try:
        import mlflow

        mlflow.set_tracking_uri(get_settings().mlflow_tracking_uri)
        mlflow.set_experiment(f"automind-{module}")
        with mlflow.start_run(run_name=model) as run:
            mlflow.log_params({k: str(v)[:500] for k, v in config.items()})
            mlflow.log_metrics({k: float(v) for k, v in metrics.items() if isinstance(v, (int, float))})
            mlflow.log_dict(info, "provenance.json")
            mlflow.log_dict(metrics, "evaluation.json")
            mlflow.log_dict(artifacts or {}, "artifact-references.json")
            experiment.mlflow_run_id = run.info.run_id
    except Exception as exc:
        logger.warning("MLflow mirror unavailable: %s", type(exc).__name__)
    return experiment
