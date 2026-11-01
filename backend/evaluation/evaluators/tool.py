"""Evaluator for tool selection and valid usage."""

from typing import Any, Dict

from backend.evaluation.evaluators.base import BaseEvaluator
from backend.evaluation.models import MetricScore, TestCase


class ToolUsageEvaluator(BaseEvaluator):
    """Evaluates correct tool selection, required/forbidden tools, and valid parameters."""

    name = "tool_selection"
    default_weight = 1.0

    async def evaluate(
        self,
        test_case: TestCase,
        agent_outcome: Dict[str, Any],
        definitions: list,
        pool: Any = None,
    ) -> MetricScore:
        steps = agent_outcome.get("steps", [])
        tools_called = [s.get("tool") for s in steps if s.get("tool") and s.get("tool") != "model"]

        reasons = []
        penalties = 0.0

        # Check expected tools
        if test_case.expected_tools:
            for exp_tool in test_case.expected_tools:
                if exp_tool not in tools_called:
                    reasons.append(f"Missing expected tool: '{exp_tool}'")
                    penalties += 0.4

        # Check forbidden tools
        if test_case.forbidden_tools:
            for forb_tool in test_case.forbidden_tools:
                if forb_tool in tools_called:
                    reasons.append(f"Forbidden tool invoked: '{forb_tool}'")
                    penalties += 0.5

        # Check narrative report validity if write_analysis was expected/called
        report = agent_outcome.get("report")
        if "write_analysis" in tools_called or test_case.category.value == "narrative_report":
            if not report:
                reasons.append("Expected valid report from write_analysis but none was produced")
                penalties += 0.5
            else:
                if not report.get("title") or not report.get("summary"):
                    reasons.append("Report missing title or summary")
                    penalties += 0.2
                if not report.get("sections"):
                    reasons.append("Report missing sections")
                    penalties += 0.2
                if not report.get("evidence"):
                    reasons.append("Report missing cited evidence queries")
                    penalties += 0.2

        # Check chart validity if create_graph was expected/called
        chart = agent_outcome.get("chart")
        if "create_graph" in tools_called or test_case.category.value == "visualization":
            if not chart:
                reasons.append("Expected chart from create_graph but none was produced")
                penalties += 0.5
            else:
                if test_case.expected_chart_type:
                    actual_type = chart.get("chart_type")
                    if actual_type != test_case.expected_chart_type:
                        reasons.append(
                            f"Chart type mismatch: got '{actual_type}', expected '{test_case.expected_chart_type}'"
                        )
                        penalties += 0.3
                if not chart.get("x_key") or not chart.get("y_keys"):
                    reasons.append("Chart missing x_key or y_keys definition")
                    penalties += 0.3

        score = max(0.0, 1.0 - penalties)
        passed = score >= 0.8 and len(reasons) == 0

        message = "All tool usage criteria met." if passed else "; ".join(reasons)

        return MetricScore(
            name=self.name,
            score=round(score, 2),
            passed=passed,
            weight=self.default_weight,
            message=message,
            details={
                "tools_called": tools_called,
                "expected_tools": test_case.expected_tools or [],
                "forbidden_tools": test_case.forbidden_tools or [],
                "reasons": reasons,
            },
        )
