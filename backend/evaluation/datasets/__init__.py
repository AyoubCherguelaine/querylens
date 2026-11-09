"""Datasets package for QueryLens evaluation."""

from typing import Dict, List, Type

from backend.evaluation.datasets.base import BaseDataset
from backend.evaluation.datasets.db import (
    InMemoryEvaluationDatabase,
    MockAsyncpgPool,
    MockRecord,
    PostgresEvaluationDatabase,
)
from backend.evaluation.datasets.ecommerce import EcommerceDataset
from backend.evaluation.datasets.finance import FinanceDataset
from backend.evaluation.datasets.saas import SaasDataset

DATASET_REGISTRY: Dict[str, Type[BaseDataset]] = {
    "ecommerce": EcommerceDataset,
    "saas": SaasDataset,
    "finance": FinanceDataset,
}


def get_dataset(name: str) -> BaseDataset:
    """Retrieve an instantiated dataset by name."""
    if name not in DATASET_REGISTRY:
        raise ValueError(
            f"Unknown dataset '{name}'. Available: {', '.join(sorted(DATASET_REGISTRY.keys()))}"
        )
    return DATASET_REGISTRY[name]()


def list_datasets() -> List[str]:
    """List all available dataset names."""
    return sorted(list(DATASET_REGISTRY.keys()))


__all__ = [
    "BaseDataset",
    "EcommerceDataset",
    "SaasDataset",
    "FinanceDataset",
    "InMemoryEvaluationDatabase",
    "PostgresEvaluationDatabase",
    "MockAsyncpgPool",
    "MockRecord",
    "get_dataset",
    "list_datasets",
    "DATASET_REGISTRY",
]
