"""Offline CPU LoRA mechanics smoke test with an explicitly random tiny Llama fixture."""

import json
from pathlib import Path

import torch
from peft import LoraConfig, get_peft_model
from transformers import LlamaConfig, LlamaForCausalLM

torch.manual_seed(42)
torch.set_num_threads(1)
model = LlamaForCausalLM(
    LlamaConfig(
        vocab_size=64,
        hidden_size=32,
        intermediate_size=64,
        num_hidden_layers=1,
        num_attention_heads=2,
        num_key_value_heads=2,
    )
)
model = get_peft_model(
    model, LoraConfig(r=4, lora_alpha=8, target_modules=["q_proj", "v_proj"], task_type="CAUSAL_LM")
)
inputs = torch.randint(3, 64, (2, 16))
optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=0.01)
losses = []
model.train()
for _ in range(3):
    optimizer.zero_grad()
    loss = model(input_ids=inputs, labels=inputs).loss
    loss.backward()
    optimizer.step()
    losses.append(float(loss.detach()))
path = Path("runtime/smoke-lora")
model.save_pretrained(path, safe_serialization=True)
result = {
    "fixture": "random tiny Llama, synthetic token IDs; no pretrained weights or industrial quality claim",
    "steps": 3,
    "losses": losses,
    "adapter": str(path),
    "device": "cpu",
}
Path("experiments/reports/lora-smoke.json").write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
