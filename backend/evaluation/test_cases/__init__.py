"""Test cases package for agent evaluation."""

from backend.evaluation.test_cases.loader import (
    load_test_cases_from_directory,
    load_test_cases_from_file,
)
from backend.evaluation.test_cases.registry import TestCaseRegistry
from backend.evaluation.test_cases.suite import get_default_test_cases


def get_default_registry() -> TestCaseRegistry:
    """Instantiate a registry populated with the default benchmark test suite."""
    registry = TestCaseRegistry()
    registry.register_many(get_default_test_cases())
    return registry


__all__ = [
    "TestCaseRegistry",
    "get_default_test_cases",
    "get_default_registry",
    "load_test_cases_from_file",
    "load_test_cases_from_directory",
]
