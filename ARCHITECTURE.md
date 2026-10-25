# Architecture

## Boundaries

`apps/web` is a Next.js App Router dashboard. A same-origin rewrite forwards `/api/*` to FastAPI, keeping browser configuration simple. `apps/api/automind` is one modular Python service; training functions are reused by the CLI and Celery worker. Avoiding separate inference microservices keeps local deployment manageable.

| Module | Training | Evaluation | Inference |
|---|---|---|---|
| Knowledge | `ml/llm.py:train_lora` | `scripts/evaluate_knowledge.py` | `knowledge.py`, `ml/llm.py:generate` |
| Vision | `ml/vision_training.py:train_vision` | untouched stratified test partition | `vision.py:predict` |
| Production | XGBoost fit; `ml/forecasting.py` LSTM | `production.py:backtest` | recursive daily forecast |

CPU-safe libraries load with the API; PyTorch/Transformers/SHAP are lazy optional imports. No model is downloaded or trained during API startup. LLM responses never invoke tools, code or commands.

## Storage and migrations

PostgreSQL is the Compose deployment backend. SQLite is an explicitly labelled native smoke-test fallback, not a substitute for PostgreSQL integration validation. Alembic applies schema changes in a separate migration container before the API starts. Tables normalize users, documents, chunks, datasets, dataset versions, training jobs, models, experiments, evaluation results, vision predictions, components, historical demand, inventory, forecasts, pipeline executions and audit events. Checksums and unique keys enforce version/idempotency constraints. Model weights and extracted artifacts live on a filesystem volume; database rows store references.

The lightweight FAISS index is rebuilt from database chunks for each query, avoiding stale cross-process chunk mappings and unsafe deserialization of a persisted index. A FAISS snapshot is also written after document changes. This is correct for small local corpora, with an O(n) indexing cost per query. A production index service should use versioned, atomically swapped indexes and a bounded embedding cache. Hashing uses fixed 4096-dimensional L2-normalized vectors; the semantic option uses normalized MiniLM embeddings.

## Production data semantics

Demand ingestion requires continuous daily component series. Schema validation rejects negative/nonfinite values and conflicting duplicates. Exact duplicates are removed; optional missing fields are forward-filled within a component and remaining nulls rejected. Canonical CSV bytes plus the synthetic provenance flag determine the dataset checksum. Each version persists demand and inventory rows plus a quality report in one transaction. Failed writes roll back; artifact orphan cleanup is future work.

Features use shifted past demand and calendar information available at forecast time. Models are refit at each of three disjoint rolling origins. Recursive forecasts never inject true future demand. Inventory policy fitting uses the first 70% of the history; simulation uses the remaining 30%. Supplier delays use seeded sampling and identical initial RNG state when comparing policies.

## Job and model lifecycle

Training requests reference approved local configuration names, not arbitrary paths or commands. Jobs transition `queued → running → completed/failed`; cancellation transitions queued jobs to `cancelled`, active jobs to `cancel_requested` and ultimately `cancelled` at a cooperative checkpoint. Celery accepts JSON only. Worker crashes may leave a stale running job; automatic reconciliation is pending.

Vision checkpoints are registered as candidates; activation requires an artifact and archives the prior active model. Activation is audited. Safetensors avoids pickle-based model loading. Model artifacts must be created by trusted local training code. The local MLflow mirror is optional; the relational experiment/evaluation record remains authoritative.

## Health and observability

Liveness confirms the process is alive. Readiness checks the database connection, migration table and Redis, returning HTTP 503 on degradation. `/api/v1/system/status` returns capability states without credentials. Prometheus uses route templates for bounded labels and exposes request counts and durations. Grafana provisions a Prometheus datasource and API dashboard. Full profile adds standalone Airflow for an idempotent synthetic ingestion DAG with retries; the atomic ingestion API owns validation, cleaning, versioning and loading.
