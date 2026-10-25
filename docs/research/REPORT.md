# AutoMind AI: A Unified Framework for Industrial Knowledge Adaptation, Visual Quality Inspection, and Production Forecasting

Technical implementation report · 25 October 2026

## Problem statement

Industrial AI demonstrations often separate document assistance, visual inspection and production analytics, making provenance and evaluation hard to compare. AutoMind AI implements a shared local application for these workflows with explicit dataset versions, model metadata, measured evaluation records and honest missing-model states. The portfolio uses fictional documentation and reproducible synthetic production data, with optional public-model integrations. It is independent of any automotive manufacturer.

The present results establish executable software behavior and limited synthetic baselines. They do not establish industrial model quality, operational safety or business savings.

## System architecture

A Next.js/TypeScript frontend talks to a modular FastAPI service through a same-origin proxy. PostgreSQL stores normalized operational and experiment metadata. Redis brokers optional Celery jobs. The modules share evaluation/provenance utilities while keeping training, evaluation and inference functions separate. Heavy ML libraries load on demand. The lightweight profile remains CPU-compatible. Airflow orchestrates idempotent ingestion through the API; Prometheus/Grafana configuration provides request monitoring. MLflow mirroring is optional and failures are logged without erasing local evaluation records.

See ARCHITECTURE.md for storage semantics and SECURITY.md for deployment boundaries. The local deployment was started using Docker Desktop's Linux engine on Windows. Ports were changed to 13000 (web), 18000 (API), 15432 (PostgreSQL) and 16379 (Redis) to avoid reserved or occupied defaults.

## Datasets

### Production

The seed-42 generator created 720 rows: three component series with 240 continuous daily observations each, beginning 1 January 2024. The generator includes weekly demand seasonality, trend, independent Gaussian noise, inventory updates, production quantities, supplier assumptions, costs, capacity and shortage flags. The canonical dataset checksum is:

```text
134e606fd071d977292f8a4f2c97ac4b2b67b279ccb2ab554dce151350708d97
```

All experiment results below use this synthetic dataset. One seed and three series are insufficient to establish generalization.

### Knowledge

A fictional maintenance handbook and four curated questions exercise source retrieval, cited excerpts and abstention. Three questions have a labelled relevant source; one asks for an unsupported real-world axle torque. Twenty separate synthetic instruction examples support optional fine-tuning mechanics. These small fixtures are not a representative industrial corpus.

### Vision

No licensed industrial image dataset was supplied or downloaded. Dataset adapters accept NEU-style class directories and generic ImageFolder trees. MVTec AD is documented as a separate anomaly task with its upstream licence restrictions; anomaly training is pending. No industrial defect accuracy result is reported.

## Models and experimental methodology

The production benchmark compares seasonal naive (period seven) with XGBoost using lag-1/7/14 demand, shifted rolling-7/14 means and calendar seasonality. Evaluation uses three disjoint rolling-origin seven-day horizons, giving 21 held-out observations per component. Training data strictly precedes each origin. Recursive predictions use previous predictions rather than actual future demand. XGBoost uses 80 estimators, depth three, learning rate 0.05 and seed 42. Feature explanation uses SHAP when available, with an explicitly labelled gain fallback.

Knowledge's default baseline uses fixed hashing vectors, basic English plural normalization and FAISS inner-product search on normalized vectors. It is lexical retrieval, not a learned semantic model. Optional sentence-transformer embeddings and Transformers generation are separate configurations. Four generative comparisons are implemented: base, base+RAG, adapter and adapter+RAG. Human correctness, citation support, groundedness and hallucination fields remain unscored unless actual rubric annotations are supplied. Token overlap is labelled a proxy.

The vision trainer supports ResNet-50, EfficientNet-B0 and ViT, pixel-checksum duplicate rejection, stratified 60/20/20 splits, transfer learning or full training, early stopping and safetensors checkpoints. CNN attribution is Grad-CAM; ViT uses labelled patch-token gradient × activation. These implementation capabilities are distinct from validated industrial classification performance.

## Actual production results

Raw results: `experiments/reports/production.json`. MAE/RMSE are demand units; WAPE is a percentage. Bias is mean(predicted − actual).

| Component | Model | MAE | RMSE | WAPE | Bias |
|---|---|---:|---:|---:|---:|
| CMP-001 | Seasonal naive | 8.905 | 10.996 | 9.585% | -2.333 |
| CMP-001 | XGBoost | 7.368 | 9.150 | 7.931% | -5.779 |
| CMP-002 | Seasonal naive | 5.571 | 6.849 | 4.777% | 0.619 |
| CMP-002 | XGBoost | 5.905 | 6.925 | 5.064% | -2.314 |
| CMP-003 | Seasonal naive | 9.476 | 11.553 | 6.669% | -1.000 |
| CMP-003 | XGBoost | 7.425 | 8.750 | 5.226% | -4.708 |

XGBoost lowered absolute error for two synthetic components and slightly worsened it for CMP-002. It also had a more negative bias on all three. These observations support retaining the naive baseline and examining model tradeoffs rather than asserting universal improvement. They do not establish statistical significance.

Measured final fit-plus-forecast latencies were 0.06–0.14 ms for seasonal naive and 224.69–343.93 ms for XGBoost in this run. These are single local measurements with library caches and scheduling effects, not serving SLAs or cross-hardware benchmarks.

## Inventory replay

The policy fits the first 168 CMP-001 observations and replays the final 72. Assumptions include five-day lead time, supplier reliability 0.94, annual holding rate 0.2, stockout penalty 20 dataset-currency units per lost unit, one-week fixed order quantity and seed 42. The target service approximation is 0.95. Estimated reorder point is 460.59 units with 54.81 safety units.

| Metric | No-safety-stock baseline | Proposed buffer |
|---|---:|---:|
| Stockout-day frequency | 11.111% | 6.944% |
| Average inventory | 244.36 | 276.56 |
| Simulated holding cost | 120.51 | 136.38 |
| Simulated lost units | 442 | 421 |
| Demand fill rate | 93.110% | 93.437% |

The proposed buffer trades higher average stock and holding costs for fewer stockout days and slightly better fill rate in this replay. It does not achieve the nominal 95% target, illustrating the limits of the normal-demand approximation and supplier assumptions. No actual savings or enterprise recommendation is established.

## Knowledge retrieval result

`experiments/reports/knowledge.json` records source recall@4 of 1.0 for the three answerable fixture questions. The unsupported query produces an insufficient-evidence response. This is a trivial single-source fixture and should not be interpreted as semantic search quality or LLM factual accuracy. Manual quality scores are null. No four-way generative quality claim is made from this result.

## Engineering verification

The combined CPU/ML suite passed 36 tests; two additional Training Studio catalog/override tests and one actual one-epoch EfficientNet synthetic-fixture training test subsequently passed, totaling 39 distinct tests across these runs. These checks include real PostgreSQL temporary-table persistence/migration-version and Redis connectivity checks. They also cover document ingestion/retrieval/citations/deletion, production ingestion/forecast/simulation, temporal feature leakage, deterministic synthetic generation, image validation, dataset splitting, malformed uploads, API schemas, authentication/rate limits, training metadata and actual missing-dataset worker failure. One training metadata test explicitly stubs broker submission; it is not a training or Redis delivery benchmark.

The Docker frontend production build succeeded; frontend type checking/lint and Python lint/schema typing passed. API readiness returned connected PostgreSQL and Redis; the dashboard served HTTP 200. A browser session displayed actual forecast metrics and inventory replay results. Browser file-picker automation timed out, so that specific UI upload check is not reported as passed; API upload integration is covered separately.

The initial dependency audit identified Pillow advisories; the requirement and Linux lock were upgraded to 13.0.0. A subsequent audit of 66 pinned backend packages reported no known advisories. npm's audit reported no frontend advisories. These are point-in-time dependency checks, not a comprehensive security certification.

Optional CPU tests passed for all three vision forward/attribution paths, a vision prediction API using an explicitly random checkpoint, an actual one-epoch EfficientNet training/evaluation/checkpoint/registration loop on synthetic image patterns, LSTM checkpointing, full TRL/PEFT LoRA training with a local random model and 16/2/2 train/validation/test rows, and actual MLflow SQLite tracking. A real Redis/Celery worker also processed an intentional missing-dataset job and persisted its failure. These establish software mechanics, not domain quality.

A separately saved three-step random tiny-Llama LoRA fixture produced training losses 4.16069, 4.15243 and 4.14269 (`experiments/reports/lora-smoke.json`). Its safetensors adapter is in ignored `runtime/smoke-lora/`. No pretrained model or industrial language quality is established by this fixture.

## Limitations and future research

- No industrial image evaluation, operational deployment, GPU/QLoRA run, or externally reviewed LLM quality benchmark is established.
- The corpus, questionnaire and SFT fixtures are intentionally tiny; collect licensed domain data with an untouched evaluation set and annotation provenance.
- Replace lexical retrieval with measured semantic retrieval and assess passage-level relevance, calibration and adversarial prompt injection.
- Add physical-component group splits, domain shift tests, calibration and uncertainty evaluation to vision experiments.
- Expand forecasting to multiple seeds, longer histories and real external data with covariate-availability rules. Compare LSTM only after identical temporal validation; a Temporal Fusion Transformer remains future work.
- Inventory replay uses independent supplier delays, lost sales and a simplified periodic policy. Validate uncertainty assumptions, capacity constraints, order costs and service definitions before operational use.
- Airflow execution and the simultaneous full profile (limited by measured host memory), enterprise identity/authorization, distributed quotas, isolated parsing, object storage, backup/restore and production HA need additional validation and engineering.

## Reproduction

Follow SETUP.md, then run:

```powershell
python scripts/benchmark_production.py --models seasonal_naive xgboost --seed 42
python scripts/evaluate_knowledge.py --retrieval-only
python -m pytest -q
```

Use the pinned Linux Python 3.12 lock for container reproduction. Windows Application Control blocked selected native extensions during development, so Linux containers were used for executed ML/API checks. Preserve package versions, dataset checksums, configurations and source commit together when extending these experiments.

## Optional service verification

MLflow 3.1.4 accepted a real HTTP-mirrored API-readiness verification run; its identifier is saved in `experiments/reports/tracking-smoke.json`. This run is system verification rather than model performance. Prometheus scraped the API metrics endpoint with target health up and query result 1; Grafana returned database status ok and loaded the provisioned AutoMind API dashboard. These services were stopped after checks to preserve the lightweight running profile.

The combined optional image startup caused severe memory pressure on the 16 GB host (about 276-960 MB free observed; Docker reported approximately 8 GB VM allocation). Airflow extraction was stopped; its DAG execution and the simultaneous full profile were not validated. No unrelated user process/container was stopped and no global security or resource policy was changed.
