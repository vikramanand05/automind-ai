import numpy as np
import pandas as pd
import pytest
from automind.production import (
    backtest,
    features,
    ingest_frame,
    inventory_simulation,
    metrics,
    predict_future,
    synthetic_data,
    validate_frame,
)
from automind.schemas import SimulationRequest, SyntheticRequest
from pandera.errors import SchemaErrors


def data():
    return synthetic_data(SyntheticRequest(days=90, components=1, seed=42))


def test_generator_reproducible_and_validation():
    pd.testing.assert_frame_equal(data(), data())
    frame, report = validate_frame(pd.concat([data(), data().iloc[[0]]]))
    assert report["duplicates_removed"] == 1 and len(frame) == 90
    invalid = data()
    invalid.loc[1, "demand"] = -1
    with pytest.raises(SchemaErrors):
        validate_frame(invalid)
    gap = data().drop(index=4)
    with pytest.raises(ValueError, match="continuous"):
        validate_frame(gap)


def test_conflicting_duplicates_rejected():
    conflicting = data().iloc[[0]].copy()
    conflicting.loc[0, "demand"] += 2
    with pytest.raises(ValueError, match="Conflicting"):
        validate_frame(pd.concat([data(), conflicting]))


def test_features_cannot_see_future_demand():
    original = data()
    changed = original.copy()
    changed.loc[50:, "demand"] = 99999
    pd.testing.assert_frame_equal(features(original).iloc[:51], features(changed).iloc[:51])
    assert features(original).loc[20, "lag_1"] == original.loc[19, "demand"]


def test_seasonal_forecast_and_metric_definitions():
    frame = data()
    predictions, _ = predict_future(frame, 14, "seasonal_naive")
    assert predictions[:7] == frame.demand.tail(7).tolist()
    assert predictions[7:] == predictions[:7]
    result = metrics([10, 20], [12, 18])
    assert result["mae"] == 2 and result["rmse"] == 2 and result["bias"] == 0
    assert result["wape"] == pytest.approx(4 / 30)
    assert metrics([0, 0], [1, 1])["wape"] is None


def test_temporal_backtest():
    frame = data()
    result, points = backtest(frame, "seasonal_naive")
    assert len(points) == 21
    assert points[0]["date"] > frame.date.iloc[-22].strftime("%Y-%m-%d")
    assert all(np.isfinite(v) for v in result.values())


def test_idempotent_ingestion_and_inventory_holdout(db):
    first = ingest_frame(db, data(), "synthetic", True)
    second = ingest_frame(db, data(), "synthetic", True)
    assert second["duplicate"] and first["id"] == second["id"]
    request = SimulationRequest(version_id=first["id"], component="CMP-001")
    result = inventory_simulation(db, request)
    assert result == inventory_simulation(db, request)
    assert result["simulation"] is True
    assert result["reorder_point"] > result["safety_stock"] >= 0
    assert 0 <= result["proposed"]["service_level"] <= 1
    assert result["assumptions"]["holdout_rows"] == 28


def test_xgboost_real_temporal_predictions():
    pytest.importorskip("xgboost")
    result, points = backtest(data(), "xgboost")
    assert len(points) == 21 and result["mae"] >= 0
