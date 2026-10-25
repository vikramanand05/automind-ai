from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite:///runtime/automind.db"
    redis_url: str = "redis://localhost:6379/0"
    storage_dir: Path = Path("runtime")
    cors_origins: list[str] = ["http://localhost:3000"]
    training_enabled: bool = False
    mlflow_tracking_uri: str = "http://localhost:5000"
    llm_mode: Literal["extractive", "base", "adapter"] = "extractive"
    llm_device: str = "cpu"
    public_api_url: str = "http://localhost:8000"
    llm_model: str = "HuggingFaceTB/SmolLM2-135M-Instruct"
    model_allowlist: list[str] = [
        "HuggingFaceTB/SmolLM2-135M-Instruct",
        "sentence-transformers/all-MiniLM-L6-v2",
    ]
    embedding_mode: str = "hashing"
    max_upload_bytes: int = Field(default=10 * 1024 * 1024, ge=1024)
    api_key: str = ""
    rate_limit_per_minute: int = 30
    decision_reviewer_id: str = "local-reviewer"
    decision_review_token_sha256: str = ""


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    return settings
