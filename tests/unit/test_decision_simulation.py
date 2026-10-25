import pytest
from automind.decision_schemas import InvestigationCreate, ScenarioRequest
from automind.decision_simulation import simulate_scenarios


def impact_fixture():
    return {
        "usable_inventory": 15,
        "rejected_quantity": 5,
        "supplier_lead_time_days": 1,
        "unit_cost": 2,
        "forecast": {"forecast": [{"date": f"2026-01-0{i + 1}", "predicted": 10} for i in range(3)]},
    }


def test_scenarios_conserve_original_demand_and_supplier_arrivals():
    rows = {s["code"]: s for s in simulate_scenarios(impact_fixture(), ScenarioRequest(recovery_yield=0.4))}
    assert rows["A"]["unserved_units"] == 15
    assert rows["A"]["service_level"] == 0.5
    assert rows["B"]["recovered_units_assumption"] == 2
    assert rows["B"]["unserved_units"] == 13
    assert rows["C"]["unserved_units"] == 0
    assert rows["C"]["service_level"] == 1
    assert rows["C"]["procurement_cost"] == 30
    for row in rows.values():
        assert row["original_forecast_demand"] == 30
        assert 0 <= row["service_level"] <= 1
        assert all(p["inventory"] >= 0 for p in row["curve"])
        assert row["simulation"] is True


def test_schedule_deferral_does_not_erase_shortage_or_inflate_service():
    rows = {
        s["code"]: s for s in simulate_scenarios(impact_fixture(), ScenarioRequest(schedule_shift_days=1))
    }
    assert rows["D"]["deferred_beyond_horizon"] == 10
    assert rows["D"]["unserved_units"] == 15
    assert rows["D"]["service_level"] == 0
    assert rows["D"]["holding_cost"] > rows["A"]["holding_cost"]


def test_late_replacement_is_not_counted_as_arrived_inventory():
    rows = simulate_scenarios(impact_fixture(), ScenarioRequest(supplier_delay_days=10))
    replacement = next(s for s in rows if s["code"] == "C")
    assert replacement["unserved_units"] == 15
    assert sum(p["arrivals"] for p in replacement["curve"]) == 0


def test_nonfinite_forecasts_and_invalid_parameters_are_rejected():
    impact = impact_fixture()
    impact["forecast"]["forecast"][0]["predicted"] = float("nan")
    with pytest.raises(ValueError):
        simulate_scenarios(impact, ScenarioRequest())
    for parameters in (
        {"recovery_yield": 1.1},
        {"annual_holding_rate": float("inf")},
        {"schedule_shift_days": 0},
    ):
        with pytest.raises(ValueError):
            ScenarioRequest(**parameters)


def test_reported_quantities_must_be_consistent():
    with pytest.raises(ValueError, match="rejected <= inspected"):
        InvestigationCreate(
            title="Invalid counts",
            version_id="dataset",
            component="CMP-001",
            batch_code="B-1",
            batch_quantity=10,
            inspected_quantity=5,
            rejected_quantity=6,
            reported_defect="pitting",
        )
