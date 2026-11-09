"""Data models and schemas for the QueryLens Agent Evaluation Framework."""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class EvaluationCategory(str, Enum):
    """Evaluation scenario categories."""

    BASIC_AGGREGATION = "basic_aggregation"
    MULTI_TABLE_JOIN = "multi_table_join"
    COMPLEX_ANALYTICS = "complex_analytics"
    AMBIGUOUS_QUESTION = "ambiguous_question"
    ERROR_RECOVERY = "error_recovery"
    NARRATIVE_REPORT = "narrative_report"
    VISUALIZATION = "visualization"
    DATA_EDGE_CASES = "data_edge_cases"


class ExpectedResult(BaseModel):
    """Specification of expected query results for validation."""

    sql: Optional[str] = Field(
        default=None,
        description="Reference ground-truth SQL query to execute for dynamic row comparison.",
    )
    rows: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Expected row dictionary list.",
    )
    numeric_tolerance: float = Field(
        default=0.01,
        description="Allowed relative or absolute numeric deviation for float/decimal comparisons.",
    )
    order_sensitive: bool = Field(
        default=False,
        description="Whether the order of rows matters in comparison.",
    )
    subset_match: bool = Field(
        default=False,
        description="Whether agent rows may contain additional rows or columns.",
    )


class TestCase(BaseModel):
    """Definition of an evaluation test case."""

    __test__ = False

    id: str = Field(description="Unique identifier for the test case.")
    name: str = Field(description="Short human-readable title.")
    description: str = Field(default="", description="Detailed explanation of what is tested.")
    category: EvaluationCategory = Field(description="Category of the scenario.")
    question: str = Field(description="Natural-language question sent to QueryLens agent.")
    dataset_name: str = Field(
        default="ecommerce",
        description="Target dataset schema name (e.g. ecommerce, saas, finance).",
    )
    cube_table: str = Field(
        default="orders",
        description="Primary table for the cube (fact table grain).",
    )
    selected_tables: Optional[List[str]] = Field(
        default=None,
        description="List of selected tables for multi-table analysis scope. Defaults to all dataset tables.",
    )
    conversation_history: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Prior conversation turns for follow-up testing.",
    )
    expected_tools: Optional[List[str]] = Field(
        default=None,
        description="Tools that MUST be invoked during the turn (e.g. query_postgres, ask_user).",
    )
    forbidden_tools: Optional[List[str]] = Field(
        default=None,
        description="Tools that MUST NOT be invoked during the turn.",
    )
    expected_result: Optional[ExpectedResult] = Field(
        default=None,
        description="Ground truth expectation for query results.",
    )
    expected_clarification: bool = Field(
        default=False,
        description="Whether this is an ambiguous question where agent must call ask_user.",
    )
    clarification_keywords: Optional[List[str]] = Field(
        default=None,
        description="Keywords expected in the clarifying question.",
    )
    expected_error_recovery: bool = Field(
        default=False,
        description="Whether the agent is expected to recover from an initial SQL or tool failure.",
    )
    expected_chart_type: Optional[str] = Field(
        default=None,
        description="Expected chart type if create_graph is called (bar, line, area, pie, scatter).",
    )
    expected_answer_contains: Optional[List[str]] = Field(
        default=None,
        description="Keywords or substrings that must appear in the final answer.",
    )
    weight: float = Field(
        default=1.0,
        ge=0.1,
        le=10.0,
        description="Relative weight of this test case in aggregated scores.",
    )
    tags: List[str] = Field(
        default_factory=list,
        description="Tags for filtering test runs (e.g. smoke, regression, joins).",
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Arbitrary additional context.",
    )


class MetricScore(BaseModel):
    """Detailed score for one evaluation dimension."""

    name: str = Field(description="Name of the metric (e.g. sql_execution, result_accuracy).")
    score: float = Field(ge=0.0, le=1.0, description="Normalized score from 0.0 to 1.0.")
    passed: bool = Field(description="Whether this metric met the passing threshold.")
    weight: float = Field(default=1.0, description="Weight of this metric in the composite score.")
    message: Optional[str] = Field(default=None, description="Diagnostic summary message.")
    details: Dict[str, Any] = Field(default_factory=dict, description="Diagnostic payload.")


class EvaluationResult(BaseModel):
    """Outcome of evaluating one test case."""

    test_case_id: str
    test_case_name: str
    category: str
    passed: bool
    score: float = Field(ge=0.0, le=1.0, description="Weighted composite score.")
    duration_ms: int = Field(default=0)
    metric_scores: Dict[str, MetricScore] = Field(default_factory=dict)
    agent_status: str = Field(default="answered")
    agent_answer: str = Field(default="")
    generated_sql: Optional[str] = None
    tools_used: List[str] = Field(default_factory=list)
    step_count: int = 0
    steps: List[Dict[str, Any]] = Field(default_factory=list)
    failure_reasons: List[str] = Field(default_factory=list)
    debug_info: Dict[str, Any] = Field(default_factory=dict)


class EvaluationReport(BaseModel):
    """Comprehensive evaluation summary report."""

    run_id: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    model_name: str
    total_cases: int
    passed_cases: int
    failed_cases: int
    pass_rate: float = Field(description="Percentage of passed test cases (0-100%).")
    average_score: float = Field(description="Average composite score across all cases (0-1.0).")
    total_duration_ms: int
    category_summary: Dict[str, Dict[str, Any]] = Field(
        default_factory=dict,
        description="Aggregated performance per category.",
    )
    metric_summary: Dict[str, Dict[str, Any]] = Field(
        default_factory=dict,
        description="Aggregated performance per metric dimension.",
    )
    results: List[EvaluationResult] = Field(default_factory=list)
    failed_results: List[EvaluationResult] = Field(default_factory=list)
    summary_text: str = ""
