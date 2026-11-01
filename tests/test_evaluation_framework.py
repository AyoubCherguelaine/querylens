"""Comprehensive automated test suite for the QueryLens Agent Evaluation Framework."""

import json

import pytest
from starlette.testclient import TestClient

from backend.app import create_app
from backend.core.config import Settings
from backend.evaluation.cli import parse_args
from backend.evaluation.datasets import (
    EcommerceDataset,
    FinanceDataset,
    InMemoryEvaluationDatabase,
    SaasDataset,
    get_dataset,
    list_datasets,
)
from backend.evaluation.evaluators import (
    AnswerAccuracyEvaluator,
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
    get_default_registry,
    get_default_test_cases,
    load_test_cases_from_file,
)


# ---------------------------------------------------------------------------
# 1. Models and Schemas
# ---------------------------------------------------------------------------
def test_test_case_model_validation():
    tc = TestCase(
        id="test_01",
        name="Test One",
        category=EvaluationCategory.BASIC_AGGREGATION,
        question="How many users?",
        dataset_name="ecommerce",
        cube_table="orders",
        expected_tools=["query_postgres", "finish"],
        expected_result=ExpectedResult(rows=[{"count": 5}]),
        tags=["smoke"],
    )
    assert tc.id == "test_01"
    assert tc.category == EvaluationCategory.BASIC_AGGREGATION
    assert tc.expected_result.rows == [{"count": 5}]
    assert tc.tags == ["smoke"]


def test_metric_score_and_report_models():
    score = MetricScore(
        name="sql_execution",
        score=1.0,
        passed=True,
        weight=1.5,
        message="Valid query",
    )
    assert score.passed is True
    assert score.score == 1.0

    res = EvaluationResult(
        test_case_id="tc_1",
        test_case_name="TC One",
        category="basic_aggregation",
        passed=True,
        score=1.0,
        metric_scores={"sql_execution": score},
    )
    assert res.passed is True

    rep = EvaluationReport(
        run_id="run-1",
        model_name="test-model",
        total_cases=1,
        passed_cases=1,
        failed_cases=0,
        pass_rate=100.0,
        average_score=1.0,
        total_duration_ms=10,
        results=[res],
    )
    assert rep.pass_rate == 100.0


# ---------------------------------------------------------------------------
# 2. SQLEvaluator Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_sql_evaluator_success():
    evaluator = SQLEvaluator()
    tc = TestCase(
        id="t1",
        name="T1",
        category=EvaluationCategory.BASIC_AGGREGATION,
        question="Count orders",
        cube_table="orders",
    )
    definitions = [{"schema": "eval_ecommerce", "table": "orders", "fields": [{"name": "id"}]}]
    outcome = {
        "status": "answered",
        "steps": [
            {
                "tool": "query_postgres",
                "status": "completed",
                "arguments": {"sql": "SELECT count(*) FROM eval_ecommerce.orders"},
                "output": {"rows": [{"count": 10}]},
            }
        ],
    }
    score = await evaluator.evaluate(tc, outcome, definitions)
    assert score.passed is True
    assert score.score == 1.0


@pytest.mark.asyncio
async def test_sql_evaluator_no_queries():
    evaluator = SQLEvaluator()
    tc = TestCase(
        id="t1",
        name="T1",
        category=EvaluationCategory.BASIC_AGGREGATION,
        question="Count orders",
        cube_table="orders",
    )
    outcome = {"status": "answered", "steps": []}
    score = await evaluator.evaluate(tc, outcome, [])
    assert score.passed is False
    assert score.score == 0.0


@pytest.mark.asyncio
async def test_sql_evaluator_clarification_skipped():
    evaluator = SQLEvaluator()
    tc = TestCase(
        id="t1",
        name="T1",
        category=EvaluationCategory.AMBIGUOUS_QUESTION,
        question="Ambiguous",
        expected_clarification=True,
    )
    outcome = {"status": "clarification", "steps": []}
    score = await evaluator.evaluate(tc, outcome, [])
    assert score.passed is True
    assert score.weight == 0.0


# ---------------------------------------------------------------------------
# 3. ResultAccuracyEvaluator Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_result_accuracy_evaluator_exact_and_multiset():
    evaluator = ResultAccuracyEvaluator()
    tc = TestCase(
        id="t1",
        name="T1",
        category=EvaluationCategory.BASIC_AGGREGATION,
        question="Count",
        expected_result=ExpectedResult(
            rows=[{"status": "completed", "count": 12}, {"status": "shipped", "count": 2}],
            order_sensitive=False,
        ),
    )
    # Match in reverse order
    outcome = {
        "rows": [{"status": "shipped", "count": 2}, {"status": "completed", "count": 12}]
    }
    score = await evaluator.evaluate(tc, outcome, [])
    assert score.passed is True
    assert score.score == 1.0


@pytest.mark.asyncio
async def test_result_accuracy_evaluator_tolerance():
    evaluator = ResultAccuracyEvaluator()
    tc = TestCase(
        id="t1",
        name="T1",
        category=EvaluationCategory.BASIC_AGGREGATION,
        question="Revenue",
        expected_result=ExpectedResult(
            rows=[{"revenue": 1000.00}],
            numeric_tolerance=0.01,
        ),
    )
    outcome = {"rows": [{"revenue": 1000.004}]}
    score = await evaluator.evaluate(tc, outcome, [])
    assert score.passed is True
    assert score.score == 1.0


@pytest.mark.asyncio
async def test_result_accuracy_evaluator_mismatch():
    evaluator = ResultAccuracyEvaluator()
    tc = TestCase(
        id="t1",
        name="T1",
        category=EvaluationCategory.BASIC_AGGREGATION,
        question="Count",
        expected_result=ExpectedResult(rows=[{"count": 100}]),
    )
    outcome = {"rows": [{"count": 5}]}
    score = await evaluator.evaluate(tc, outcome, [])
    assert score.passed is False
    assert score.score == 0.0


# ---------------------------------------------------------------------------
# 4. ToolUsageEvaluator Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_tool_usage_evaluator_expected_and_forbidden():
    evaluator = ToolUsageEvaluator()
    tc = TestCase(
        id="t1",
        name="T1",
        category=EvaluationCategory.BASIC_AGGREGATION,
        question="Count",
        expected_tools=["query_postgres", "finish"],
        forbidden_tools=["ask_user"],
    )
    # Clean run
    outcome = {
        "steps": [
            {"tool": "query_postgres", "status": "completed"},
            {"tool": "finish", "status": "completed"},
        ]
    }
    score = await evaluator.evaluate(tc, outcome, [])
    assert score.passed is True
    assert score.score == 1.0

    # Forbidden tool called
    bad_outcome = {
        "steps": [
            {"tool": "ask_user", "status": "completed"},
            {"tool": "finish", "status": "completed"},
        ]
    }
    score_bad = await evaluator.evaluate(tc, bad_outcome, [])
    assert score_bad.passed is False


# ---------------------------------------------------------------------------
# 5. ClarificationEvaluator Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_clarification_evaluator():
    evaluator = ClarificationEvaluator()
    tc = TestCase(
        id="t1",
        name="T1",
        category=EvaluationCategory.AMBIGUOUS_QUESTION,
        question="Show me the best ones",
        expected_clarification=True,
        clarification_keywords=["product", "metric"],
    )
    outcome = {
        "status": "clarification",
        "steps": [
            {
                "tool": "ask_user",
                "arguments": {"question": "Which product category and metric do you prefer?"},
            }
        ],
    }
    score = await evaluator.evaluate(tc, outcome, [])
    assert score.passed is True
    assert score.score == 1.0


# ---------------------------------------------------------------------------
# 6. ErrorRecoveryEvaluator Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_error_recovery_evaluator():
    evaluator = ErrorRecoveryEvaluator()
    tc = TestCase(
        id="t1",
        name="T1",
        category=EvaluationCategory.ERROR_RECOVERY,
        question="Query",
        expected_error_recovery=True,
    )
    outcome = {
        "status": "answered",
        "steps": [
            {"tool": "query_postgres", "status": "failed", "output": {"error": "syntax error"}},
            {"tool": "query_postgres", "status": "completed", "output": {"rows": [{"a": 1}]}},
            {"tool": "finish", "status": "completed"},
        ],
    }
    score = await evaluator.evaluate(tc, outcome, [])
    assert score.passed is True
    assert score.score == 1.0


# ---------------------------------------------------------------------------
# 7. AnswerAccuracyEvaluator Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_answer_accuracy_evaluator():
    evaluator = AnswerAccuracyEvaluator()
    tc = TestCase(
        id="t1",
        name="T1",
        category=EvaluationCategory.BASIC_AGGREGATION,
        question="Total revenue",
        expected_answer_contains=["40,229", "completed"],
    )
    outcome = {
        "status": "answered",
        "answer": "The total revenue from completed orders is $40,229.00.",
        "rows": [{"revenue": 40229.00}],
    }
    score = await evaluator.evaluate(tc, outcome, [])
    assert score.passed is True
    assert score.score == 1.0


# ---------------------------------------------------------------------------
# 8. Datasets and In-Memory Database Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_datasets_and_in_memory_db():
    datasets = [EcommerceDataset(), SaasDataset(), FinanceDataset()]
    assert len(list_datasets()) == 3
    assert get_dataset("ecommerce").name == "ecommerce"

    db = InMemoryEvaluationDatabase(datasets)
    pool = await db.setup()
    try:
        async with pool.acquire() as conn:
            # Query ecommerce customers count
            rec = await conn.fetchval("SELECT count(*) FROM eval_ecommerce.customers")
            assert rec == 8

            # Query saas accounts count
            rec_saas = await conn.fetchval("SELECT count(*) FROM eval_saas.accounts")
            assert rec_saas == 10

            # Query finance departments count
            rec_fin = await conn.fetchval("SELECT count(*) FROM eval_finance.departments")
            assert rec_fin == 5
    finally:
        await db.teardown()


# ---------------------------------------------------------------------------
# 9. Test Case Registry and JSON Loader Tests
# ---------------------------------------------------------------------------
def test_test_case_registry_and_json(tmp_path):
    registry = get_default_registry()
    all_cases = registry.list_all()
    assert len(all_cases) >= 15

    # Filtering
    aggs = registry.filter(category=EvaluationCategory.BASIC_AGGREGATION)
    assert len(aggs) >= 4
    joins = registry.filter(tag="joins")
    assert len(joins) >= 3

    # Save to JSON and load back
    sample_json = tmp_path / "custom_cases.json"
    sample_data = [
        {
            "id": "custom_01",
            "name": "Custom Test",
            "category": "basic_aggregation",
            "question": "What is the total?",
            "dataset_name": "ecommerce",
            "cube_table": "orders",
        }
    ]
    sample_json.write_text(json.dumps(sample_data))
    loaded = load_test_cases_from_file(sample_json)
    assert len(loaded) == 1
    assert loaded[0].id == "custom_01"


# ---------------------------------------------------------------------------
# 10. EvaluationRunner Mock Suite Run Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_runner_mock_suite():
    cases = get_default_test_cases()
    # Test a representative sample of 5 cases across different categories
    selected = [c for c in cases if c.id in (
        "ecom_01_total_revenue",
        "ecom_03_top_customers",
        "ecom_06_ambiguous_best",
        "ecom_08_error_recovery",
        "ecom_10_bar_chart",
    )]
    runner = EvaluationRunner(mock_mode=True, force_in_memory=True)
    report = await runner.run_suite(selected)

    assert report.total_cases == 5
    assert report.passed_cases == 5
    assert report.failed_cases == 0
    assert report.pass_rate == 100.0
    assert report.average_score >= 0.95


# ---------------------------------------------------------------------------
# 11. Reporters Tests
# ---------------------------------------------------------------------------
def test_reporters(tmp_path):
    res = EvaluationResult(
        test_case_id="ecom_01",
        test_case_name="Total Revenue",
        category="basic_aggregation",
        passed=True,
        score=1.0,
        metric_scores={
            "sql_execution": MetricScore(name="sql_execution", score=1.0, passed=True)
        },
    )
    report = EvaluationReport(
        run_id="eval-test",
        model_name="mock-model",
        total_cases=1,
        passed_cases=1,
        failed_cases=0,
        pass_rate=100.0,
        average_score=1.0,
        total_duration_ms=50,
        metric_summary={
            "sql_execution": {"total_evaluated": 1, "passed": 1, "pass_rate": 100.0, "avg_score": 1.0}
        },
        category_summary={
            "basic_aggregation": {"total": 1, "passed": 1, "failed": 0, "pass_rate": 100.0, "avg_score": 1.0}
        },
        results=[res],
    )

    console_str = ConsoleReporter.render(report)
    assert "QueryLens Agent Evaluation Report" in console_str
    assert "eval-test" in console_str

    json_path = tmp_path / "report.json"
    JsonReporter.save(report, json_path)
    assert json_path.exists()
    assert "eval-test" in json_path.read_text()

    md_path = tmp_path / "report.md"
    MarkdownReporter.save(report, md_path)
    assert md_path.exists()
    assert "# QueryLens Agent Evaluation Report" in md_path.read_text()


# ---------------------------------------------------------------------------
# 12. CLI Arguments Parsing Tests
# ---------------------------------------------------------------------------
def test_cli_parsing():
    args = parse_args(["--category", "basic_aggregation", "--mock", "--fail-under", "85.0"])
    assert args.category == "basic_aggregation"
    assert args.mock is True
    assert args.fail_under == 85.0


# ---------------------------------------------------------------------------
# 13. FastAPI Evaluation Endpoints Tests
# ---------------------------------------------------------------------------
def test_api_evaluation_endpoints():
    settings = Settings(
        _env_file=None,
        database_url="postgresql://localhost/test",
        jwt_secret="s" * 40,
        openai_api_key="test-key",
    )
    app = create_app(settings)
    client = TestClient(app)

    # 1. GET /api/evaluation/suites
    resp_suites = client.get("/evaluation/suites")
    assert resp_suites.status_code == 200
    data = resp_suites.json()
    assert "cases" in data
    assert data["total_cases"] >= 15

    # 2. GET /api/evaluation/datasets
    resp_datasets = client.get("/evaluation/datasets")
    assert resp_datasets.status_code == 200
    assert "ecommerce" in resp_datasets.json()["datasets"]

    # 3. POST /api/evaluation/run
    resp_run = client.post(
        "/evaluation/run",
        json={"case_id": "ecom_01_total_revenue", "mock_mode": True},
    )
    assert resp_run.status_code == 200
    report_data = resp_run.json()
    assert report_data["total_cases"] == 1
    assert report_data["passed_cases"] == 1
    assert report_data["pass_rate"] == 100.0
