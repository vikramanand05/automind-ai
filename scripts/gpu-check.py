import json
import platform

result = {"platform": platform.platform(), "torch_installed": False, "cuda_available": False}
try:
    import torch

    result.update(
        torch_installed=True,
        torch_version=torch.__version__,
        cuda_available=torch.cuda.is_available(),
        cuda_runtime=torch.version.cuda,
    )
    if torch.cuda.is_available():
        result["gpu"] = torch.cuda.get_device_name(0)
        result["memory_gb"] = torch.cuda.get_device_properties(0).total_memory / 1024**3
    try:
        import bitsandbytes

        result["bitsandbytes_version"] = bitsandbytes.__version__
    except (ImportError, OSError) as exc:
        result["bitsandbytes"] = str(exc)
except ImportError:
    pass
print(json.dumps(result, indent=2))
