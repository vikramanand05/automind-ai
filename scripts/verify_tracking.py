"""Verify the real MLflow HTTP mirror using measured API readiness, not a model benchmark."""

import json
import os
from pathlib import Path
from time import perf_counter

import httpx
from automind.db import SessionLocal
from automind.tracking import record_experiment

start = perf_counter()
base = os.environ.get("AUTOMIND_API_URL", "http://api:8000")
response = httpx.get(base + "/health/ready", timeout=15)
response.raise_for_status()
state = response.json()
if state.get("status") != "ready":
    raise RuntimeError("API is not ready")
with SessionLocal() as db:
    experiment = record_experiment(
        db,
        "verification",
        "mlflow-http-mirror",
        None,
        {"seed": 42, "purpose": "system integration smoke, not model performance", "api": base},
        {"api_ready": 1.0},
        perf_counter() - start,
        "not-applicable-system-check",
    )
    db.commit()
    if not experiment.mlflow_run_id:
        raise RuntimeError("MLflow HTTP mirror did not return a run ID")
    result = {
        "experiment_id": experiment.id,
        "mlflow_run_id": experiment.mlflow_run_id,
        "readiness": state,
        "benchmark": False,
    }
output = Path("experiments/reports/tracking-smoke.json")
output.write_text(json.dumps(result, indent=2), encoding="utf-8")
print(json.dumps(result))
