from functools import lru_cache
from pathlib import Path

from automind.config import get_settings


@lru_cache(maxsize=2)
def load_llm(adapter: bool = False):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    settings = get_settings()
    if settings.llm_model not in settings.model_allowlist:
        raise ValueError("Configured LLM is not in MODEL_ALLOWLIST")
    if settings.llm_device not in ("cpu", "cuda"):
        raise ValueError("LLM_DEVICE must be cpu or cuda")
    if settings.llm_device == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA inference requested but unavailable; set LLM_DEVICE=cpu")
    tokenizer = AutoTokenizer.from_pretrained(settings.llm_model, trust_remote_code=False)
    model = AutoModelForCausalLM.from_pretrained(
        settings.llm_model, trust_remote_code=False, use_safetensors=True, torch_dtype=torch.float32
    )
    if adapter:
        from peft import PeftModel
        from sqlalchemy import select

        from automind.db import ModelRecord, SessionLocal

        with SessionLocal() as db:
            registered = db.scalar(
                select(ModelRecord).where(ModelRecord.module == "knowledge", ModelRecord.state == "active")
            )
            if registered is None or registered.metadata_json.get("base_model") != settings.llm_model:
                raise ValueError("Activate a trained adapter for the configured base model first")
            path = Path(registered.artifact).parent
        if not path.is_dir():
            raise ValueError("No trained LoRA adapter found. Run the LoRA pipeline first.")
        model = PeftModel.from_pretrained(model, str(path), use_safetensors=True)
    model.to(settings.llm_device)
    model.eval()
    return tokenizer, model


def generate(prompt: str, adapter: bool = False) -> str:
    import torch

    tokenizer, model = load_llm(adapter)
    messages = [{"role": "user", "content": prompt}]
    inputs = tokenizer.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
        truncation=True,
        max_length=1536,
    ).to(model.device)
    with torch.inference_mode():
        output = model.generate(
            **inputs, max_new_tokens=192, do_sample=False, pad_token_id=tokenizer.eos_token_id
        )
    return tokenizer.decode(output[0][inputs.input_ids.shape[1] :], skip_special_tokens=True)


def train_lora(config: dict, cancelled=lambda: False) -> dict:
    import hashlib
    import random
    from time import perf_counter

    import numpy as np
    import torch
    from peft import LoraConfig, prepare_model_for_kbit_training
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TrainerCallback
    from trl import SFTConfig, SFTTrainer

    from automind.db import ModelRecord, SessionLocal
    from automind.tracking import record_experiment
    from datasets import load_dataset

    start = perf_counter()
    settings = get_settings()
    model_id = config["model"]
    if model_id not in settings.model_allowlist:
        raise ValueError("Training model is not in MODEL_ALLOWLIST")
    seed = int(config.get("seed", 42))
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    quantized = config.get("quantization") == "4bit"
    if quantized and not torch.cuda.is_available():
        raise ValueError("QLoRA requires compatible CUDA and bitsandbytes. Use lora-cpu.yaml instead.")
    path = Path(config["dataset"])
    checksum = hashlib.sha256(path.read_bytes()).hexdigest()
    dataset = load_dataset("json", data_files=str(path), split="train")
    if len(dataset) < 10:
        raise ValueError("Training dataset requires at least 10 examples")
    if len(set(dataset["text"])) != len(dataset):
        raise ValueError("Duplicate SFT examples must be removed before splitting")
    # Split before tokenization and preserve the untouched test partition.
    split = dataset.train_test_split(test_size=0.2, seed=seed)
    heldout = split["test"].train_test_split(test_size=0.5, seed=seed)
    tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=False)
    tokenizer.pad_token = tokenizer.eos_token
    kwargs = {"trust_remote_code": False, "use_safetensors": True}
    if quantized:
        kwargs.update(
            quantization_config=BitsAndBytesConfig(
                load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.float16
            ),
            device_map="auto",
        )
    else:
        kwargs["torch_dtype"] = torch.float32
    model = AutoModelForCausalLM.from_pretrained(model_id, **kwargs)
    if quantized:
        model = prepare_model_for_kbit_training(model)
    adapter_config = LoraConfig(
        r=config["lora_rank"],
        lora_alpha=config["lora_alpha"],
        lora_dropout=config["dropout"],
        target_modules="all-linear",
        task_type="CAUSAL_LM",
    )
    from uuid import uuid4

    run_version = str(uuid4())
    output = settings.storage_dir / "models" / "lora" / run_version

    class Cancellation(TrainerCallback):
        def on_step_end(self, args, state, control, **kwargs):
            if cancelled():
                control.should_training_stop = True

    args = SFTConfig(
        output_dir=str(output / "checkpoints"),
        learning_rate=config["learning_rate"],
        per_device_train_batch_size=config["batch_size"],
        gradient_accumulation_steps=config["gradient_accumulation"],
        num_train_epochs=config["epochs"],
        max_length=config["max_sequence_length"],
        dataset_text_field="text",
        seed=seed,
        use_cpu=not torch.cuda.is_available(),
        fp16=quantized,
        bf16=False,
        logging_steps=1,
        eval_strategy="epoch",
        save_strategy="epoch",
        report_to="none",
        dataloader_pin_memory=torch.cuda.is_available(),
    )
    trainer = SFTTrainer(
        model=model,
        args=args,
        train_dataset=split["train"],
        eval_dataset=heldout["train"],
        processing_class=tokenizer,
        peft_config=adapter_config,
        callbacks=[Cancellation()],
    )
    trainer.train()
    if cancelled():
        return {"cancelled": True}

    # SFTTrainer prepares its constructor datasets only. Tokenize the untouched test
    # partition explicitly instead of passing raw text to Trainer.evaluate().
    def encode_test(batch):
        texts = [
            text if text.endswith(tokenizer.eos_token) else text + tokenizer.eos_token
            for text in batch["text"]
        ]
        return tokenizer(texts, truncation=True, max_length=config["max_sequence_length"])

    test_dataset = heldout["test"].map(encode_test, batched=True, remove_columns=heldout["test"].column_names)
    test_metrics = trainer.evaluate(test_dataset)
    output.mkdir(parents=True, exist_ok=True)
    trainer.save_model(str(output / "adapter"))
    tokenizer.save_pretrained(str(output / "adapter"))
    with SessionLocal() as db:
        record_experiment(
            db,
            "knowledge",
            model_id + "+lora",
            None,
            config,
            test_metrics,
            perf_counter() - start,
            checksum,
            artifacts={"checkpoint": str(output / "adapter" / "adapter_model.safetensors")},
        )
        registered = ModelRecord(
            name="lora",
            module="knowledge",
            version=run_version,
            artifact=str(output / "adapter" / "adapter_model.safetensors"),
            metadata_json={"base_model": model_id, "dataset_checksum": checksum},
        )
        db.add(registered)
        db.commit()
        model_identifier = registered.id
    return {
        "checkpoint": str(output / "adapter"),
        "model_id": model_identifier,
        "test_metrics": test_metrics,
        "split_sizes": {
            "train": len(split["train"]),
            "validation": len(heldout["train"]),
            "test": len(heldout["test"]),
        },
    }
