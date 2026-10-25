import io

import pytest
from PIL import Image

torch = pytest.importorskip("torch")
pytestmark = pytest.mark.ml


def test_decision_uses_real_fixture_checkpoint(client, db, tmp_path, monkeypatch):
    """Random-weight software fixture verifies inference/attribution, not industrial accuracy."""
    from types import SimpleNamespace

    from automind import decision_api, decisions
    from automind.config import get_settings
    from automind.db import Investigation, ModelRecord, VisionPrediction
    from automind.ml.vision_training import build_model
    from safetensors.torch import save_file
    from sqlalchemy import select

    torch.set_num_threads(1)
    torch.manual_seed(42)
    monkeypatch.setattr(decision_api, "dispatch", lambda *_: SimpleNamespace(id="test-direct-execution"))
    response = client.post("/api/v1/decisions/demo")
    identifier = response.json()["id"]
    db.expire_all()
    item = db.get(Investigation, identifier)
    # Discard only the deliberately stubbed job so an image can be attached.
    item.job_state = "idle"
    db.commit()
    monkeypatch.setattr(get_settings(), "storage_dir", tmp_path)
    model = build_model("efficientnet_b0", 2)
    checkpoint = tmp_path / "random-software-fixture.safetensors"
    save_file(model.state_dict(), str(checkpoint))
    record = ModelRecord(
        name="Random software fixture; no industrial validity",
        module="vision",
        version="fixture-v1",
        state="candidate",
        artifact=str(checkpoint),
        metadata_json={"architecture": "efficientnet_b0", "classes": ["fixture_a", "fixture_b"]},
    )
    db.add(record)
    db.commit()
    image = io.BytesIO()
    Image.new("RGB", (64, 64), (70, 100, 130)).save(image, format="PNG")
    assert (
        client.post(
            f"/api/v1/decisions/investigations/{identifier}/image",
            files={"file": ("fixture.png", image.getvalue(), "image/png")},
        ).status_code
        == 200
    )
    response = client.post(
        f"/api/v1/decisions/investigations/{identifier}/analyze", json={"model_id": record.id}
    )
    assert response.status_code == 202, response.text
    db.expire_all()
    token = db.get(Investigation, identifier).job_token
    assert (
        decisions.run_pipeline(identifier, token, "analyze", {"model_id": record.id})["state"] == "completed"
    )
    result = client.get(f"/api/v1/decisions/investigations/{identifier}").json()
    prediction = result["quality"]["prediction"]
    assert prediction["available"] and prediction["predicted_class"] in ("fixture_a", "fixture_b")
    assert 0 <= prediction["confidence"] <= 1
    assert prediction["model_version"] == "fixture-v1"
    assert prediction["inference_timestamp"] and prediction["explanation_artifact"]
    assert client.get(prediction["explanation_artifact"]).status_code == 200
    assert db.scalar(select(VisionPrediction)) is not None
    assert result["quality"]["rejected_quantity"] == 12
    assert not result["operational_action_performed"]
