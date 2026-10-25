# Model training

Training never runs during startup. Install optional dependencies explicitly, review licences in DATASETS.md, apply migrations, and provide the required local dataset. Use Python 3.12 for the validated native environment. Commands below assume the venv is active at repository root.

```powershell
python -m pip install -e '.[ml,forecast]'
python -m alembic upgrade head
python scripts/gpu-check.py
```

Large dependencies, model repositories and optional CUDA runtimes require network access and disk space. The code is implemented independently of whether weights/datasets are present; see IMPLEMENTATION_STATUS.md for executed training checks.

## Language adaptation

```powershell
python scripts/train.py experiments/configurations/lora-cpu.yaml
```

`train_lora` loads the allowlisted model with Transformers and safetensors, creates a seeded training/validation/test split with Hugging Face Datasets, tokenizes with TRL SFTTrainer, applies PEFT LoRA to linear layers, writes checkpoints and adapter files, evaluates the untouched test partition, and records configuration/provenance/metrics in the local experiment store. With MLflow installed and reachable, metrics/provenance are mirrored there. Configurable YAML fields include learning rate, batch size, gradient accumulation, epochs, maximum length, LoRA rank/alpha/dropout and seed. The bundled twenty examples only verify the mechanics.

For QLoRA, first verify CUDA and bitsandbytes in the target environment, install the compatible bitsandbytes package, then use `qlora-gpu.yaml`. The code rejects 4-bit training when CUDA is absent; use CPU LoRA instead. CPU LoRA is float32. Each run saves its adapter under `runtime/models/lora/<run-version>/adapter`; activate that candidate in the registry before adapter inference, using the same configured base model. Set `LLM_DEVICE=cuda` only after checking CUDA for optional GPU inference.

## Vision classification

```powershell
python scripts/train.py experiments/configurations/vision-resnet50.yaml
python scripts/train.py experiments/configurations/vision-efficientnet.yaml
python scripts/train.py experiments/configurations/vision-vit.yaml
```

Configurations select pretrained or random initialization, frozen backbone or full training, AdamW/SGD, batch size, learning rate, cosine scheduling, seed, patience and epochs. Models use 224×224 RGB images and ImageNet normalization for both training and inference, with horizontal-flip/small-rotation training augmentation. Domain suitability of augmentation must be reviewed for the actual defect task.

Validation loss chooses the checkpoint and early stopping. The test partition is evaluated once after restoring the best checkpoint. Output includes `model.safetensors`, metadata, split manifest, measured metrics, confusion matrix and per-class report. A candidate model is registered; activate it from Experiment Laboratory before inference. Grad-CAM is implemented for ResNet/EfficientNet; ViT uses a distinctly labelled patch-token gradient × activation method.

## Forecasting

```powershell
python scripts/benchmark_production.py --models seasonal_naive xgboost
python scripts/benchmark_production.py --models seasonal_naive lstm
```

Each run uses actual generated seed-42 data. Seasonal naive repeats the last seven observations. XGBoost uses shifted lag-1/7/14 demand, shifted rolling means and deterministic day-of-week encoding. LSTM learns a standardized 14-step univariate sequence; scaling is fitted on each training partition only. Each rolling origin fits a fresh model. LSTM is optional and can be substantially slower than the default baseline.

The forecast training configuration reads a user-supplied daily CSV and component. It must exist at its documented path. Neither CLI nor worker silently substitutes another dataset.

## Asynchronous worker

Set `TRAINING_ENABLED=true`, start Redis, API and a worker with ML dependencies:

```powershell
python -m celery -A automind.worker:celery_app worker --pool=solo --loglevel=info
```

Windows native Celery uses the solo pool; Docker uses the normal Linux pool. Submit a kind and existing configuration name in Fine-Tuning Studio. Cooperative cancellation checks LoRA optimizer steps and vision batches/epochs. No generated shell command or model-provided code is executed.

## Studio controls

The Studio loads its approved dataset catalog and defaults from versioned YAML files. Numeric overrides are range-validated and restricted to parameters supported by the selected configuration. Each job records the merged parameters plus `source_config`; the source YAML stays unchanged. Arbitrary dataset paths and model repositories cannot be supplied through the job API. Dataset paths must already be declared by a configuration of the same task kind.
