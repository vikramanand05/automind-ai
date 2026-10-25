"""Optional CPU mechanics checks. Random weights and toy data are not industrial performance."""

import numpy as np
import pytest

torch = pytest.importorskip("torch", reason="Install optional CPU ML dependencies")
pytestmark = pytest.mark.ml


@pytest.mark.parametrize("architecture", ["resnet50", "efficientnet_b0", "vit_b_16"])
def test_architecture_forward_and_attribution_with_random_fixture_weights(architecture):
    from automind.ml.vision_training import build_model
    from automind.vision import attribution

    torch.set_num_threads(1)
    torch.manual_seed(42)
    model = build_model(architecture, classes=2, pretrained=False)
    model.eval()
    image = torch.randn(1, 3, 224, 224)
    with torch.inference_mode():
        assert model(image).shape == (1, 2)
    heat, method = attribution(model, image, architecture, 0)
    assert heat.ndim == 2 and np.isfinite(heat).all()
    assert "ViT" in method if architecture == "vit_b_16" else method == "Grad-CAM"


def test_lstm_cpu_fit_forecast_and_safe_checkpoint(tmp_path):
    from automind.ml.forecasting import lstm_predict
    from automind.production import synthetic_data
    from automind.schemas import SyntheticRequest

    frame = synthetic_data(SyntheticRequest(days=60, components=1))
    prediction = lstm_predict(
        frame, 7, {"epochs": 2, "learning_rate": 0.01, "seed": 42, "hidden_size": 8}, artifact_dir=tmp_path
    )
    assert len(prediction) == 7 and all(np.isfinite(p) and p >= 0 for p in prediction)
    assert (tmp_path / "model.safetensors").is_file()


def test_vision_api_with_explicit_random_checkpoint_fixture(tmp_path, db, client, monkeypatch):
    import io

    from automind.config import get_settings
    from automind.db import ModelRecord
    from automind.ml.vision_training import build_model
    from PIL import Image
    from safetensors.torch import save_file

    torch.set_num_threads(1)
    model = build_model("efficientnet_b0", 2, pretrained=False)
    path = tmp_path / "random-fixture.safetensors"
    save_file({key: value.contiguous() for key, value in model.state_dict().items()}, str(path))
    fixture = ModelRecord(
        name="random-checkpoint-fixture",
        module="vision",
        version="test-only",
        state="active",
        artifact=str(path),
        metadata_json={
            "architecture": "efficientnet_b0",
            "classes": ["fixture-a", "fixture-b"],
            "fixture": True,
        },
    )
    db.add(fixture)
    db.commit()
    monkeypatch.setattr(get_settings(), "storage_dir", tmp_path)
    image = io.BytesIO()
    Image.new("RGB", (64, 64), "gray").save(image, format="PNG")
    response = client.post(
        "/api/v1/vision/predict", files={"file": ("fixture.png", image.getvalue(), "image/png")}
    )
    assert response.status_code == 200, response.text
    assert response.json()["model_version"] == "test-only"
    assert response.json()["predicted_class"] in ("fixture-a", "fixture-b")
    assert 0 <= response.json()["confidence"] <= 1
    assert client.get(response.json()["explanation_artifact"]).status_code == 200


def test_full_trl_lora_pipeline_with_explicit_random_local_fixture(tmp_path, db, monkeypatch):
    """Exercises TRL/PEFT/checkpointing; excludes industrial quality claims and external downloads."""
    import json

    from automind.config import get_settings
    from automind.ml.llm import train_lora
    from tokenizers import Tokenizer
    from tokenizers.models import WordLevel
    from tokenizers.pre_tokenizers import Whitespace
    from transformers import LlamaConfig, LlamaForCausalLM, PreTrainedTokenizerFast

    model_dir = tmp_path / "random-fixture-model"
    raw = Tokenizer(
        WordLevel(
            {"<unk>": 0, "<pad>": 1, "<eos>": 2, "Question": 3, "Answer": 4, "inspection": 5, "record": 6},
            unk_token="<unk>",
        )
    )
    raw.pre_tokenizer = Whitespace()
    tokenizer = PreTrainedTokenizerFast(
        tokenizer_object=raw, unk_token="<unk>", pad_token="<pad>", eos_token="<eos>"
    )
    tokenizer.save_pretrained(model_dir)
    tiny = LlamaForCausalLM(
        LlamaConfig(
            vocab_size=7,
            hidden_size=32,
            intermediate_size=64,
            num_hidden_layers=1,
            num_attention_heads=2,
            num_key_value_heads=2,
            eos_token_id=2,
            pad_token_id=1,
        )
    )
    tiny.save_pretrained(model_dir, safe_serialization=True)
    dataset = tmp_path / "fixture.jsonl"
    dataset.write_text(
        "\n".join(json.dumps({"text": f"Question {i} inspection Answer record"}) for i in range(20))
    )
    settings = get_settings()
    monkeypatch.setattr(settings, "model_allowlist", [str(model_dir)])
    monkeypatch.setattr(settings, "storage_dir", tmp_path)
    monkeypatch.setattr(settings, "mlflow_tracking_uri", "sqlite:///" + str(tmp_path / "tracking.db"))
    result = train_lora(
        {
            "model": str(model_dir),
            "dataset": str(dataset),
            "seed": 42,
            "learning_rate": 0.001,
            "batch_size": 2,
            "gradient_accumulation": 1,
            "epochs": 1,
            "max_sequence_length": 32,
            "lora_rank": 2,
            "lora_alpha": 4,
            "dropout": 0.0,
            "quantization": "none",
        }
    )
    from pathlib import Path

    assert (Path(result["checkpoint"]) / "adapter_model.safetensors").is_file()
    assert result["split_sizes"] == {"train": 16, "validation": 2, "test": 2}
    assert np.isfinite(result["test_metrics"]["eval_loss"])


def test_mlflow_metadata_mirror_to_temporary_sqlite_store(tmp_path, db, monkeypatch):
    import mlflow
    from automind.config import get_settings
    from automind.tracking import record_experiment

    uri = "sqlite:///" + str(tmp_path / "mlflow.db")
    monkeypatch.setattr(get_settings(), "mlflow_tracking_uri", uri)
    experiment = record_experiment(
        db,
        "fixture",
        "tracking-smoke",
        None,
        {"seed": 42},
        {"fixture_metric": 0.5},
        0.01,
        "explicit-test-fixture",
    )
    db.commit()
    assert experiment.mlflow_run_id is not None
    run = mlflow.tracking.MlflowClient(tracking_uri=uri).get_run(experiment.mlflow_run_id)
    assert run.data.metrics["fixture_metric"] == 0.5
