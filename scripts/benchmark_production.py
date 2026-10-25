import argparse
import json
from pathlib import Path

from automind.db import SessionLocal
from automind.production import forecast, ingest_frame, inventory_simulation, synthetic_data
from automind.schemas import ForecastRequest, SimulationRequest, SyntheticRequest

parser = argparse.ArgumentParser()
parser.add_argument("--models", nargs="+", default=["seasonal_naive", "xgboost"])
parser.add_argument("--seed", type=int, default=42)
parser.add_argument("--output", type=Path, default=Path("experiments/reports/production.json"))
args = parser.parse_args()
with SessionLocal() as db:
    version = ingest_frame(db, synthetic_data(SyntheticRequest(seed=args.seed)), "Synthetic benchmark", True)
    results = []
    for component in version["components"]:
        for model in args.models:
            result = forecast(db, ForecastRequest(version_id=version["id"], component=component, model=model))
            results.append(
                {
                    k: result[k]
                    for k in ("model", "component", "metrics", "baseline_metrics", "latency_ms", "synthetic")
                }
            )
    simulation = inventory_simulation(
        db, SimulationRequest(version_id=version["id"], component=version["components"][0])
    )
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(
    json.dumps(
        {"seed": args.seed, "dataset": version, "results": results, "inventory_simulation": simulation},
        indent=2,
    )
)
print(f"Saved actual synthetic-data benchmark to {args.output}")
