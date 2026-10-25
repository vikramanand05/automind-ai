# Setup on Windows / WSL2

## Requirements

Use Docker Desktop with the WSL2 Linux engine for deployment. Native development needs Python 3.11–3.13 and Node.js 24. Windows system Python 3.14 is intentionally excluded until the ML dependency stack is validated. No GPU or paid account is needed for default workflows. Ensure ports 3000, 8000, 5432 and 6379 are free.

CPU/RAM consumption depends on model and dataset choices. Lightweight services should be provisioned several GB of RAM; full Airflow/MLflow/worker services need materially more. These are planning estimates, not measured minimums. A 135M-parameter float32 language model needs roughly 540 MB for its raw parameters, plus framework, activations and training overhead. ResNet/ViT training can use several GB. Begin with small batches.

## Profile A: lightweight Compose

```powershell
powershell -ExecutionPolicy Bypass -File scripts/init-env.ps1
docker info
docker compose config --quiet
docker compose up --build -d
docker compose ps
Invoke-RestMethod http://localhost:8000/health/ready
Start-Process http://localhost:3000
```

Compose binds published ports to loopback and waits for database/broker health and successful migrations. Credentials come from ignored `.env`; do not paste `docker compose config` output into public logs because it expands secrets. `docker compose config --quiet` validates without printing them. Keep PostgreSQL passwords URL-safe (the init script generates hexadecimal passwords).

Stop without deleting data: `docker compose down`. The destructive `down -v` deletes named volumes and requires an intentional backup/removal decision.

## Native developer workflow

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e '.[dev,forecast]'
npm.cmd --prefix apps/web ci
powershell -ExecutionPolicy Bypass -File scripts/init-env.ps1
docker compose up -d postgres redis
python -m alembic upgrade head
python -m uvicorn automind.main:app --host 127.0.0.1 --port 8000
```

In a second terminal: `npm.cmd --prefix apps/web run dev`. The frontend proxies to `http://127.0.0.1:8000`. If pip temp permissions fail, create `runtime/tmp` and set `$env:TEMP` and `$env:TMP` to its absolute path before installation.

Without Docker you may explicitly set `$env:DATABASE_URL='sqlite:///runtime/automind.db'`, then run Alembic and the API. This supports smoke tests and CPU workflows. Readiness remains degraded without Redis and must not be reported as full platform validation.

## Profile B: full platform

```powershell
docker compose -f docker-compose.yml -f docker-compose.full.yml --profile full up --build -d
```

This adds optional ML dependencies to the API, Celery workers, MLflow (5000), Airflow (8080), Prometheus (9090), and Grafana (3001). Model dependencies make the full images much larger. For jobs, set `TRAINING_ENABLED=true` in `.env`, then recreate API/worker containers. Airflow standalone generates its local administrator password; read it from its container using `docker compose --profile full exec airflow cat /opt/airflow/standalone_admin_password.txt`. Do not publish it.

The API stores run metadata locally. Installing `.[tracking]` or using the full API image enables mirroring to MLflow. Monitoring/tracking outages do not fabricate results or block unrelated inference.

## Profile C: GPU training

```powershell
python scripts/gpu-check.py
docker compose -f docker-compose.yml -f docker-compose.full.yml -f docker-compose.gpu.yml --profile full up --build -d worker
```

This requires a working NVIDIA driver, Docker GPU support and compatible PyTorch build. Check `nvidia-smi` and the GPU check script inside the selected runtime. Set `device: cuda` for vision configurations only after those checks. QLoRA additionally needs a compatible bitsandbytes installation; it is intentionally not in the default dependencies. If unsupported, use nonquantized CPU LoRA. GPU execution is not a requirement for the dashboard, retrieval or seasonal forecasting.

## Checks

```powershell
python -m ruff check apps/api tests pipelines scripts
python -m mypy
python -m pytest -q
npm.cmd --prefix apps/web run typecheck
npm.cmd --prefix apps/web run lint
npm.cmd --prefix apps/web run build
```

Real PostgreSQL/Redis test:

```powershell
$env:SERVICE_DATABASE_URL=$env:DATABASE_URL # set to the PostgreSQL URL from your local configuration
$env:SERVICE_REDIS_URL='redis://localhost:6379/0'
python -m pytest -m services -q
```

The PowerShell variable above is populated only if you explicitly exported it; `.env` is read by Python, not imported into PowerShell automatically. Browser checks require the API and dashboard to be running:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH=(Join-Path (Get-Location) 'runtime/browsers')
npm.cmd --prefix apps/web exec -- playwright install chromium
npm.cmd --prefix apps/web run test:e2e
```

## Optional offline CPU mechanics suite

After building the API image, the following builds explicit test environments. The ML image downloads framework packages, but the tests themselves use local random fixtures and synthetic data rather than remote model weights:

```powershell
docker build -f infrastructure/docker/test.Dockerfile -t automind-tests:latest .
docker build -f infrastructure/docker/ml-cpu.Dockerfile -t automind-ml-cpu:latest .
docker run --rm automind-ml-cpu:latest python -m pytest tests/ml -q
```

To run the current tests after source edits, bind-mount `apps/api` to `/app/apps/api` and `tests` to `/app/tests`, setting `PYTHONPATH=/app/apps/api`. Supply `SERVICE_DATABASE_URL` and `SERVICE_REDIS_URL` for the real infrastructure tests, and join the `automind_default` network. Use a temporary SQLite MLFLOW_TRACKING_URI for offline tracking tests. The published port overrides are WEB_PORT, API_PORT, POSTGRES_PORT and REDIS_PORT; inspect their values in your local `.env` when defaults are already occupied.
