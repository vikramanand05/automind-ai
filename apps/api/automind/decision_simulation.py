"""Deterministic scenario replay, explicitly separate from model inference."""

import math

from automind.decision_schemas import ScenarioRequest

SCENARIOS = {
    "A": "Continue with usable inventory",
    "B": "Reinspect reported rejects",
    "C": "Request replacement components",
    "D": "Adjust the production schedule",
}


def simulate_scenarios(impact: dict, parameters: ScenarioRequest) -> list[dict]:
    demand = [float(p["predicted"]) for p in impact["forecast"]["forecast"]]
    if not demand or any(not math.isfinite(x) or x < 0 for x in demand):
        raise ValueError("A finite, nonnegative demand forecast is required")
    total = sum(demand)
    initial = impact["usable_inventory"]
    rejected = impact["rejected_quantity"]
    replacement = parameters.replacement_quantity or max(1, math.ceil(total - initial))
    lead = int(impact["supplier_lead_time_days"]) + parameters.supplier_delay_days
    recovered = math.floor(rejected * parameters.recovery_yield)
    results = []
    for code, name in SCENARIOS.items():
        stock, delivered, on_time, waiting_area, holding = float(initial), 0.0, 0.0, 0.0, 0.0
        backlog: list[list[float]] = []  # [original due day, remaining quantity]
        points = []
        shift = parameters.schedule_shift_days if code == "D" else 0
        for day in range(len(demand)):
            arrival = 0
            if code == "B" and day == parameters.reinspection_days:
                arrival = recovered
            if code == "C" and day == lead:
                arrival = replacement
            stock += arrival
            release_day = day - shift
            released = demand[release_day] if release_day >= 0 else 0
            if released:
                backlog.append([release_day, released])
            for cohort in backlog:
                served = min(stock, cohort[1])
                stock -= served
                cohort[1] -= served
                delivered += served
                if day <= cohort[0]:
                    on_time += served
            backlog = [c for c in backlog if c[1] > 1e-9]
            # Original due dates remain the reference even when the schedule shifts.
            original_due = sum(demand[: day + 1])
            outstanding_due = max(0.0, original_due - delivered)
            waiting_area += outstanding_due
            holding += stock * impact["unit_cost"] * parameters.annual_holding_rate / 365
            points.append(
                {
                    "date": impact["forecast"]["forecast"][day]["date"],
                    "inventory": round(stock, 3),
                    "backlog": round(outstanding_due, 3),
                    "arrivals": arrival,
                    "released_demand": released,
                }
            )
        unserved = max(0.0, total - delivered)
        deferred = sum(demand[max(0, len(demand) - shift) :]) if shift else 0
        service = on_time / total if total else 1.0
        results.append(
            {
                "code": code,
                "name": name,
                "kind": "simulation",
                "simulation": True,
                "original_forecast_demand": round(total, 3),
                "ending_inventory": round(stock, 3),
                "unserved_units": round(unserved, 3),
                "shortage_risk": "high" if unserved > 0 else "low",
                "estimated_delay_days": round(waiting_area / total, 3) if total else 0,
                "delay_definition": "Censored mean outstanding-unit days / original demand; unresolved waits may be longer",
                "holding_cost": round(holding, 4),
                "service_level": round(service, 6),
                "fulfilled_fraction": round(delivered / total, 6) if total else 1.0,
                "deferred_beyond_horizon": round(deferred, 3),
                "replacement_quantity": replacement if code == "C" else 0,
                "replacement_arrival_day": lead if code == "C" else None,
                "recovered_units_assumption": recovered if code == "B" else 0,
                "procurement_cost": round(replacement * impact["unit_cost"], 4) if code == "C" else 0,
                "reinspection_cost": round(rejected * parameters.reinspection_cost_per_unit, 4)
                if code == "B"
                else 0,
                "curve": points,
                "assumptions": parameters.model_dump()
                | {
                    "initial_usable_inventory": initial,
                    "unit_cost": impact["unit_cost"],
                    "arrival_day_zero_based": True,
                    "supplier_lead_time_days": impact["supplier_lead_time_days"],
                    "service_denominator": "All original forecast demand, including schedule-deferred units",
                    "service_definition": "Fraction fulfilled by ORIGINAL due date; not an SLA or achieved production service",
                    "supplier_variability": "Fixed assumed arrival; recorded supplier reliability is not a stochastic guarantee",
                    "quality_release": "Hypothetical recovered rejects need successful reinspection and separate release authorization",
                    "cost_units": "Dataset currency; simulated holding/procurement/inspection costs, not actual savings",
                },
            }
        )
    return results
