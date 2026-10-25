import io

import pytest
from automind.ml.vision_training import classification_metrics, image_manifest, split_manifest
from automind.vision import validate_image
from PIL import Image


def test_safe_image_decoding():
    with pytest.raises(ValueError):
        validate_image(b"not an image")
    stream = io.BytesIO()
    Image.new("RGB", (32, 32), "red").save(stream, format="PNG")
    assert validate_image(stream.getvalue()).size == (32, 32)


def test_classification_metrics():
    result = classification_metrics([0, 0, 1, 1], [0, 1, 1, 1], ["scratch", "pitting"])
    assert result["accuracy"] == 0.75
    assert result["confusion_matrix"] == [[1, 1], [0, 2]]
    assert result["accuracy_wilson_95"][0] < 0.75 < result["accuracy_wilson_95"][1]


def test_image_duplicate_detection(tmp_path):
    for label in ("scratch", "pitting"):
        directory = tmp_path / label
        directory.mkdir()
        Image.new("RGB", (32, 32), "red").save(directory / "one.png")
    with pytest.raises(ValueError, match="Duplicate image pixels"):
        image_manifest(tmp_path)


def test_image_splits_no_leakage():
    rows = [
        {"path": str(i), "checksum": str(i), "label": "scratch" if i < 20 else "pitting"} for i in range(40)
    ]
    split = split_manifest(rows, 42)
    groups = [{r["checksum"] for r in split[key]} for key in ("train", "validation", "test")]
    assert not (groups[0] & groups[1] or groups[1] & groups[2] or groups[0] & groups[2])
    assert sum(map(len, groups)) == 40
