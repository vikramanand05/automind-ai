# Troubleshooting

| Symptom | Check / action |
|---|---|
| Docker named pipe / daemon unavailable | Start Docker Desktop, confirm WSL2 Linux engine and `docker info`. CLI installation alone does not prove the engine works. |
| Native Python 3.14 wheel/build error | Use `py -3.12` and recreate a project-local virtual environment. Python requirement is 3.11–3.13. |
| pip `Permission denied` in temp directory | Create `runtime/tmp`, set `$env:TEMP=(Resolve-Path runtime/tmp).Path` and `$env:TMP=$env:TEMP`, retry with network access. |
| DNS failure for PyPI/npm | Check network/proxy/sandbox permission. Do not report a dependency build as passed until packages installed and checks execute. |
| Readiness 503 | Inspect `/health/ready`; database migration table and Redis must both be reachable. SQLite without Redis intentionally stays degraded. |
| API says missing table | Run `python -m alembic upgrade head` using the same DATABASE_URL as the API. |
| Next proxy fails | Confirm FastAPI on 8000 and `API_INTERNAL_URL`. Docker image builds with the internal service URL; changing rewrites requires rebuilding the web image. |
| Knowledge cannot answer | Upload supported UTF-8/PDF text, inspect library chunks and retrieval threshold. Scanned PDFs need OCR. Default hashing is lexical; use sentence transformers for semantic matching. |
| LLM/vision optional dependency error | Install `.[ml]` in the API runtime; base lightweight images do not silently download heavyweight packages. |
| Vision returns 409 | No trained/active checkpoint, or artifact missing. Train and activate a real checkpoint; do not substitute a fake prediction. |
| Training returns 409 | Enable TRAINING_ENABLED and start a worker with ML dependencies. Ensure referenced YAML exists and kind matches. |
| Job failed | Inspect stored error and worker logs. Missing local datasets, denied model repositories and CUDA incompatibility are actionable failures. |
| Cancel requested remains visible | Running jobs stop cooperatively at a supported step. A dead worker can leave stale state; inspect worker before intervening. |
| MLflow ID absent | Install optional tracking dependencies, start MLflow and check URI. Local DB still retains actual metrics; no remote success is inferred. |
| XGBoost/SHAP unavailable | Install `.[forecast]`. If SHAP alone is absent, the explanation explicitly reports XGBoost gain. |
| bitsandbytes error | Check target GPU/driver/build support. Use lora-cpu without quantization when unsupported. |
| Airflow login | Local standalone password is generated in `/opt/airflow/standalone_admin_password.txt`; keep it private. |
| API key breaks browser | Browser does not store your secret. Configure an authenticated server-side proxy or leave API_KEY empty for loopback development. |

Useful commands: `docker compose ps`, `docker compose logs --tail 100 api`, `docker compose --profile full logs --tail 100 worker`, `python scripts/gpu-check.py`. Logs may include filenames and training configuration; review before sharing. Avoid printing expanded Compose configuration with secrets. Never delete volumes as a routine troubleshooting step.
