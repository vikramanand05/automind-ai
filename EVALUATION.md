# Evaluation methodology

## Reproducibility

Experiments record model identifier, configuration, random seed, dataset checksum, dependency versions, hardware platform, available Git commit, measured duration and evaluation metrics. An uncommitted repository is recorded explicitly. The local database is authoritative; MLflow run IDs appear only if mirroring actually succeeds. Failed or unavailable evaluations must never be shown as successful benchmarks.

## Knowledge

```powershell
python scripts/evaluate_knowledge.py --retrieval-only
python scripts/evaluate_knowledge.py
```

The first command runs without LLM weights and evaluates the explicit extractive baseline. The second runs A (base model), B (base + RAG), C (adapter), D (adapter + RAG) using the same held-out questionnaire. Missing libraries/models/adapters produce an unavailable configuration record, not a substitute result. Generation is greedy, bounded and deterministic under the configured model. Retrieved content is data only.

Recall@4 checks whether the labelled relevant source is among retrieved documents for answerable questions. This small fixture measures source recall, not a robust passage-level benchmark. The reference-token recall field is a lexical proxy and **must not be labelled answer correctness**. Response latency is measured locally; tokens are counted with the actual model tokenizer when generative inference runs. Extractive token counts are unavailable rather than invented.

Human evaluation rubric, per question/configuration:

| Field | Score | Interpretation |
|---|---|---|
| correctness | 0, 0.5, 1 | wrong; partially correct; fully correct against reference evidence |
| citation_accuracy | 0..1 | fraction of cited factual claims actually supported by the cited source |
| groundedness | 0..1 | fraction of substantive answer claims supported by supplied evidence |
| hallucination | 0 or 1 | any fabricated/unsupported substantive technical claim |

For unanswerable questions, an appropriate abstention earns correctness 1; an invented procedure earns correctness 0 and hallucination 1. Two qualified reviewers should annotate independently and resolve disagreement. Record annotation provenance and disagreements in the research report. Supply optional JSON with configuration keys mapping question strings to score objects using `--annotations path.json`. Unscored human fields remain null. Hallucination rate is the mean of actual manual binary annotations, never inferred from string overlap. Real industrial advice also requires safety review, outside this portfolio's scope.

## Vision

Use saved stratified holdouts with pixel-level duplicate rejection. Report accuracy, macro precision/recall/F1, per-class metrics, confusion matrix, Wilson 95% interval for accuracy, saved checkpoint bytes and test inference time per image. The interval treats image outcomes as independent and does not capture dataset shift or related views; grouped industrial datasets require stronger evaluation. GPU timing must synchronize CUDA when hardware is used; current CPU timing does not establish GPU performance. Attribution maps are qualitative aids, not proof that a prediction is correct.

No pretrained model's ImageNet metrics are reported as industrial defect accuracy. Synthetic fixtures or mocked checkpoints, if used in tests, are labelled and excluded from industrial performance claims.

## Production

`scripts/benchmark_production.py` compares models on the exact same seed/checksum/component. Three disjoint seven-day test horizons use increasing chronological training windows; each model refits at every origin. Lag and rolling features are shifted before fitting. Metrics:

- MAE: mean absolute prediction error, in demand units.
- RMSE: square root of mean squared error, in demand units.
- WAPE: total absolute error divided by total absolute actual demand; null when denominator is zero.
- Bias: mean(predicted − actual); positive means overforecasting.
- Latency: measured fit-plus-recursive-prediction duration for the final forecast; this is not a pure warm-model serving benchmark.

Future residual bands use the empirical 90th percentile absolute holdout residual. They are uncalibrated diagnostics, not guaranteed prediction intervals. Model comparison requires matching dataset, component, horizon, seed and evaluation protocol. SHAP TreeExplainer is used for XGBoost if installed; otherwise feature gain is labelled as such.

## Inventory

Fit reorder point on the first 70% only: mean daily demand × lead time + z(service target) × demand SD × sqrt(lead time). Replay historical held-out demand with lost sales, periodic review, fixed one-week order quantity, stated supplier reliability and seeded delays. Compare a no-safety-stock baseline to the proposed policy using the same starting inventory and RNG state. Measure stockout-day frequency, mean end-of-day inventory, simulated holding cost, shortage penalty and demand fill rate (displayed as service level). The requested service target uses a normal lead-time approximation and is not guaranteed by the simulator. No simulated cost difference is actual savings.
