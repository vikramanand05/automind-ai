from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from automind.config import get_settings


class KnowledgeQuery(BaseModel):
    question: str = Field(min_length=3, max_length=4000)
    top_k: int = Field(default=4, ge=1, le=10)
    threshold: float = Field(default=0.12, ge=0, le=1)
    history: list[str] = Field(default_factory=list, max_length=8)
    model: Literal["extractive", "base", "adapter"] = Field(default_factory=lambda: get_settings().llm_mode)


class SyntheticRequest(BaseModel):
    days: int = Field(default=240, ge=60, le=2000)
    components: int = Field(default=3, ge=1, le=30)
    seed: int = Field(default=42, ge=0, le=2147483647)


class ForecastRequest(BaseModel):
    version_id: str
    component: str
    model: Literal["seasonal_naive", "xgboost", "lstm"] = "seasonal_naive"
    horizon: int = Field(default=14, ge=1, le=60)


class TrainingParameters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    learning_rate: float | None = Field(default=None, gt=0, le=0.1)
    batch_size: int | None = Field(default=None, ge=1, le=64)
    gradient_accumulation: int | None = Field(default=None, ge=1, le=128)
    epochs: int | None = Field(default=None, ge=1, le=1000)
    max_sequence_length: int | None = Field(default=None, ge=32, le=4096)
    lora_rank: int | None = Field(default=None, ge=1, le=128)
    lora_alpha: int | None = Field(default=None, ge=1, le=512)
    dropout: float | None = Field(default=None, ge=0, le=0.5)
    seed: int | None = Field(default=None, ge=0, le=2147483647)
    patience: int | None = Field(default=None, ge=1, le=100)
    hidden_size: int | None = Field(default=None, ge=1, le=512)
    horizon: int | None = Field(default=None, ge=1, le=60)


class JobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["lora", "vision", "forecast"]
    config_name: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,64}$")
    dataset: str | None = Field(default=None, max_length=500)
    parameters: TrainingParameters = Field(default_factory=TrainingParameters)


class SimulationRequest(BaseModel):
    version_id: str
    component: str
    service_target: float = Field(default=0.95, ge=0.5, le=0.999)
    holding_rate: float = Field(default=0.2, ge=0, le=2)
    stockout_penalty: float = Field(default=20, ge=0, le=10000)
    seed: int = Field(default=42, ge=0, le=2147483647)
