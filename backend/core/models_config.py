import json
import logging
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

DEFAULT_CONFIG_PATH = Path("models.json")


class ModelPricing(BaseModel):
    input_per_million: float
    output_per_million: float
    cached_input_per_million: float | None = None


class ModelItem(BaseModel):
    id: str = Field(min_length=1)
    provider: Literal["openai"] = "openai"
    name: str = Field(min_length=1)
    description: str = ""
    credit_cost: int = Field(ge=1, default=5)
    pricing: ModelPricing | None = None
    is_default: bool = False


class ModelsConfig(BaseModel):
    provider: Literal["openai"] = "openai"
    description: str = ""
    models: list[ModelItem] = Field(min_length=1)


_cached_config: ModelsConfig | None = None


def load_models_config(config_path: str | Path | None = None, reload: bool = False) -> ModelsConfig:
    """Load and validate the models configuration file."""
    global _cached_config
    if _cached_config is not None and not reload and config_path is None:
        return _cached_config

    path = Path(config_path) if config_path else DEFAULT_CONFIG_PATH
    if not path.is_absolute():
        # Look in workspace root
        root = Path(__file__).resolve().parent.parent.parent
        resolved = root / path
        if resolved.exists():
            path = resolved

    if not path.exists():
        logger.warning("models_config.missing", extra={"path": str(path)})
        # Provide safe default configuration if file is missing
        default_config = ModelsConfig(
            provider="openai",
            description="Default OpenAI models configuration",
            models=[
                ModelItem(
                    id="gpt-4o-mini",
                    provider="openai",
                    name="OpenAI GPT-4o-mini",
                    description="Fast and economical model for everyday analytics",
                    credit_cost=5,
                    pricing=ModelPricing(
                        input_per_million=0.15,
                        output_per_million=0.6,
                        cached_input_per_million=0.075,
                    ),
                    is_default=True,
                ),
                ModelItem(
                    id="gpt-6-luna",
                    provider="openai",
                    name="OpenAI GPT-6 Luna",
                    description="Ultra-compact next-generation model for high-speed, cost-effective reasoning",
                    credit_cost=4,
                    pricing=ModelPricing(
                        input_per_million=0.1,
                        output_per_million=0.5,
                        cached_input_per_million=0.01,
                    ),
                    is_default=False,
                ),
                ModelItem(
                    id="gpt-5.6-luna",
                    provider="openai",
                    name="OpenAI GPT-5.6 Luna",
                    description="GPT-5.6 model optimized for cost-sensitive workloads",
                    credit_cost=8,
                    pricing=ModelPricing(
                        input_per_million=0.2,
                        output_per_million=1.2,
                        cached_input_per_million=0.02,
                    ),
                    is_default=False,
                ),
                ModelItem(
                    id="gpt-5.4-nano",
                    provider="openai",
                    name="OpenAI GPT-5.4 Nano",
                    description="Our fastest and cheapest GPT-5.4-class model for simple high-volume tasks",
                    credit_cost=8,
                    pricing=ModelPricing(
                        input_per_million=0.2,
                        output_per_million=1.25,
                        cached_input_per_million=0.02,
                    ),
                    is_default=False,
                ),
                ModelItem(
                    id="gpt-5-nano",
                    provider="openai",
                    name="OpenAI GPT-5 Nano",
                    description="Fastest, most cost-effective GPT-5 model",
                    credit_cost=2,
                    pricing=ModelPricing(
                        input_per_million=0.05,
                        output_per_million=0.4,
                        cached_input_per_million=0.005,
                    ),
                    is_default=False,
                ),
                ModelItem(
                    id="gpt-4.1-nano",
                    provider="openai",
                    name="OpenAI GPT-4.1 Nano",
                    description="Fastest, most cost-effective GPT-4.1 model",
                    credit_cost=3,
                    pricing=ModelPricing(
                        input_per_million=0.1,
                        output_per_million=0.4,
                        cached_input_per_million=0.025,
                    ),
                    is_default=False,
                ),
                ModelItem(
                    id="gpt-4.1-mini",
                    provider="openai",
                    name="OpenAI GPT-4.1 Mini",
                    description="Balanced for intelligence, speed, and cost",
                    credit_cost=10,
                    pricing=ModelPricing(
                        input_per_million=0.4,
                        output_per_million=1.6,
                        cached_input_per_million=0.1,
                    ),
                    is_default=False,
                ),
                ModelItem(
                    id="gpt-4o",
                    provider="openai",
                    name="OpenAI GPT-4o",
                    description="Advanced multi-step reasoning and deep analytical queries",
                    credit_cost=15,
                    pricing=ModelPricing(
                        input_per_million=2.5,
                        output_per_million=10.0,
                        cached_input_per_million=1.25,
                    ),
                    is_default=False,
                ),
                ModelItem(
                    id="gpt-4-turbo",
                    provider="openai",
                    name="OpenAI GPT-4 Turbo",
                    description="High context capacity with comprehensive SQL verification",
                    credit_cost=20,
                    pricing=ModelPricing(
                        input_per_million=10.0,
                        output_per_million=30.0,
                    ),
                    is_default=False,
                ),
                ModelItem(
                    id="o1-mini",
                    provider="openai",
                    name="OpenAI o1-mini",
                    description="Deep mathematical reasoning and complex schema logic",
                    credit_cost=25,
                    pricing=ModelPricing(
                        input_per_million=1.1,
                        output_per_million=4.4,
                        cached_input_per_million=0.55,
                    ),
                    is_default=False,
                ),
                ModelItem(
                    id="o3-mini",
                    provider="openai",
                    name="OpenAI o3-mini",
                    description="Next-generation high-precision STEM analytical reasoning",
                    credit_cost=30,
                    pricing=ModelPricing(
                        input_per_million=1.1,
                        output_per_million=4.4,
                        cached_input_per_million=0.55,
                    ),
                    is_default=False,
                ),
            ],
        )
        if config_path is None:
            _cached_config = default_config
        return default_config

    try:
        content = json.loads(path.read_text(encoding="utf-8"))
        config = ModelsConfig.model_validate(content)
        # Ensure only openai provider is allowed
        for m in config.models:
            if m.provider != "openai":
                raise ValueError(f"Only provider 'openai' is permitted, got '{m.provider}' for model '{m.id}'")
        if config_path is None:
            _cached_config = config
        return config
    except Exception as e:
        logger.error("models_config.load_failed", extra={"path": str(path), "error": str(e)})
        raise ValueError(f"Failed to load valid models configuration from {path}: {e}") from e


def get_allowed_models(config_path: str | Path | None = None) -> list[ModelItem]:
    return load_models_config(config_path).models


def is_model_allowed(model_id: str, config_path: str | Path | None = None) -> bool:
    models = get_allowed_models(config_path)
    return any(m.id == model_id for m in models)


def get_model_credit_cost(model_id: str, default_cost: int = 5, config_path: str | Path | None = None) -> int:
    models = get_allowed_models(config_path)
    for m in models:
        if m.id == model_id:
            return m.credit_cost
    return default_cost


def get_default_model_id(config_path: str | Path | None = None) -> str:
    models = get_allowed_models(config_path)
    for m in models:
        if m.is_default:
            return m.id
    return models[0].id if models else "gpt-4o-mini"

