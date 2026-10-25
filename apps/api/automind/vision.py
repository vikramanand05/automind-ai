import io
from time import perf_counter
from uuid import uuid4

import numpy as np
from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from automind.config import get_settings
from automind.db import ModelRecord, VisionPrediction

Image.MAX_IMAGE_PIXELS = 16_000_000


def validate_image(data: bytes) -> Image.Image:
    try:
        with Image.open(io.BytesIO(data), formats=["PNG", "JPEG", "WEBP"]) as image:
            if image.format not in ("PNG", "JPEG", "WEBP"):
                raise ValueError("Supported image formats: PNG, JPEG, WebP")
            if image.width * image.height > 16_000_000:
                raise ValueError("Image exceeds 16 million pixels")
            image.load()
            return image.convert("RGB")
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as exc:
        raise ValueError("Invalid or unsafe image") from exc


def attribution(model, tensor, architecture: str, class_index: int):
    """CNN Grad-CAM; ViT uses patch-token gradient × activation (clearly different)."""
    activation = []
    if architecture == "resnet50":
        layer = model.layer4[-1]
    elif architecture == "efficientnet_b0":
        layer = model.features[-1]
    else:
        layer = model.encoder.layers[-1].ln_1

    def hook(module, inputs, output):
        activation.append(output)
        output.retain_grad()

    handle = layer.register_forward_hook(hook)
    try:
        model.zero_grad()
        logits = model(tensor.requires_grad_(True))
        logits[0, class_index].backward()
        act = activation[0]
        if architecture == "vit_b_16":
            score = (act[:, 1:] * act.grad[:, 1:]).sum(-1).reshape(1, 14, 14).relu()
            method = "ViT patch-token gradient × activation; not CNN Grad-CAM"
        else:
            weight = act.grad.mean(dim=(2, 3), keepdim=True)
            score = (weight * act).sum(dim=1).relu()
            method = "Grad-CAM"
        heat = score.detach().cpu().numpy()[0]
        heat = (heat - heat.min()) / max(float(np.ptp(heat)), 1e-8)
        return heat, method
    finally:
        handle.remove()


def predict(db: Session, data: bytes, model_id: str | None) -> dict:
    image = validate_image(data)
    model_record = (
        db.get(ModelRecord, model_id)
        if model_id
        else db.scalar(
            select(ModelRecord).where(ModelRecord.module == "vision", ModelRecord.state == "active")
        )
    )
    if not model_record or model_record.module != "vision":
        raise HTTPException(409, "Model not trained: train, register and activate a vision checkpoint first")
    from pathlib import Path

    if not Path(model_record.artifact).is_file():
        raise HTTPException(409, "Registered checkpoint file is missing")
    try:
        import torch
        from safetensors.torch import load_file

        from automind.ml.vision_training import build_model, transforms
    except ImportError as exc:
        raise HTTPException(503, "Install the optional ml dependency group for vision inference") from exc
    metadata = model_record.metadata_json
    architecture, classes = metadata["architecture"], metadata["classes"]
    model = build_model(architecture, len(classes))
    model.load_state_dict(load_file(model_record.artifact))
    model.eval()
    tensor = transforms()(image).unsqueeze(0)
    start = perf_counter()
    with torch.inference_mode():
        probabilities = torch.softmax(model(tensor), dim=1)[0]
    confidence, index = probabilities.max(0)
    latency = (perf_counter() - start) * 1000
    heat, method = attribution(model, tensor, architecture, int(index))
    heat_image = Image.fromarray((heat * 255).astype("uint8")).resize(image.size)
    normalized = np.asarray(heat_image).astype(float) / 255
    colors = np.stack([normalized, 0.25 * (1 - normalized), 1 - normalized], axis=-1)
    overlay = (0.55 * np.asarray(image) + 0.45 * colors * 255).clip(0, 255).astype("uint8")
    output = get_settings().storage_dir / "explanations"
    output.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4()}.png"
    Image.fromarray(overlay).save(output / filename)
    result = {
        "predicted_class": classes[int(index)],
        "confidence": float(confidence),
        "model_version": model_record.version,
        "latency_ms": round(latency, 2),
        "explanation_artifact": f"/api/v1/artifacts/{filename}",
        "explanation_method": method,
    }
    db.add(VisionPrediction(model_id=model_record.id, prediction=result))
    db.commit()
    return result
