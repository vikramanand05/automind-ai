def lstm_predict(
    frame, horizon: int, config: dict | None = None, artifact_dir=None, cancelled=lambda: False
) -> list[float]:
    """Fit on the supplied past only; each backtest origin trains an independent model."""
    import numpy as np
    import torch
    from torch import nn

    config = config or {"epochs": 20, "learning_rate": 0.01, "seed": 42, "hidden_size": 16}
    torch.manual_seed(config["seed"])
    torch.set_num_threads(1)
    values = frame.demand.to_numpy(dtype="float32")
    mean, scale = float(values.mean()), max(float(values.std()), 1)
    normalized = (values - mean) / scale
    window = 14
    if len(values) <= window:
        raise ValueError("LSTM requires at least 15 past observations")
    x = torch.tensor(np.stack([normalized[i - window : i] for i in range(window, len(values))])).unsqueeze(-1)
    y = torch.tensor(normalized[window:]).unsqueeze(-1)

    class LSTM(nn.Module):
        def __init__(self):
            super().__init__()
            self.lstm = nn.LSTM(1, config["hidden_size"], batch_first=True)
            self.head = nn.Linear(config["hidden_size"], 1)

        def forward(self, inputs):
            output, _ = self.lstm(inputs)
            return self.head(output[:, -1])

    model = LSTM()
    optimizer = torch.optim.Adam(model.parameters(), lr=config["learning_rate"])
    for _ in range(config["epochs"]):
        if cancelled():
            raise ValueError("Training cancelled")
        optimizer.zero_grad()
        loss = nn.functional.mse_loss(model(x), y)
        loss.backward()
        optimizer.step()
    model.eval()
    if artifact_dir is not None:
        import json

        from safetensors.torch import save_file

        artifact_dir.mkdir(parents=True, exist_ok=True)
        save_file(
            {key: value.detach().contiguous() for key, value in model.state_dict().items()},
            str(artifact_dir / "model.safetensors"),
        )
        (artifact_dir / "metadata.json").write_text(
            json.dumps(
                {
                    "mean": mean,
                    "scale": scale,
                    "window": window,
                    "config": config,
                    "training_rows": len(frame),
                }
            )
        )
    history = list(normalized)
    predictions = []
    with torch.inference_mode():
        for _ in range(horizon):
            prediction = float(model(torch.tensor(history[-window:]).reshape(1, window, 1))[0, 0])
            history.append(prediction)
            predictions.append(max(0, prediction * scale + mean))
    return predictions


def train_forecasting(config: dict, cancelled=lambda: False) -> dict:
    from time import perf_counter
    from uuid import uuid4

    import pandas as pd

    from automind.config import get_settings
    from automind.db import ModelRecord, SessionLocal
    from automind.production import backtest, ingest_frame, validate_frame
    from automind.tracking import record_experiment

    start = perf_counter()
    data, _ = validate_frame(pd.read_csv(config["dataset"]))
    frame = data[data.component_id == config["component"]].sort_values("date").reset_index(drop=True)
    if frame.empty:
        raise ValueError("Configured component is absent")
    evaluated, holdout = backtest(frame, "lstm", model_config=config)
    if cancelled():
        return {"cancelled": True}
    run_version = str(uuid4())
    output = get_settings().storage_dir / "models" / "lstm" / run_version
    prediction = lstm_predict(frame, config["horizon"], config, output, cancelled)
    with SessionLocal() as db:
        version = ingest_frame(db, data, "LSTM training data", bool(config.get("synthetic", False)))
        record_experiment(
            db,
            "production",
            "lstm",
            version["id"],
            config,
            evaluated,
            perf_counter() - start,
            version["checksum"],
            artifacts={
                "checkpoint": str(output / "model.safetensors"),
                "metadata": str(output / "metadata.json"),
            },
        )
        registered = ModelRecord(
            name="lstm",
            module="production",
            version=run_version,
            artifact=str(output / "model.safetensors"),
            metadata_json={"component": config["component"], "dataset_checksum": version["checksum"]},
        )
        db.add(registered)
        db.commit()
        identifier = registered.id
    return {
        "model_id": identifier,
        "checkpoint": str(output / "model.safetensors"),
        "metrics": evaluated,
        "backtest": holdout,
        "forecast": prediction,
    }
