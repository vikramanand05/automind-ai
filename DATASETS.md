# Datasets and model licensing

## Included synthetic data

The repository contains a fictional maintenance handbook, twenty synthetic SFT examples and four small knowledge evaluation questions. They are smoke-test material, not an industrial training corpus. SFT examples are split 80/10/10 before training; the held-out knowledge questionnaire is separate. The dataset is too small to establish reliable language-model quality.

Production data is generated explicitly with NumPy's seeded generator. Default seed 42, 240 daily observations and three components produce weekly seasonality, gradual demand growth, noise, changing inventory, supplier lead times/reliability, capacities, unit costs and shortage flags. Synthetic provenance is stored per dataset and appears in API responses, forecasts and the UI. Checksums capture canonical rows plus that provenance flag. No synthetic cost reduction is represented as a real business result.

Required CSV columns:

```text
component_id,product_category,date,demand,production_volume,inventory_level,supplier_lead_time,supplier_reliability,unit_cost,production_capacity,shortage_events
```

Dates must form continuous daily series per component, with at least 35 observations. Critical identity/date/demand fields cannot be missing. Numeric values must be finite and satisfy schema bounds. Only exact duplicates are removed. Currency is deliberately unspecified; cost figures use the supplied dataset's currency units.

## User-supplied vision datasets

No third-party image datasets are downloaded or redistributed automatically. Obtain and review the source license before placing data in ignored `datasets/local/`.

- **NEU:** use an authorised copy of the labelled surface defect classification data. Arrange it as `datasets/local/neu/<class>/<image>.jpg`. The `neu` adapter accepts class directories rather than assuming an arbitrary detection annotation format. Rights for your intended download/use/redistribution must be verified with the original provider; this repository grants no rights to NEU images.
- **Generic ImageFolder:** one directory per labelled class; at least ten unique images per class. Configure `adapter: imagefolder`.
- **MVTec AD:** the [official dataset page](https://www.mvtec.com/research-teaching/datasets/mvtec-ad) describes defect-free training sets and normal/defective test sets and publishes CC BY-NC-SA 4.0 terms. Respect noncommercial/share-alike/attribution restrictions. Its standard split is an anomaly detection task; do not convert the defective test images into training data while claiming standard benchmark performance. A dedicated anomaly trainer is pending.

Vision validation decodes images and computes pixel checksums before splitting. Duplicate images, even with different encodings, are rejected. A seeded stratified 60/20/20 split is saved as a manifest. Related views of the same physical part need a group-aware split in real deployments; pixel deduplication alone cannot prevent that leakage.

## Model sources

The initial optional language model is [HuggingFaceTB/SmolLM2-135M-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct), whose model card specifies Apache 2.0. It is a small instruction model, not an industrial expert. The optional embedding model is [sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2). Check each configured model's upstream license and revision before use. Only explicitly allowlisted repositories are accepted, and remote custom code is disabled.

Vision transfer weights use the official [torchvision model builders](https://docs.pytorch.org/vision/stable/models.html). Software licensing does not automatically establish rights to every pretraining dataset or derived artifact; review upstream terms before redistribution. Set `pretrained: false` for an offline architecture smoke test. No weights are bundled in Git.
