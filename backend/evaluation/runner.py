"""Core test runner for the QueryLens Agent Evaluation Framework."""

import logging
import time
from typing import Any, Callable, Dict, List, Optional
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from pydantic import SecretStr

from backend.core.config import Settings, get_settings
from backend.evaluation.datasets import (
    BaseDataset,
    EcommerceDataset,
    FinanceDataset,
    InMemoryEvaluationDatabase,
    PostgresEvaluationDatabase,
    SaasDataset,
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
from backend.evaluation.mock_agent import get_mock_responses_for_test_case
from backend.evaluation.models import (
    EvaluationReport,
    EvaluationResult,
    MetricScore,
    TestCase,
)
from backend.services.chat_agent import run_agent

logger = logging.getLogger(__name__)


class EvaluationRunner:
    """Orchestrates running test cases against the QueryLens agent and evaluating outcomes."""

    def __init__(
        self,
        datasets: Optional[List[BaseDataset]] = None,
        evaluators: Optional[List[BaseEvaluator]] = None,
        settings: Optional[Settings] = None,
        mock_mode: bool = False,
        model_name: Optional[str] = None,
        pass_threshold: float = 0.80,
        force_in_memory: bool = False,
    ):
        self.datasets = datasets or [EcommerceDataset(), SaasDataset(), FinanceDataset()]
        self.evaluators = evaluators or [
            SQLEvaluator(),
            ResultAccuracyEvaluator(),
            ToolUsageEvaluator(),
            ClarificationEvaluator(),
            ErrorRecoveryEvaluator(),
            AnswerAccuracyEvaluator(),
        ]
        self.settings = settings or self._get_default_settings()
        self.mock_mode = mock_mode
        self.model_name = model_name or self.settings.openai_model
        self.pass_threshold = pass_threshold
        self.force_in_memory = force_in_memory

        self._dataset_map = {d.name: d for d in self.datasets}

    def _get_default_settings(self) -> Settings:
        """Construct safe default settings for evaluation."""
        try:
            return get_settings()
        except Exception:
            return Settings(
                _env_file=None,
                database_url=SecretStr("postgresql://postgres:postgres@localhost:5435/querylens_eval"),
                jwt_secret=SecretStr("a" * 40),
                openai_api_key=SecretStr("test-key"),
                openai_model="gpt-4o-mini",
            )

    async def run_suite(
        self,
        test_cases: List[TestCase],
        progress_callback: Optional[Callable[[EvaluationResult], None]] = None,
    ) -> EvaluationReport:
        """Execute a collection of test cases and generate an EvaluationReport."""
        run_id = f"eval-{uuid4().hex[:8]}"
        start_time = time.monotonic()

        # Provision database environment
        db = None
        pool = None
        use_in_memory = self.force_in_memory or self.mock_mode

        if not use_in_memory:
            # Check if Postgres is reachable
            try:
                db = PostgresEvaluationDatabase(
                    self.settings.database_url.get_secret_value(), self.datasets
                )
                pool = await db.setup()
            except Exception as e:
                logger.warning(
                    f"PostgreSQL connection unavailable ({e}); falling back to isolated in-memory engine."
                )
                use_in_memory = True

        if use_in_memory:
            db = InMemoryEvaluationDatabase(self.datasets)
            pool = await db.setup()

        results: List[EvaluationResult] = []
        try:
            for test_case in test_cases:
                result = await self.run_test_case(test_case, pool)
                results.append(result)
                if progress_callback:
                    progress_callback(result)
        finally:
            if db:
                await db.teardown()

        duration_ms = round((time.monotonic() - start_time) * 1000)
        return self._build_report(run_id, results, duration_ms)

    async def run_test_case(self, test_case: TestCase, pool: Any) -> EvaluationResult:
        """Run a single test case through QueryLens run_agent and evaluate results."""
        dataset = self._dataset_map.get(test_case.dataset_name)
        if not dataset:
            return EvaluationResult(
                test_case_id=test_case.id,
                test_case_name=test_case.name,
                category=test_case.category.value,
                passed=False,
                score=0.0,
                failure_reasons=[f"Unknown dataset '{test_case.dataset_name}'"],
            )

        cube = dataset.get_cube(test_case.cube_table)
        all_definitions = dataset.get_definitions()

        # Filter selected cubes if specific tables were requested
        if test_case.selected_tables:
            selected_cubes = [
                d
                for d in all_definitions
                if d.get("table") in test_case.selected_tables
                and d.get("schema") == dataset.schema_name
            ]
        else:
            selected_cubes = [
                d for d in all_definitions if d.get("schema") == dataset.schema_name
            ]

        # Prepare model settings
        model_settings = {"model": self.model_name}
        started = time.monotonic()

        # Execute agent
        if self.mock_mode:
            agent_outcome = await self._run_agent_mock(
                pool, cube, test_case, selected_cubes, model_settings, all_definitions
            )
        else:
            try:
                agent_outcome = await run_agent(
                    pool,
                    self.settings,
                    cube,
                    test_case.question,
                    test_case.conversation_history,
                    emit=None,
                    selected_cubes=selected_cubes,
                    model_settings=model_settings,
                )
            except Exception as e:
                logger.error(f"Error running agent on {test_case.id}: {e}", exc_info=True)
                agent_outcome = {
                    "status": "error",
                    "answer": f"Agent crashed with exception: {e}",
                    "steps": [],
                }

        duration_ms = round((time.monotonic() - started) * 1000)

        # Run evaluators
        metric_scores: Dict[str, MetricScore] = {}
        total_weighted_score = 0.0
        total_weight = 0.0
        failure_reasons: List[str] = []

        for evaluator in self.evaluators:
            try:
                m_score = await evaluator.evaluate(test_case, agent_outcome, all_definitions, pool)
                metric_scores[evaluator.name] = m_score
                if m_score.weight > 0:
                    total_weighted_score += m_score.score * m_score.weight
                    total_weight += m_score.weight
                if not m_score.passed and m_score.message:
                    failure_reasons.append(f"[{evaluator.name}] {m_score.message}")
            except Exception as e:
                logger.error(f"Evaluator '{evaluator.name}' failed on {test_case.id}: {e}")
                err_metric = MetricScore(
                    name=evaluator.name,
                    score=0.0,
                    passed=False,
                    message=f"Evaluator error: {e}",
                )
                metric_scores[evaluator.name] = err_metric
                failure_reasons.append(f"[{evaluator.name}] Exception: {e}")

        composite_score = (
            round(total_weighted_score / total_weight, 3) if total_weight > 0 else 0.0
        )
        passed = (composite_score >= self.pass_threshold) and (len(failure_reasons) == 0)

        # Extract generated SQL and tools used
        steps = agent_outcome.get("steps", [])
        tools_used = [s.get("tool") for s in steps if s.get("tool") and s.get("tool") != "model"]
        sql_steps = [
            s.get("arguments", {}).get("sql")
            for s in steps
            if s.get("tool") in {"query_postgres", "sample_table"}
            and s.get("arguments", {}).get("sql")
        ]
        generated_sql = sql_steps[-1] if sql_steps else agent_outcome.get("sql")

        return EvaluationResult(
            test_case_id=test_case.id,
            test_case_name=test_case.name,
            category=test_case.category.value,
            passed=passed,
            score=composite_score,
            duration_ms=duration_ms,
            metric_scores=metric_scores,
            agent_status=agent_outcome.get("status", "unknown"),
            agent_answer=agent_outcome.get("answer", ""),
            generated_sql=generated_sql,
            tools_used=tools_used,
            step_count=len(steps),
            steps=steps,
            failure_reasons=failure_reasons,
            debug_info={
                "report": agent_outcome.get("report"),
                "chart": agent_outcome.get("chart"),
                "row_count": len(agent_outcome.get("rows", [])),
            },
        )

    async def _run_agent_mock(
        self,
        pool: Any,
        cube: Dict[str, Any],
        test_case: TestCase,
        selected_cubes: List[Dict[str, Any]],
        model_settings: Dict[str, Any],
        definitions: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Execute run_agent with mocked OpenAI client simulating realistic tool calls."""
        canned_responses = get_mock_responses_for_test_case(test_case)

        client = AsyncMock()
        client.__aenter__.return_value = client
        client.responses.create.side_effect = canned_responses

        # Ensure settings has key so run_agent does not raise PlannerUnavailable
        safe_settings = self.settings.model_copy(
            update={"openai_api_key": SecretStr("test-key-mock")}
        )

        with (
            patch("backend.services.chat_agent.AsyncOpenAI", lambda **kw: client),
            patch("backend.services.chat_agent.discover", AsyncMock(return_value=definitions)),
        ):
            return await run_agent(
                pool,
                safe_settings,
                cube,
                test_case.question,
                test_case.conversation_history,
                emit=None,
                selected_cubes=selected_cubes,
                model_settings=model_settings,
            )

    def _build_report(
        self, run_id: str, results: List[EvaluationResult], duration_ms: int
    ) -> EvaluationReport:
        """Aggregate test case outcomes into a summary EvaluationReport."""
        total = len(results)
        passed = sum(1 for r in results if r.passed)
        failed = total - passed
        pass_rate = round((passed / total * 100), 1) if total > 0 else 0.0
        avg_score = round(sum(r.score for r in results) / total, 3) if total > 0 else 0.0

        # Category summary
        cat_map: Dict[str, List[EvaluationResult]] = {}
        for r in results:
            cat_map.setdefault(r.category, []).append(r)

        category_summary = {}
        for cat, cat_results in cat_map.items():
            cat_total = len(cat_results)
            cat_passed = sum(1 for cr in cat_results if cr.passed)
            category_summary[cat] = {
                "total": cat_total,
                "passed": cat_passed,
                "failed": cat_total - cat_passed,
                "pass_rate": round(cat_passed / cat_total * 100, 1),
                "avg_score": round(sum(cr.score for cr in cat_results) / cat_total, 3),
            }

        # Metric summary
        metric_map: Dict[str, List[MetricScore]] = {}
        for r in results:
            for m_name, m_score in r.metric_scores.items():
                if m_score.weight > 0:
                    metric_map.setdefault(m_name, []).append(m_score)

        metric_summary = {}
        for m_name, m_list in metric_map.items():
            m_total = len(m_list)
            m_passed = sum(1 for ms in m_list if ms.passed)
            metric_summary[m_name] = {
                "total_evaluated": m_total,
                "passed": m_passed,
                "pass_rate": round(m_passed / m_total * 100, 1) if m_total > 0 else 0.0,
                "avg_score": round(sum(ms.score for ms in m_list) / m_total, 3)
                if m_total > 0
                else 0.0,
            }

        summary_text = (
            f"Evaluated {total} scenarios in {duration_ms}ms with model '{self.model_name}'. "
            f"Pass rate: {pass_rate}% ({passed}/{total} passed). Average composite score: {avg_score:.2f}."
        )

        return EvaluationReport(
            run_id=run_id,
            model_name=self.model_name,
            total_cases=total,
            passed_cases=passed,
            failed_cases=failed,
            pass_rate=pass_rate,
            average_score=avg_score,
            total_duration_ms=duration_ms,
            category_summary=category_summary,
            metric_summary=metric_summary,
            results=results,
            failed_results=[r for r in results if not r.passed],
            summary_text=summary_text,
        )
