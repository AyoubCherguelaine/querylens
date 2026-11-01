"""Evaluator for SQL generation and execution success."""

from typing import Any, Dict

from backend.evaluation.evaluators.base import BaseEvaluator
from backend.evaluation.models import MetricScore, TestCase
from backend.services.agent_sql import validate_sql


class SQLEvaluator(BaseEvaluator):
    """Evaluates SQL query generation, AST validity, and database execution success."""

    name = "sql_execution"
    default_weight = 1.5

    async def evaluate(
        self,
        test_case: TestCase,
        agent_outcome: Dict[str, Any],
        definitions: list,
        pool: Any = None,
    ) -> MetricScore:
        # If this is an ambiguous question expecting clarification, SQL is not required.
        if test_case.expected_clarification:
            return MetricScore(
                name=self.name,
                score=1.0,
                passed=True,
                weight=0.0,
                message="Clarification question: SQL generation not required.",
                details={"clarification_expected": True},
            )

        steps = agent_outcome.get("steps", [])
        query_steps = [s for s in steps if s.get("tool") in {"query_postgres", "sample_table"}]

        if not query_steps:
            return MetricScore(
                name=self.name,
                score=0.0,
                passed=False,
                weight=self.default_weight,
                message="No SQL queries were generated or executed by the agent.",
                details={"step_count": len(steps)},
            )

        # Inspect all executed SQL steps
        validation_errors = []
        execution_errors = []
        successful_queries = []

        for step in query_steps:
            args = step.get("arguments", {})
            sql = args.get("sql")
            status = step.get("status")
            output = step.get("output", {})

            if sql:
                try:
                    validate_sql(sql, definitions)
                except ValueError as err:
                    validation_errors.append({"sql": sql, "error": str(err)})

            if status == "completed" and "rows" in output:
                successful_queries.append({"sql": sql, "row_count": len(output["rows"])})
            elif status == "failed":
                execution_errors.append({
                    "sql": sql,
                    "error": output.get("error", "Unknown execution error"),
                })

        # Final query success determination:
        # If there are successful queries and the final executed query succeeded, score 1.0.
        last_query_step = query_steps[-1]
        last_succeeded = last_query_step.get("status") == "completed"

        if last_succeeded and successful_queries and not validation_errors:
            return MetricScore(
                name=self.name,
                score=1.0,
                passed=True,
                weight=self.default_weight,
                message=f"SQL successfully generated and executed ({len(successful_queries)} successful queries).",
                details={
                    "successful_queries": len(successful_queries),
                    "execution_errors": len(execution_errors),
                    "last_query": last_query_step.get("arguments", {}).get("sql"),
                },
            )

        # If previous queries had errors but the agent recovered:
        if last_succeeded and successful_queries:
            return MetricScore(
                name=self.name,
                score=0.9,
                passed=True,
                weight=self.default_weight,
                message="SQL executed successfully after resolving earlier errors.",
                details={
                    "successful_queries": len(successful_queries),
                    "validation_errors": validation_errors,
                    "execution_errors": execution_errors,
                },
            )

        # Failure cases:
        score = 0.0
        msg_parts = []
        if validation_errors:
            msg_parts.append(f"{len(validation_errors)} query failed AST validation")
        if execution_errors:
            msg_parts.append(f"{len(execution_errors)} query failed database execution")

        return MetricScore(
            name=self.name,
            score=score,
            passed=False,
            weight=self.default_weight,
            message=f"SQL execution failed: {'; '.join(msg_parts)}.",
            details={
                "validation_errors": validation_errors,
                "execution_errors": execution_errors,
                "query_count": len(query_steps),
            },
        )
