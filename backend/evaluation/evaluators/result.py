"""Evaluator for query result accuracy compared with expected results."""

import math
from typing import Any, Dict, List

from backend.database.pool import readonly
from backend.evaluation.evaluators.base import BaseEvaluator
from backend.evaluation.models import MetricScore, TestCase


def normalize_value(val: Any) -> Any:
    """Normalize values for robust equality checking."""
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        trimmed = val.strip()
        # Try parsing as float if numeric string
        try:
            return float(trimmed)
        except ValueError:
            return trimmed.lower()
    return str(val)


def values_match(val1: Any, val2: Any, tolerance: float = 0.01) -> bool:
    """Compare two values with optional numeric tolerance."""
    n1, n2 = normalize_value(val1), normalize_value(val2)
    if n1 is None and n2 is None:
        return True
    if n1 is None or n2 is None:
        return False
    if isinstance(n1, float) and isinstance(n2, float):
        if math.isnan(n1) and math.isnan(n2):
            return True
        return math.isclose(n1, n2, rel_tol=tolerance, abs_tol=tolerance)
    return n1 == n2


def rows_match(
    actual_rows: List[Dict[str, Any]],
    expected_rows: List[Dict[str, Any]],
    tolerance: float = 0.01,
    order_sensitive: bool = False,
    subset_match: bool = False,
) -> tuple[float, str]:
    """Compare list of actual rows with expected rows."""
    if not expected_rows and not actual_rows:
        return 1.0, "Both actual and expected rows are empty."

    if not actual_rows:
        return 0.0, f"Actual query returned 0 rows, expected {len(expected_rows)} rows."

    if not subset_match and len(actual_rows) != len(expected_rows):
        return 0.0, f"Row count mismatch: got {len(actual_rows)}, expected {len(expected_rows)}."

    def row_matches(r1: Dict[str, Any], r2: Dict[str, Any]) -> bool:
        # Check if values match regardless of column alias differences when number of cols match
        r1_keys = list(r1.keys())
        r2_keys = list(r2.keys())

        # If column names overlap:
        common_keys = [k for k in r1_keys if k in r2]
        if common_keys and len(common_keys) == len(r2_keys):
            return all(values_match(r1[k], r2[k], tolerance) for k in common_keys)

        # Fallback: compare by positional values if lengths match
        v1 = list(r1.values())
        v2 = list(r2.values())
        if len(v1) == len(v2):
            return all(values_match(a, b, tolerance) for a, b in zip(v1, v2))
        return False

    if order_sensitive:
        matched = 0
        limit = min(len(actual_rows), len(expected_rows))
        for i in range(limit):
            if row_matches(actual_rows[i], expected_rows[i]):
                matched += 1
        score = matched / len(expected_rows)
        if score == 1.0:
            return 1.0, "All rows match in exact expected order."
        return score, f"Ordered match: {matched}/{len(expected_rows)} rows matched."

    # Unordered matching (multiset)
    unmatched_expected = list(expected_rows)
    matched_count = 0

    for act in actual_rows:
        found_idx = None
        for idx, exp in enumerate(unmatched_expected):
            if row_matches(act, exp):
                found_idx = idx
                break
        if found_idx is not None:
            matched_count += 1
            unmatched_expected.pop(found_idx)

    score = matched_count / len(expected_rows)
    if score == 1.0:
        return 1.0, f"All {matched_count} rows match expected results."
    return score, f"Partial match: {matched_count}/{len(expected_rows)} expected rows matched."


class ResultAccuracyEvaluator(BaseEvaluator):
    """Evaluates the correctness of data returned by the agent's SQL queries."""

    name = "result_accuracy"
    default_weight = 2.0

    async def evaluate(
        self,
        test_case: TestCase,
        agent_outcome: Dict[str, Any],
        definitions: list,
        pool: Any = None,
    ) -> MetricScore:
        if test_case.expected_clarification or not test_case.expected_result:
            return MetricScore(
                name=self.name,
                score=1.0,
                passed=True,
                weight=0.0,
                message="No expected query result comparison specified for this test case.",
                details={"skipped": True},
            )

        expected_spec = test_case.expected_result
        expected_rows = expected_spec.rows

        # If a ground-truth SQL query is provided, execute it against the pool to get expected rows
        if expected_spec.sql and pool is not None:
            try:
                expected_rows = await self._execute_ground_truth(pool, expected_spec.sql)
            except Exception as e:
                return MetricScore(
                    name=self.name,
                    score=0.0,
                    passed=False,
                    weight=self.default_weight,
                    message=f"Failed to execute ground truth SQL: {e}",
                    details={"ground_truth_sql": expected_spec.sql, "error": str(e)},
                )

        if expected_rows is None:
            return MetricScore(
                name=self.name,
                score=1.0,
                passed=True,
                weight=0.0,
                message="No expected rows available for comparison.",
                details={"skipped": True},
            )

        # Extract agent's query results from outcome or query steps
        actual_rows = agent_outcome.get("rows")
        if actual_rows is None:
            # Look in steps for completed query_postgres
            query_steps = [
                s
                for s in agent_outcome.get("steps", [])
                if s.get("tool") == "query_postgres"
                and s.get("status") == "completed"
                and "rows" in s.get("output", {})
            ]
            if query_steps:
                actual_rows = query_steps[-1]["output"]["rows"]
            else:
                actual_rows = []

        score, reason = rows_match(
            actual_rows=actual_rows,
            expected_rows=expected_rows,
            tolerance=expected_spec.numeric_tolerance,
            order_sensitive=expected_spec.order_sensitive,
            subset_match=expected_spec.subset_match,
        )

        passed = score >= 0.99
        return MetricScore(
            name=self.name,
            score=score,
            passed=passed,
            weight=self.default_weight,
            message=reason,
            details={
                "actual_row_count": len(actual_rows),
                "expected_row_count": len(expected_rows),
                "actual_rows_sample": actual_rows[:3],
                "expected_rows_sample": expected_rows[:3],
            },
        )

    async def _execute_ground_truth(self, pool: Any, sql: str) -> List[Dict[str, Any]]:
        """Execute reference SQL to fetch ground truth rows."""
        async with readonly(pool, 10000) as connection:
            records = await connection.fetch(sql)
            return [dict(r) for r in records]
