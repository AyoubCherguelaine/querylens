"""QueryLens Agent Evaluation Framework."""

from backend.evaluation.datasets import (
    BaseDataset,
    EcommerceDataset,
    FinanceDataset,
    InMemoryEvaluationDatabase,
    PostgresEvaluationDatabase,
    SaasDataset,
    get_dataset,
    list_datasets,
)
from backend.evaluation.evaluators import (
    AnswerAccuracyEvaluator,
    BaseEvaluator,
    ClarificationEvaluator,
    ErrorRecoveryEvaluator,
    ResultAccuracyEvaluator,
    SQLEvaluator,
    ToolUsageEvaluator,
)
from backend.evaluation.models import (
    EvaluationCategory,
    EvaluationReport,
    EvaluationResult,
    ExpectedResult,
    MetricScore,
    TestCase,
)
from backend.evaluation.reporter import ConsoleReporter, JsonReporter, MarkdownReporter
from backend.evaluation.runner import EvaluationRunner
from backend.evaluation.test_cases import (
    TestCaseRegistry,
    get_default_registry,
    get_default_test_cases,
    load_test_cases_from_directory,
    load_test_cases_from_file,
)

__all__ = [
    "EvaluationCategory",
    "ExpectedResult",
    "TestCase",
    "MetricScore",
    "EvaluationResult",
    "EvaluationReport",
    "BaseEvaluator",
    "SQLEvaluator",
    "ResultAccuracyEvaluator",
    "ToolUsageEvaluator",
    "ClarificationEvaluator",
    "ErrorRecoveryEvaluator",
    "AnswerAccuracyEvaluator",
    "BaseDataset",
    "EcommerceDataset",
    "SaasDataset",
    "FinanceDataset",
    "InMemoryEvaluationDatabase",
    "PostgresEvaluationDatabase",
    "get_dataset",
    "list_datasets",
    "TestCaseRegistry",
    "get_default_test_cases",
    "get_default_registry",
    "load_test_cases_from_file",
    "load_test_cases_from_directory",
    "EvaluationRunner",
    "ConsoleReporter",
    "JsonReporter",
    "MarkdownReporter",
]
