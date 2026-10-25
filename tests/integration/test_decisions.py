import hashlib
import io
from types import SimpleNamespace

import pytest
from automind import decision_api, decisions
from automind.config import get_settings
from automind.db import DecisionReview, Investigation, ModelRecord
from PIL import Image


@pytest.fixture
def queued_dispatch(monkeypatch):
    """Explicit broker stub for focused API tests; separate real-worker test covers delivery."""
    monkeypatch.setattr(decision_api, "dispatch", lambda *_: SimpleNamespace(id="broker-stub-fixture"))


def complete_demo(client, db):
    response = client.post("/api/v1/decisions/demo")
    assert response.status_code == 201, response.text
    identifier = response.json()["id"]
    db.expire_all()
    token = db.get(Investigation, identifier).job_token
    assert decisions.run_pipeline(identifier, token, "analyze", {})["state"] == "completed"
    return client.get(f"/api/v1/decisions/investigations/{identifier}").json()


def review_payload(item, action="approve"):
    return {
        "action": action,
        "recommendation_id": item["recommendation"]["id"],
        "evidence_hash": item["recommendation"]["evidence_hash"],
        "comments": "Synthetic software verification only; no operational action.",
        "acknowledge_limitations": True,
    }


def credentials(monkeypatch):
    monkeypatch.setattr(get_settings(), "decision_reviewer_id", "test-reviewer")
    monkeypatch.setattr(
        get_settings(), "decision_review_token_sha256", hashlib.sha256(b"test-review-only-token").hexdigest()
    )
    return {"X-Reviewer-ID": "test-reviewer", "X-Review-Token": "test-review-only-token"}


def test_non_ascii_reviewer_is_rejected_without_server_error(monkeypatch):
    from fastapi import HTTPException

    credentials(monkeypatch)
    with pytest.raises(HTTPException) as error:
        decision_api.reviewer_identity("réviewer", "test-review-only-token")
    assert error.value.status_code == 403


def test_demo_creation_actual_rag_impact_and_recommendation(client, db, queued_dispatch):
    item = complete_demo(client, db)
    assert item["synthetic"] and item["input"]["synthetic_demonstration"]
    assert item["quality"]["source"] == "synthetic_demo"
    assert item["quality"]["prediction"]["available"] is False
    assert "confidence" not in item["quality"]["prediction"]
    assert item["stages"]["defect_analysis"]["state"] == "requires_review"
    evidence = item["stages"]["knowledge_retrieval"]["result"]
    assert evidence["sources"] and evidence["sources"][0]["document_checksum"]
    assert evidence["possible_causes"] and evidence["verified_root_cause"] is False
    impact = item["impact"]
    assert impact["usable_inventory"] == impact["recorded_inventory"] - 12
    assert impact["potential_shortage"] == pytest.approx(
        max(0, impact["forecast_demand"] - impact["usable_inventory"]), abs=0.002
    )
    assert impact["evaluation_id"] and impact["forecast_id"]
    assert len(item["scenarios"]) == 4
    assert item["recommendation"]["requires_human_approval"]
    assert item["recommendation"]["selected_scenario"] in "ABCD"
    assert item["status"] == "Draft" and item["operational_action_performed"] is False
    assert all(a["detail"]["operational_action_performed"] is False for a in item["audit"])


def test_authenticated_review_workflow_and_immutable_evidence(client, db, queued_dispatch, monkeypatch):
    item = complete_demo(client, db)
    identifier = item["id"]
    headers = credentials(monkeypatch)
    payload = review_payload(item)
    endpoint = f"/api/v1/decisions/{identifier}/review"
    assert client.post(endpoint, json=payload).status_code == 401
    assert (
        client.post(endpoint, json=payload, headers={**headers, "X-Review-Token": "wrong"}).status_code == 403
    )
    assert (
        client.post(endpoint, json=payload, headers={**headers, "X-Reviewer-ID": "unlisted-user"}).status_code
        == 403
    )
    assert client.post(endpoint, json=payload, headers=headers).status_code == 409  # still Draft
    assert (
        client.post(f"/api/v1/decisions/investigations/{identifier}/submit").json()["status"]
        == "Awaiting Review"
    )
    assert client.get("/api/v1/decisions/investigations").json()["overview"]["pending_decisions"] == 1
    assert client.post(f"/api/v1/decisions/investigations/{identifier}/analyze", json={}).status_code == 409
    assert (
        client.post(endpoint, json={**payload, "evidence_hash": "0" * 64}, headers=headers).status_code == 409
    )
    assert (
        client.post(endpoint, json={**payload, "acknowledge_limitations": False}, headers=headers).status_code
        == 422
    )
    reviewed = client.post(endpoint, json=payload, headers=headers)
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["status"] == "Approved"
    assert reviewed.json()["reviews"][0]["reviewer"] == "test-reviewer"
    assert reviewed.json()["operational_action_performed"] is False
    assert client.post(endpoint, json=payload, headers=headers).status_code == 409  # replay blocked
    closed = client.post(endpoint, json=review_payload(item, "close"), headers=headers).json()
    assert closed["status"] == "Closed" and len(closed["reviews"]) == 2
    overview = client.get("/api/v1/decisions/investigations").json()
    assert overview["overview"]["active_investigations"] == 0
    assert overview["recent_completed"][0]["id"] == identifier
    db.expire_all()
    assert len(db.query(DecisionReview).all()) == 2


def test_review_fails_closed_without_credentials_configuration(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "decision_review_token_sha256", "")
    payload = {
        "action": "approve",
        "recommendation_id": "unknown",
        "evidence_hash": "0" * 64,
        "comments": "No credentials configured",
        "acknowledge_limitations": True,
    }
    assert client.post("/api/v1/decisions/missing/review", json=payload).status_code == 503


def test_reject_and_close_do_not_execute_production_changes(client, db, queued_dispatch, monkeypatch):
    item = complete_demo(client, db)
    headers = credentials(monkeypatch)
    client.post(f"/api/v1/decisions/investigations/{item['id']}/submit")
    endpoint = f"/api/v1/decisions/{item['id']}/review"
    rejected = client.post(endpoint, headers=headers, json=review_payload(item, "reject")).json()
    assert rejected["status"] == "Rejected" and not rejected["operational_action_performed"]
    assert client.post(endpoint, headers=headers, json=review_payload(item, "approve")).status_code == 409


def test_image_attachment_invalidates_stale_recommendations(client, db, queued_dispatch):
    item = complete_demo(client, db)
    buffer = io.BytesIO()
    Image.new("RGB", (24, 24), "gray").save(buffer, format="PNG")
    attached = client.post(
        f"/api/v1/decisions/investigations/{item['id']}/image",
        files={"file": ("fixture.png", buffer.getvalue(), "image/png")},
    )
    assert attached.status_code == 200, attached.text
    assert attached.json()["recommendation"] is None and attached.json()["impact"] is None
    assert attached.json()["quality"]["image_checksum"]
    assert client.get(attached.json()["quality"]["image_url"]).headers["content-type"] == "image/png"
    assert client.post(f"/api/v1/decisions/investigations/{item['id']}/submit").status_code == 409


def test_custom_scenarios_are_persisted_as_new_evidence(client, db, queued_dispatch):
    item = complete_demo(client, db)
    original = item["recommendation"]["id"]
    endpoint = f"/api/v1/decisions/investigations/{item['id']}/simulate"
    response = client.post(
        endpoint, json={"recovery_yield": 0.5, "replacement_quantity": 100, "supplier_delay_days": 4}
    )
    assert response.status_code == 202
    assert response.json()["recommendation"] is None
    db.expire_all()
    inv = db.get(Investigation, item["id"])
    decisions.run_pipeline(
        item["id"],
        inv.job_token,
        "simulate",
        {"recovery_yield": 0.5, "replacement_quantity": 100, "supplier_delay_days": 4},
    )
    updated = client.get(f"/api/v1/decisions/investigations/{item['id']}").json()
    assert updated["recommendation"]["id"] != original
    scenario = next(s for s in updated["scenarios"] if s["code"] == "C")
    assert scenario["replacement_quantity"] == 100
    assert len(updated["scenarios"]) == 4


def test_duplicate_jobs_invalid_inputs_and_dispatch_failure(client, db, queued_dispatch, monkeypatch):
    item = client.post("/api/v1/decisions/demo").json()
    assert client.post(f"/api/v1/decisions/investigations/{item['id']}/analyze", json={}).status_code == 409
    assert client.post("/api/v1/decisions/investigations", json={"title": "x"}).status_code == 422
    assert client.get("/api/v1/decisions/investigations/missing").status_code == 404
    db.expire_all()
    inv = db.get(Investigation, item["id"])
    inv.job_state = "failed"
    db.commit()

    def fail(*_):
        raise ConnectionError("intentional broker failure fixture")

    monkeypatch.setattr(decision_api, "dispatch", fail)
    response = client.post(f"/api/v1/decisions/investigations/{item['id']}/analyze", json={})
    assert response.status_code == 503
    assert client.get(f"/api/v1/decisions/investigations/{item['id']}").json()["job"]["state"] == "failed"


def test_optional_generation_failure_keeps_retrieved_evidence_explicit(
    client, db, queued_dispatch, monkeypatch
):
    item = client.post("/api/v1/decisions/demo").json()

    def unavailable(*_):
        raise ImportError("Explicit optional generation fixture unavailable")

    monkeypatch.setattr(decisions.knowledge, "query", unavailable)
    db.expire_all()
    inv = db.get(Investigation, item["id"])
    decisions.run_pipeline(item["id"], inv.job_token, "analyze", {"explanation_mode": "base"})
    evidence = client.get(f"/api/v1/decisions/investigations/{item['id']}").json()["stages"][
        "knowledge_retrieval"
    ]
    assert evidence["state"] == "requires_review"
    assert evidence["result"]["mode"] == "retrieval_only"
    assert evidence["result"]["requested_mode"] == "base"
    assert evidence["result"]["generation_error"] and evidence["result"]["sources"]


def test_vision_integration_wiring_with_explicit_prediction_stub(
    client, db, queued_dispatch, monkeypatch, tmp_path
):
    """Wiring only. Optional ML test exercises the actual random checkpoint pipeline."""
    item = client.post("/api/v1/decisions/demo").json()
    db.expire_all()
    inv = db.get(Investigation, item["id"])
    inv.job_state = "failed"
    model = ModelRecord(
        name="explicit-wiring-stub",
        module="vision",
        version="fixture-v1",
        state="active",
        artifact=str(tmp_path / "unused"),
    )
    db.add(model)
    db.commit()
    buffer = io.BytesIO()
    Image.new("RGB", (24, 24), "gray").save(buffer, format="PNG")
    client.post(
        f"/api/v1/decisions/investigations/{item['id']}/image",
        files={"file": ("fixture.png", buffer.getvalue())},
    )

    def prediction(session, image_data, model_id):
        assert model_id == model.id and len(image_data) > 0
        return {
            "predicted_class": "fixture-class",
            "confidence": 0.625,
            "model_version": "fixture-v1",
            "latency_ms": 0,
            "explanation_artifact": None,
            "explanation_method": "explicit test stub",
        }

    monkeypatch.setattr(decisions.vision, "predict", prediction)
    queued = client.post(f"/api/v1/decisions/investigations/{item['id']}/analyze", json={})
    assert queued.status_code == 202
    db.expire_all()
    inv = db.get(Investigation, item["id"])
    decisions.run_pipeline(item["id"], inv.job_token, "analyze", {})
    result = client.get(f"/api/v1/decisions/investigations/{item['id']}").json()
    assert result["quality"]["prediction"]["confidence"] == 0.625
    assert result["quality"]["prediction"]["kind"] == "model_prediction"
    assert (
        result["quality"]["rejected_quantity"] == 12
    )  # never extrapolate a batch reject rate from confidence
