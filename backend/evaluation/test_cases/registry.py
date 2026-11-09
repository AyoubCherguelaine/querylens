"""Registry for evaluation test cases with flexible filtering."""

from typing import Dict, List, Optional

from backend.evaluation.models import EvaluationCategory, TestCase


class TestCaseRegistry:
    """Stores and filters test cases for evaluation runs."""

    __test__ = False

    def __init__(self):
        self._cases: Dict[str, TestCase] = {}

    def register(self, test_case: TestCase) -> None:
        """Register a new test case."""
        if test_case.id in self._cases:
            raise ValueError(f"Duplicate test case ID: '{test_case.id}'")
        self._cases[test_case.id] = test_case

    def register_many(self, cases: List[TestCase]) -> None:
        """Register multiple test cases."""
        for c in cases:
            self.register(c)

    def get(self, test_case_id: str) -> Optional[TestCase]:
        """Get test case by ID."""
        return self._cases.get(test_case_id)

    def list_all(self) -> List[TestCase]:
        """Return all registered test cases."""
        return list(self._cases.values())

    def filter(
        self,
        category: Optional[EvaluationCategory | str] = None,
        tag: Optional[str] = None,
        dataset: Optional[str] = None,
        case_id: Optional[str] = None,
    ) -> List[TestCase]:
        """Filter test cases by category, tag, dataset, or ID."""
        results = list(self._cases.values())

        if case_id:
            results = [c for c in results if c.id == case_id]

        if category:
            cat_val = category.value if isinstance(category, EvaluationCategory) else str(category)
            results = [c for c in results if c.category.value == cat_val]

        if tag:
            results = [c for c in results if tag in c.tags]

        if dataset:
            results = [c for c in results if c.dataset_name == dataset]

        return results
