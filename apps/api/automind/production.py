"""Validated demand ingestion, temporal backtesting and inventory simulation."""

import hashlib
import io
from statistics import NormalDist
from time import perf_counter

import numpy as np
import pandas as pd
import pandera.pandas as pa
from sqlalchemy import select
from sqlalchemy.orm import Session

from automind.config import get_settings
from automind.db import (
    Audit,
    Component,
    Dataset,
    DatasetVersion,
    Demand,
    Forecast,
    Inventory,
    PipelineExecution,
)
from automind.schemas import ForecastRequest, SimulationRequest, SyntheticRequest

COLUMNS = [
    "component_id",
    "product_category",
    "date",
    "demand",
    "production_volume",
    "inventory_level",
    "supplier_lead_time",
    "supplier_reliability",
    "unit_cost",
    "production_capacity",
    "shortage_events",
]
SCHEMA = pa.DataFrameSchema(
    {
        "component_id": pa.Column(str, pa.Check.str_matches(r"^[A-Za-z0-9_-]{1,100}$")),
        "product_category": pa.Column(str),
        "date": pa.Column("datetime64[ns]"),
        **{
            key: pa.Column(float, pa.Check.ge(0), coerce=True)
            for key in ["demand", "production_volume", "inventory_level", "unit_cost", "production_capacity"]
        },
        "supplier_lead_time": pa.Column(float, pa.Check.in_range(1, 365), coerce=True),
        "supplier_reliability": pa.Column(float, pa.Check.in_range(0, 1), coerce=True),
        "shortage_events": pa.Column(float, pa.Check.in_range(0, 1), coerce=True),
    },
    strict=True,
    coerce=True,
)


def synthetic_data(request: SyntheticRequest) -> pd.DataFrame:
    rng = np.random.default_rng(request.seed)
    dates = pd.date_range("2024-01-01", periods=request.days)
    rows = []
    for i in range(request.components):
        stock = 1000.0
        for t, date in enumerate(dates):
            demand = max(0, round(75 + 25 * i + 18 * np.sin(2 * np.pi * t / 7) + 0.07 * t + rng.normal(0, 8)))
            production = max(0, round(80 + 25 * i + rng.normal(0, 10)))
            shortage = int(demand > stock + production)
            stock = max(0, stock + production - demand)
            rows.append(
                [
                    f"CMP-{i + 1:03}",
                    ["Drivetrain", "Electronics", "Bodywork"][i % 3],
                    date,
                    demand,
                    production,
                    stock,
                    5 + i,
                    0.94 - 0.02 * i if i < 10 else 0.75,
                    12.5 + i * 8,
                    160 + i * 40,
                    shortage,
                ]
            )
    return pd.DataFrame(rows, columns=COLUMNS)


def validate_frame(frame: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    if set(frame.columns) != set(COLUMNS):
        raise ValueError("CSV requires exactly: " + ", ".join(COLUMNS))
    if len(frame) > 100_000:
        raise ValueError("Dataset exceeds 100,000 rows")
    if len(frame) < 35:
        raise ValueError("Dataset requires at least 35 rows")
    frame = frame.copy()
    frame["date"] = pd.to_datetime(frame["date"], errors="raise").dt.normalize()
    if frame[["component_id", "date", "demand"]].isna().any().any():
        raise ValueError("Component, date and demand must not contain missing values")
    duplicates = int(frame.duplicated(["component_id", "date"]).sum())
    conflicts = frame[frame.duplicated(["component_id", "date"], keep=False)]
    for _, group in conflicts.groupby(["component_id", "date"]):
        if len(group.drop_duplicates()) > 1:
            raise ValueError("Conflicting duplicate component/date rows")
    frame = frame.drop_duplicates(["component_id", "date"]).sort_values(["component_id", "date"])
    # Forward fill within component only. Never fill from future values.
    missing = int(frame.isna().sum().sum())
    optional = [c for c in COLUMNS if c not in ("component_id", "date", "demand")]
    frame[optional] = frame.groupby("component_id", sort=False)[optional].ffill()
    frame = SCHEMA.validate(frame, lazy=True)
    for _, group in frame.groupby("component_id"):
        if len(group) < 35:
            raise ValueError("Each component requires at least 35 daily observations")
        if not group.date.diff().dropna().eq(pd.Timedelta(days=1)).all():
            raise ValueError("Each component must have a continuous daily series")
    if not np.isfinite(frame.select_dtypes("number").to_numpy()).all():
        raise ValueError("All numeric values must be finite")
    return frame, {
        "valid": True,
        "duplicates_removed": duplicates,
        "missing_before": missing,
        "missing_after": int(frame.isna().sum().sum()),
        "rows": len(frame),
        "components": int(frame.component_id.nunique()),
    }


def ingest_frame(db: Session, frame: pd.DataFrame, name: str, synthetic: bool) -> dict:
    frame, quality = validate_frame(frame)
    content = frame.to_csv(index=False, date_format="%Y-%m-%d").encode()
    checksum = hashlib.sha256(content + str(synthetic).encode()).hexdigest()
    existing = db.scalar(select(DatasetVersion).where(DatasetVersion.checksum == checksum))
    if existing:
        return version_dict(db, existing) | {"duplicate": True}
    path = get_settings().storage_dir / "datasets" / f"{checksum}.csv"
    path.parent.mkdir(exist_ok=True, parents=True)
    path.write_bytes(content)
    dataset = Dataset(name=name[:255], kind="production", synthetic=synthetic)
    db.add(dataset)
    db.flush()
    version = DatasetVersion(
        dataset_id=dataset.id, checksum=checksum, artifact=str(path), row_count=len(frame), quality=quality
    )
    db.add(version)
    db.flush()
    for code, group in frame.groupby("component_id"):
        component = db.scalar(select(Component).where(Component.code == code))
        if component is None:
            component = Component(code=code, category=str(group.iloc[0].product_category))
            db.add(component)
            db.flush()
        for row in group.to_dict("records"):
            day = row["date"].strftime("%Y-%m-%d")
            db.add(
                Demand(
                    component_id=component.id,
                    version_id=version.id,
                    date=day,
                    demand=row["demand"],
                    features={k: v for k, v in row.items() if k not in ("date", "component_id")},
                )
            )
            db.add(
                Inventory(
                    component_id=component.id, version_id=version.id, date=day, level=row["inventory_level"]
                )
            )
    db.add(PipelineExecution(status="completed", dataset_version_id=version.id, report=quality))
    db.add(Audit(action="dataset.ingest", target=version.id, detail={"synthetic": synthetic}))
    db.commit()
    return version_dict(db, version) | {"duplicate": False}


def version_dict(db: Session, version: DatasetVersion) -> dict:
    dataset = db.get(Dataset, version.dataset_id)
    frame = pd.read_csv(version.artifact)
    return {
        "id": version.id,
        "name": dataset.name,
        "synthetic": dataset.synthetic,
        "rows": version.row_count,
        "checksum": version.checksum,
        "quality": version.quality,
        "components": frame.component_id.unique().tolist(),
        "created_at": version.created_at.isoformat(),
    }


def load_component(db: Session, version_id: str, component: str) -> tuple[pd.DataFrame, DatasetVersion]:
    version = db.get(DatasetVersion, version_id)
    if not version:
        raise ValueError("Dataset version not found")
    frame = pd.read_csv(version.artifact, parse_dates=["date"])
    frame = frame[frame.component_id == component].sort_values("date").reset_index(drop=True)
    if frame.empty:
        raise ValueError("Component not present in this dataset version")
    return frame, version


def features(frame: pd.DataFrame) -> pd.DataFrame:
    result = pd.DataFrame(index=frame.index)
    for lag in (1, 7, 14):
        result[f"lag_{lag}"] = frame.demand.shift(lag)
    result["rolling_7"] = frame.demand.shift(1).rolling(7).mean()
    result["rolling_14"] = frame.demand.shift(1).rolling(14).mean()
    result["day_sin"] = np.sin(2 * np.pi * frame.date.dt.dayofweek / 7)
    result["day_cos"] = np.cos(2 * np.pi * frame.date.dt.dayofweek / 7)
    return result


def metrics(actual, predicted) -> dict:
    y, p = np.asarray(actual, dtype=float), np.asarray(predicted, dtype=float)
    error = p - y
    denom = float(np.abs(y).sum())
    return {
        "mae": float(np.abs(error).mean()),
        "rmse": float(np.sqrt((error**2).mean())),
        "wape": float(np.abs(error).sum() / denom) if denom else None,
        "bias": float(error.mean()),
    }


def predict_future(
    frame: pd.DataFrame, horizon: int, model_name: str, model_config=None
) -> tuple[list[float], dict]:
    if model_name == "seasonal_naive":
        values = frame.demand.tolist()
        for _ in range(horizon):
            values.append(float(values[-7]))
        return values[-horizon:], {}
    if model_name == "lstm":
        from automind.ml.forecasting import lstm_predict

        return lstm_predict(frame, horizon, model_config), {}
    from xgboost import XGBRegressor

    x = features(frame)
    valid = x.notna().all(axis=1)
    model = XGBRegressor(n_estimators=80, max_depth=3, learning_rate=0.05, random_state=42, n_jobs=1)
    model.fit(x[valid], frame.demand[valid])
    history = frame[["date", "demand"]].copy()
    predictions = []
    for _ in range(horizon):
        next_date = history.date.iloc[-1] + pd.Timedelta(days=1)
        extended = pd.concat(
            [history, pd.DataFrame({"date": [next_date], "demand": [np.nan]})], ignore_index=True
        )
        prediction = max(0.0, float(model.predict(features(extended).iloc[[-1]])[0]))
        predictions.append(prediction)
        extended.loc[len(extended) - 1, "demand"] = prediction
        history = extended
    explanation = {
        "method": "xgboost_gain",
        "features": dict(zip(x.columns, map(float, model.feature_importances_), strict=True)),
    }
    try:
        import shap

        values = shap.TreeExplainer(model)(x[valid].tail(1)).values[0]
        explanation = {
            "method": "SHAP TreeExplainer",
            "features": dict(zip(x.columns, map(float, values), strict=True)),
        }
    except ImportError:
        pass
    return predictions, explanation


def backtest(frame: pd.DataFrame, model: str, horizon: int = 7, model_config=None) -> tuple[dict, list[dict]]:
    # Three non-overlapping rolling origins; train includes only dates strictly before each origin.
    points = []
    horizon = min(horizon, max(1, (len(frame) - 28) // 3))
    for end in range(len(frame) - 3 * horizon, len(frame), horizon):
        train, test = frame.iloc[:end], frame.iloc[end : end + horizon]
        predictions, _ = predict_future(train, len(test), model, model_config)
        points.extend(
            {"date": date.strftime("%Y-%m-%d"), "actual": float(actual), "predicted": float(pred)}
            for date, actual, pred in zip(test.date, test.demand, predictions, strict=True)
        )
    return metrics([p["actual"] for p in points], [p["predicted"] for p in points]), points


def forecast(db: Session, request: ForecastRequest) -> dict:
    from automind.tracking import record_experiment

    start = perf_counter()
    frame, version = load_component(db, request.version_id, request.component)
    evaluated, points = backtest(frame, request.model)
    baseline, _ = backtest(frame, "seasonal_naive")
    prediction_start = perf_counter()
    predictions, explanation = predict_future(frame, request.horizon, request.model)
    latency = (perf_counter() - prediction_start) * 1000
    dates = pd.date_range(frame.date.iloc[-1] + pd.Timedelta(days=1), periods=request.horizon)
    residual = np.array([p["actual"] - p["predicted"] for p in points])
    width = float(np.quantile(np.abs(residual), 0.9))
    result = {
        "component": request.component,
        "model": request.model,
        "version_id": version.id,
        "synthetic": db.get(Dataset, version.dataset_id).synthetic,
        "metrics": evaluated,
        "baseline_metrics": baseline,
        "backtest": points,
        "history": [
            {
                "date": r.date.strftime("%Y-%m-%d"),
                "actual": float(r.demand),
                "inventory": float(r.inventory_level),
            }
            for r in frame.tail(60).itertuples()
        ],
        "forecast": [
            {
                "date": d.strftime("%Y-%m-%d"),
                "predicted": round(p, 2),
                "lower": round(max(0, p - width), 2),
                "upper": round(p + width, 2),
            }
            for d, p in zip(dates, predictions, strict=True)
        ],
        "interval_method": "90th percentile absolute backtest residual; uncalibrated, not a guarantee",
        "latency_ms": round(latency, 2),
        "explanation": explanation,
    }
    stored = Forecast(version_id=version.id, component=request.component, model=request.model, result=result)
    db.add(stored)
    record_experiment(
        db,
        "production",
        request.model,
        version.id,
        request.model_dump(),
        evaluated | {"latency_ms": latency},
        perf_counter() - start,
        version.checksum,
    )
    db.commit()
    return result | {"id": stored.id}


def inventory_simulation(db: Session, request: SimulationRequest) -> dict:
    frame, version = load_component(db, request.version_id, request.component)
    # Estimate policy from the first 70%; evaluate only on the remaining chronological holdout.
    split = int(len(frame) * 0.7)
    train, test = frame.iloc[:split], frame.iloc[split:]
    mean = float(train.demand.mean())
    uncertainty = float(train.demand.std())
    lead = int(np.ceil(train.supplier_lead_time.iloc[-1]))
    reliability = float(train.supplier_reliability.iloc[-1])
    cost = float(train.unit_cost.iloc[-1])
    z = NormalDist().inv_cdf(request.service_target)
    safety = float(z * uncertainty * np.sqrt(lead))
    reorder = mean * lead + safety
    order_quantity = max(1, round(mean * 7))
    rng = np.random.default_rng(request.seed)

    def simulate(point):
        stock = float(train.inventory_level.iloc[-1])
        orders: list[tuple[int, float]] = []
        levels, lost, events = [], 0.0, 0
        for day, demand in enumerate(test.demand):
            arrived = sum(qty for arrival, qty in orders if arrival <= day)
            orders = [(arrival, qty) for arrival, qty in orders if arrival > day]
            stock += arrived
            shortage = max(0, demand - stock)
            lost += shortage
            events += int(shortage > 0)
            stock = max(0, stock - demand)
            levels.append(stock)
            position = stock + sum(qty for _, qty in orders)
            while position <= point:
                delay = 0 if rng.random() <= reliability else lead
                orders.append((day + lead + delay, order_quantity))
                position += order_quantity
        holding = float(sum(levels) * cost * request.holding_rate / 365)
        return {
            "stockout_frequency": events / len(test),
            "average_inventory": float(np.mean(levels)),
            "holding_cost": holding,
            "stockout_cost": lost * request.stockout_penalty,
            "service_level": 1 - lost / max(1, float(test.demand.sum())),
            "lost_units": lost,
        }

    rng_state = rng.bit_generator.state
    baseline = simulate(mean * lead)
    rng.bit_generator.state = rng_state
    proposed = simulate(reorder)
    latest_stock = float(frame.inventory_level.iloc[-1])
    return {
        "component": request.component,
        "simulation": True,
        "synthetic": db.get(Dataset, version.dataset_id).synthetic,
        "reorder_point": round(reorder, 2),
        "safety_stock": round(safety, 2),
        "order_quantity": order_quantity,
        "current_inventory": latest_stock,
        "shortage_risk": "high"
        if latest_stock < mean * lead
        else "moderate"
        if latest_stock < reorder
        else "low",
        "recommendation": "reorder" if latest_stock <= reorder else "monitor",
        "baseline": baseline,
        "proposed": proposed,
        "assumptions": {
            "service_target": request.service_target,
            "lead_time_days": lead,
            "supplier_reliability": reliability,
            "annual_holding_rate": request.holding_rate,
            "stockout_penalty_per_unit": request.stockout_penalty,
            "seed": request.seed,
            "policy_fit_rows": len(train),
            "holdout_rows": len(test),
            "demand": "historical holdout replay",
            "unmet_demand": "lost sales",
            "supplier_delay": "independent lead-time delay when delivery is unreliable",
            "cost_units": "dataset currency; simulation only, no actual savings claimed",
        },
    }


def read_csv(data: bytes) -> pd.DataFrame:
    return pd.read_csv(io.BytesIO(data))
