"""Held-out evaluation. Human quality scores are never inferred from lexical proxies."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from time import perf_counter

from automind.db import SessionLocal
from automind.knowledge import PROMPT_TEMPLATE, ingest, query, retrieve
from automind.schemas import KnowledgeQuery
from automind.tracking import record_experiment

parser = argparse.ArgumentParser()
parser.add_argument(
    "--retrieval-only", action="store_true", help="No LLM download; test cited extractive baseline"
)
parser.add_argument("--dataset", type=Path, default=Path("datasets/samples/knowledge-eval.jsonl"))
parser.add_argument(
    "--annotations", type=Path, help="Optional JSON mapping config/question to manual rubric scores"
)
parser.add_argument("--output", type=Path, default=Path("experiments/reports/knowledge.json"))
args = parser.parse_args()
examples = [json.loads(line) for line in args.dataset.read_text().splitlines() if line.strip()]
annotations = json.loads(args.annotations.read_text()) if args.annotations else {}
checksum = hashlib.sha256(args.dataset.read_bytes()).hexdigest()
configurations = (
    {"extractive": (True, False)}
    if args.retrieval_only
    else {
        "A_base": (False, False),
        "B_base_rag": (True, False),
        "C_adapter": (False, True),
        "D_adapter_rag": (True, True),
    }
)
results = []
with SessionLocal() as db:
    ingest(db, Path("datasets/samples/maintenance.md").read_bytes(), "maintenance.md")
    for name, (rag, adapter) in configurations.items():
        start = perf_counter()
        rows = []
        try:
            for example in examples:
                sources = retrieve(db, example["question"], 4, 0.12) if rag else []
                inference_start = perf_counter()
                if args.retrieval_only:
                    answer = query(db, KnowledgeQuery(question=example["question"]))["answer"]
                    tokens = None
                else:
                    import torch
                    from automind.ml.llm import generate, load_llm

                    if torch.cuda.is_available():
                        torch.cuda.reset_peak_memory_stats()
                    evidence = "\n".join(f"[{i + 1}] {s['text']}" for i, s in enumerate(sources))
                    prompt = (
                        PROMPT_TEMPLATE.format(history=[], evidence=evidence, question=example["question"])
                        if rag
                        else example["question"]
                    )
                    answer = generate(prompt, adapter)
                    tokenizer, _ = load_llm(adapter)
                    tokens = len(tokenizer.encode(answer))
                terms = set(re.findall(r"\w+", example["reference"].lower()))
                recall = (
                    float(any(s["filename"] == example["source"] for s in sources))
                    if example["source"] and rag
                    else None
                )
                manual = annotations.get(name, {}).get(example["question"], {})
                row = {
                    "question": example["question"],
                    "answer": answer,
                    "latency_ms": (perf_counter() - inference_start) * 1000,
                    "tokens": tokens,
                    "retrieval_recall_at_4": recall,
                    "reference_token_recall_proxy": len(terms & set(re.findall(r"\w+", answer.lower())))
                    / max(1, len(terms)),
                    "manual_correctness": manual.get("correctness"),
                    "manual_citation_accuracy": manual.get("citation_accuracy"),
                    "manual_groundedness": manual.get("groundedness"),
                    "manual_hallucination": manual.get("hallucination"),
                }
                rows.append(row)
            numeric = {
                key: sum(r[key] for r in rows if r[key] is not None) / sum(r[key] is not None for r in rows)
                for key in rows[0]
                if key not in ("question", "answer") and any(r[key] is not None for r in rows)
            }
            record_experiment(
                db,
                "knowledge",
                name,
                None,
                {
                    "seed": 42,
                    "rag": rag,
                    "adapter": adapter,
                    "evaluation_protocol": "knowledge-fixture-v1-top4-threshold0.12",
                },
                numeric,
                perf_counter() - start,
                checksum,
            )
            db.commit()
            results.append(
                {"configuration": name, "status": "evaluated", "metrics": numeric, "examples": rows}
            )
        except (ImportError, OSError, ValueError) as exc:
            results.append({"configuration": name, "status": "unavailable", "reason": str(exc)[:500]})
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(
    json.dumps(
        {
            "dataset_checksum": checksum,
            "results": results,
            "rubric": "EVALUATION.md; lexical proxy does not measure factual correctness or hallucination",
        },
        indent=2,
    )
)
print(f"Saved evaluation to {args.output}")
