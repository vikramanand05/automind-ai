import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    precision_recall_fscore_support,
)


def image_manifest(root: Path, adapter: str = "imagefolder") -> list[dict]:
    """ImageFolder class trees or NEU classification trees. MVTec anomaly task is separate."""
    if adapter not in ("imagefolder", "neu"):
        raise ValueError(
            "Classification adapters: imagefolder, neu. MVTec is an anomaly dataset, not a drop-in classifier."
        )
    rows = []
    seen = set()
    for label in sorted(p.name for p in root.iterdir() if p.is_dir()):
        for path in sorted((root / label).rglob("*")):
            if not path.is_file() or path.suffix.lower() not in (".png", ".jpg", ".jpeg", ".bmp"):
                continue
            with Image.open(path) as image:
                image.load()
                # Pixel checksum catches identical images stored with different encoding/metadata.
                rgb = image.convert("RGB")
                checksum = hashlib.sha256(str(rgb.size).encode() + rgb.tobytes()).hexdigest()
            if checksum in seen:
                raise ValueError(f"Duplicate image pixels detected: {path}")
            seen.add(checksum)
            rows.append({"path": str(path), "label": label, "checksum": checksum})
    if len({r["label"] for r in rows}) < 2:
        raise ValueError("Dataset requires at least two labelled classes")
    return rows


def split_manifest(rows: list[dict], seed: int) -> dict[str, list[dict]]:
    from sklearn.model_selection import train_test_split

    labels = [r["label"] for r in rows]
    if min(labels.count(label) for label in set(labels)) < 10:
        raise ValueError("Each class requires at least 10 unique images for stratified 60/20/20 splits")
    train, heldout = train_test_split(rows, test_size=0.4, random_state=seed, stratify=labels)
    validation, test = train_test_split(
        heldout, test_size=0.5, random_state=seed, stratify=[r["label"] for r in heldout]
    )
    return {"train": train, "validation": validation, "test": test}


def build_model(architecture: str, classes: int, pretrained: bool = False):
    import torch.nn as nn
    from torchvision import models

    if architecture == "resnet50":
        model = models.resnet50(weights=models.ResNet50_Weights.DEFAULT if pretrained else None)
        model.fc = nn.Linear(model.fc.in_features, classes)
    elif architecture == "efficientnet_b0":
        model = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.DEFAULT if pretrained else None)
        model.classifier[1] = nn.Linear(model.classifier[1].in_features, classes)
    elif architecture == "vit_b_16":
        model = models.vit_b_16(weights=models.ViT_B_16_Weights.DEFAULT if pretrained else None)
        model.heads.head = nn.Linear(model.heads.head.in_features, classes)
    else:
        raise ValueError("Unknown vision architecture")
    return model


def transforms(training=False):
    from torchvision import transforms as T

    operations = [T.Resize((224, 224))]
    if training:
        operations += [T.RandomHorizontalFlip(), T.RandomRotation(8)]
    return T.Compose(operations + [T.ToTensor(), T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])


def classification_metrics(actual, predicted, classes: list[str]) -> dict:
    labels = list(range(len(classes)))
    p, r, f, _ = precision_recall_fscore_support(
        actual, predicted, average="macro", zero_division=0, labels=labels
    )
    # Wilson interval for accuracy; not a confidence interval on industrial generalization.
    n = len(actual)
    accuracy = float(accuracy_score(actual, predicted))
    z = 1.96
    center = (accuracy + z * z / (2 * n)) / (1 + z * z / n)
    margin = z * np.sqrt(accuracy * (1 - accuracy) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return {
        "accuracy": accuracy,
        "precision_macro": float(p),
        "recall_macro": float(r),
        "f1_macro": float(f),
        "accuracy_wilson_95": [float(center - margin), float(center + margin)],
        "confusion_matrix": confusion_matrix(actual, predicted, labels=labels).tolist(),
        "per_class": classification_report(
            actual, predicted, labels=labels, target_names=classes, zero_division=0, output_dict=True
        ),
    }


def train_vision(config: dict, cancelled=lambda: False) -> dict:
    import random
    from time import perf_counter

    import torch
    from safetensors.torch import save_file
    from torch.utils.data import DataLoader, Dataset

    from automind.config import get_settings
    from automind.db import ModelRecord, SessionLocal
    from automind.tracking import record_experiment

    start = perf_counter()
    seed = config.get("seed", 42)
    config = config | {"evaluation_protocol": f"stratified-60-20-20-seed-{seed}"}
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    rows = image_manifest(Path(config["dataset"]), config.get("adapter", "imagefolder"))
    split = split_manifest(rows, seed)
    classes = sorted({r["label"] for r in rows})
    checksum = hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()
    device = "cuda" if config.get("device") == "cuda" and torch.cuda.is_available() else "cpu"
    if config.get("device") == "cuda" and device != "cuda":
        raise ValueError("CUDA requested but unavailable; set device: cpu")

    class Images(Dataset):
        def __init__(self, samples, training):
            self.samples, self.transform = samples, transforms(training)

        def __len__(self):
            return len(self.samples)

        def __getitem__(self, index):
            row = self.samples[index]
            with Image.open(row["path"]) as image:
                return self.transform(image.convert("RGB")), classes.index(row["label"])

    loaders = {
        key: DataLoader(
            Images(value, key == "train"),
            batch_size=config["batch_size"],
            shuffle=key == "train",
            num_workers=0,
        )
        for key, value in split.items()
    }
    model = build_model(config["architecture"], len(classes), config.get("pretrained", True)).to(device)
    if config.get("freeze_backbone", True):
        for name, param in model.named_parameters():
            param.requires_grad = name.startswith(("fc.", "classifier.", "heads."))
    optimizer_cls = {"adamw": torch.optim.AdamW, "sgd": torch.optim.SGD}[config.get("optimizer", "adamw")]
    optimizer = optimizer_cls(
        filter(lambda p: p.requires_grad, model.parameters()), lr=config["learning_rate"]
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=config["epochs"])
    criterion = torch.nn.CrossEntropyLoss()
    from uuid import uuid4

    run_version = str(uuid4())
    output = get_settings().storage_dir / "models" / config["architecture"] / run_version
    output.mkdir(parents=True, exist_ok=True)
    checkpoint = output / "model.safetensors"
    best_loss, stale, history = float("inf"), 0, []
    for epoch in range(config["epochs"]):
        if cancelled():
            return {"cancelled": True}
        model.train()
        if config.get("freeze_backbone", True):
            for module in model.modules():
                if isinstance(module, torch.nn.BatchNorm2d):
                    module.eval()
        for images, labels in loaders["train"]:
            if cancelled():
                return {"cancelled": True}
            optimizer.zero_grad()
            loss = criterion(model(images.to(device)), labels.to(device))
            loss.backward()
            optimizer.step()
        model.eval()
        validation_loss = 0.0
        with torch.inference_mode():
            for images, labels in loaders["validation"]:
                validation_loss += criterion(model(images.to(device)), labels.to(device)).item() * len(labels)
        validation_loss /= len(split["validation"])
        history.append({"epoch": epoch + 1, "validation_loss": validation_loss})
        scheduler.step()
        if validation_loss < best_loss:
            best_loss, stale = validation_loss, 0
            save_file({k: v.cpu().contiguous() for k, v in model.state_dict().items()}, str(checkpoint))
        else:
            stale += 1
            if stale >= config.get("patience", 3):
                break
    from safetensors.torch import load_file

    model.load_state_dict(load_file(str(checkpoint)))
    model.eval()
    actual, predicted = [], []
    inference_start = perf_counter()
    if device == "cuda":
        torch.cuda.synchronize()
        inference_start = perf_counter()
    with torch.inference_mode():
        for images, labels in loaders["test"]:
            actual.extend(labels.tolist())
            predicted.extend(model(images.to(device)).argmax(1).cpu().tolist())
    if device == "cuda":
        torch.cuda.synchronize()
    measured = classification_metrics(actual, predicted, classes)
    measured["latency_ms_per_image"] = (perf_counter() - inference_start) * 1000 / len(actual)
    measured["model_size_bytes"] = checkpoint.stat().st_size
    metadata = {
        "architecture": config["architecture"],
        "classes": classes,
        "image_size": 224,
        "dataset_checksum": checksum,
        "normalization": "ImageNet",
        "history": history,
    }
    (output / "metadata.json").write_text(json.dumps(metadata, indent=2))
    (output / "split.json").write_text(json.dumps(split, indent=2))
    (output / "evaluation.json").write_text(json.dumps(measured, indent=2))
    with SessionLocal() as db:
        record_experiment(
            db,
            "vision",
            config["architecture"],
            None,
            config,
            measured,
            perf_counter() - start,
            checksum,
            artifacts={
                "checkpoint": str(checkpoint),
                "evaluation": str(output / "evaluation.json"),
                "split": str(output / "split.json"),
            },
        )
        registered = ModelRecord(
            name=config["architecture"],
            module="vision",
            version=run_version,
            artifact=str(checkpoint),
            metadata_json=metadata,
        )
        db.add(registered)
        db.commit()
        model_id = registered.id
    return {"checkpoint": str(checkpoint), "model_id": model_id, "metrics": measured, "history": history}
