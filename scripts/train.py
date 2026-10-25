"""Explicit training CLI; never invoked on server startup."""

import argparse
import json
from pathlib import Path

import yaml

parser = argparse.ArgumentParser()
parser.add_argument("config", type=Path)
args = parser.parse_args()
config = yaml.safe_load(args.config.read_text())
if config["kind"] == "lora":
    from automind.ml.llm import train_lora

    result = train_lora(config)
elif config["kind"] == "vision":
    from automind.ml.vision_training import train_vision

    result = train_vision(config)
else:
    from automind.ml.forecasting import train_forecasting

    result = train_forecasting(config)
print(json.dumps(result, indent=2))
