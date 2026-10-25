"""Actual one-epoch training mechanics on synthetic patterns, not industrial quality."""

import numpy as np
import pytest
from PIL import Image

torch = pytest.importorskip("torch")
pytestmark = pytest.mark.ml


def test_full_vision_training_with_synthetic_fixture(tmp_path, db, monkeypatch):
    from pathlib import Path

    from automind.config import get_settings
    from automind.db import ModelRecord
    from automind.ml.vision_training import train_vision

    torch.set_num_threads(1)
    rng = np.random.default_rng(42)
    root = tmp_path / "synthetic-imagefolder"
    for label in ("fixture_horizontal", "fixture_vertical"):
        folder = root / label
        folder.mkdir(parents=True)
        for index in range(10):
            pixels = rng.integers(0, 40, (32, 32, 3), dtype="uint8")
            if label.endswith("horizontal"):
                pixels[12:18, :, :] = 220
            else:
                pixels[:, 12:18, :] = 220
            Image.fromarray(pixels).save(folder / f"{index}.png")
    monkeypatch.setattr(get_settings(), "storage_dir", tmp_path)
    monkeypatch.setattr(get_settings(), "mlflow_tracking_uri", "sqlite:///" + str(tmp_path / "tracking.db"))
    result = train_vision(
        {
            "architecture": "efficientnet_b0",
            "dataset": str(root),
            "adapter": "imagefolder",
            "pretrained": False,
            "freeze_backbone": True,
            "optimizer": "adamw",
            "device": "cpu",
            "seed": 42,
            "learning_rate": 0.001,
            "batch_size": 4,
            "epochs": 1,
            "patience": 1,
        }
    )
    assert Path(result["checkpoint"]).is_file()
    assert Path(result["checkpoint"]).with_name("evaluation.json").is_file()
    registered = db.get(ModelRecord, result["model_id"])
    assert registered.state == "candidate"
    assert len(result["metrics"]["confusion_matrix"]) == 2
