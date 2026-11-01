"""Abstract base class for all evaluation metrics."""

from abc import ABC, abstractmethod
from typing import Any, Dict

from backend.evaluation.models import MetricScore, TestCase


class BaseEvaluator(ABC):
    """Base class for specialized agent evaluators."""

    name: str = "base"
    default_weight: float = 1.0

    @abstractmethod
    async def evaluate(
        self,
        test_case: TestCase,
        agent_outcome: Dict[str, Any],
        definitions: list,
        pool: Any = None,
    ) -> MetricScore:
        """Evaluate a specific dimension of agent behavior."""
        pass
