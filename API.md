# API

Interactive schema: [localhost:8000/docs](http://localhost:8000/docs). JSON schema: `/openapi.json`. Versioned application endpoints use `/api/v1`. Optional `API_KEY` requires `X-API-Key` on API routes. Set it only when your API client or authenticated proxy supplies the header; the dashboard intentionally does not put a secret in browser source.

Errors use `{"error":{"code":"...","message":"..."}}`. Common statuses: 422 invalid input; 409 missing model/disabled training/conflict; 413 oversize upload; 429 per-client expensive request limit; 503 optional dependency or service unavailable. Deletions return HTTP 204.

| Method | Endpoint | Input / behavior |
|---|---|---|
| GET | `/health/live` | Process health |
| GET | `/health/ready` | DB + migration + Redis; 503 when degraded |
| GET | `/metrics` | Prometheus exposition |
| GET | `/api/v1/system/status` | Counts, capabilities, connectivity |
| POST | `/api/v1/knowledge/documents` | Multipart `file`, `chunk_size` words, `overlap` words |
| GET | `/api/v1/knowledge/documents` | Source metadata and checksums |
| DELETE | `/api/v1/knowledge/documents/{id}` | Remove chunks and rebuild snapshot |
| POST | `/api/v1/knowledge/rebuild` | Rebuild current FAISS snapshot |
| POST | `/api/v1/knowledge/query` | `question`, `top_k`, `threshold`, `history`, `model` |
| POST | `/api/v1/production/synthetic` | `days`, `components`, `seed` |
| POST | `/api/v1/production/datasets` | Multipart CSV `file`, optional `synthetic` provenance |
| GET | `/api/v1/production/datasets` | Versions and quality reports |
| POST | `/api/v1/production/forecast` | `version_id`, `component`, `model`, `horizon` |
| GET | `/api/v1/production/forecasts` | Latest persisted results |
| POST | `/api/v1/production/simulate` | Dataset, component, service target/cost/seed assumptions |
| GET | `/api/v1/production/inventory` | Query `version_id`, `component`; default simulation |
| GET | `/api/v1/pipelines` | Ingestion execution history |
| POST | `/api/v1/vision/predict` | Multipart image `file`, optional `model_id` |
| GET | `/api/v1/vision/models` | Available checkpoints and architecture capabilities |
| GET | `/api/v1/vision/evaluations` | Recorded real evaluations |
| GET | `/api/v1/artifacts/{filename}` | PNG explanation only |
| GET | `/api/v1/training/configurations` | Approved datasets, availability and numeric preset values |
| GET/POST | `/api/v1/training/jobs` | List or submit `kind`, `config_name`, optional approved `dataset` and validated `parameters` |
| GET | `/api/v1/training/jobs/{id}` | State, error and result |
| POST | `/api/v1/training/jobs/{id}/cancel` | Cooperative cancellation |
| GET | `/api/v1/training/jobs/{id}/events` | Bounded two-second SSE polling stream |
| GET | `/api/v1/experiments` | Local experiment/evaluation join |
| GET | `/api/v1/experiments/{id}` | Experiment details |
| GET | `/api/v1/models` | Local registry metadata |
| POST | `/api/v1/models/{id}/activate` | Check artifact, archive predecessor, audit activation |

Knowledge modes: `extractive` returns literal excerpts; `base` uses the configured allowlisted Transformers model with retrieved context; `adapter` additionally requires a locally trained adapter. Lack of evidence returns an explicit uncertainty response. Source objects retain document/chunk IDs, filename, page if available, text, similarity score, and ingestion timestamp.

Production `model` choices: `seasonal_naive`, `xgboost`, `lstm`. Forecast responses contain actual history, recursive future predictions, rolling-origin holdout predictions, MAE/RMSE/WAPE/bias, measured latency and a clearly labelled uncalibrated residual interval. LSTM fitting is CPU-bound and optional; use small datasets. Inventory responses explicitly set `simulation=true` and expose policy assumptions and baseline/proposed replay results.
