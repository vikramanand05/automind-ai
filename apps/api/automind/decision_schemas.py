from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class InvestigationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=4, max_length=180)
    version_id: str = Field(min_length=1, max_length=36)
    component: str = Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")
    batch_code: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,100}$")
    batch_quantity: int = Field(ge=1, le=10_000_000)
    inspected_quantity: int = Field(ge=1, le=10_000_000)
    rejected_quantity: int = Field(ge=0, le=10_000_000)
    reported_defect: str = Field(min_length=2, max_length=100)
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    rejected_in_inventory: bool = False
    notes: str = Field(default="", max_length=3000)

    @model_validator(mode="after")
    def quantities(self):
        if not self.rejected_quantity <= self.inspected_quantity <= self.batch_quantity:
            raise ValueError("Require rejected <= inspected <= batch quantity")
        return self


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    forecast_model: Literal["seasonal_naive", "xgboost", "lstm"] = "seasonal_naive"
    horizon: int = Field(default=14, ge=7, le=60)
    model_id: str | None = Field(default=None, max_length=36)
    explanation_mode: Literal["extractive", "base", "adapter"] = "extractive"


class ScenarioRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    recovery_yield: float = Field(default=0.25, ge=0, le=1, allow_inf_nan=False)
    reinspection_days: int = Field(default=2, ge=1, le=60)
    replacement_quantity: int | None = Field(default=None, ge=1, le=10_000_000)
    supplier_delay_days: int = Field(default=0, ge=0, le=60)
    schedule_shift_days: int = Field(default=3, ge=1, le=60)
    annual_holding_rate: float = Field(default=0.2, ge=0, le=2, allow_inf_nan=False)
    reinspection_cost_per_unit: float = Field(default=2, ge=0, le=100_000, allow_inf_nan=False)


class ReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    action: Literal["approve", "reject", "close"]
    recommendation_id: str = Field(min_length=1, max_length=36)
    evidence_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    comments: str = Field(min_length=8, max_length=3000)
    acknowledge_limitations: Literal[True]
