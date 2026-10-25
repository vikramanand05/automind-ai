# Optional reproducibility environment. No GPU libraries or model weights are downloaded at startup.
FROM automind-tests:latest
USER root
RUN pip install --no-cache-dir torch==2.9.0+cpu torchvision==0.24.0+cpu --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir "transformers>=4.56,<5" "trl==0.27.2" "peft>=0.15,<1" "accelerate>=1.5,<2" "datasets>=3.5,<5" safetensors sentence-transformers mlflow-skinny
RUN pip install --no-cache-dir pillow==13.0.0
USER automind
ENV HF_HOME=/app/runtime/cache/huggingface TORCH_HOME=/app/runtime/cache/torch
