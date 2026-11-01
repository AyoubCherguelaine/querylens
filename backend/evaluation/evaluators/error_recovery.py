"""Evaluator for agent error recovery when queries or tools fail."""

from typing import Any, Dict

from backend.evaluation.evaluators.base import BaseEvaluator
from backend.evaluation.models import MetricScore, TestCase


class ErrorRecoveryEvaluator(BaseEvaluator):
    """Evaluates whether the agent recovers from intermediate SQL or tool errors."""

    name = "error_recovery"
    default_weight = 1.5

    async def evaluate(
        self,
        test_case: TestCase,
        agent_outcome: Dict[str, Any],
        definitions: list,
        pool: Any = None,
    ) -> MetricScore:
        steps = agent_outcome.get("steps", [])
        status = agent_outcome.get("status")

        failed_steps = [s for s in steps if s.get("status") == "failed"]
        completed_steps = [s for s in steps if s.get("status") == "completed"]

        has_failures = len(failed_steps) > 0
        final_turn_success = status in {"answered", "clarification"}

        if test_case.expected_error_recovery:
            # We expected the agent to experience an error and recover
            if not has_failures:
                return MetricScore(
                    name=self.name,
                    score=0.7,
                    passed=True,
                    weight=self.default_weight,
                    message="Expected error recovery scenario, but no intermediate error was encountered.",
                    details={"failed_steps": 0, "final_status": status},
                )

            # Check if there was a subsequent successful tool step after the failed step
            first_fail_idx = next(i for i, s in enumerate(steps) if s.get("status") == "failed")
            recovered_steps = [
                s
                for i, s in enumerate(steps)
                if i > first_fail_idx
                and s.get("status") == "completed"
                and s.get("tool") != "model"
            ]

            if recovered_steps and final_turn_success:
                return MetricScore(
                    name=self.name,
                    score=1.0,
                    passed=True,
                    weight=self.default_weight,
                    message=f"Agent encountered {len(failed_steps)} error(s) and successfully recovered.",
                    details={
                        "failed_step_tools": [s.get("tool") for s in failed_steps],
                        "recovered_tools": [s.get("tool") for s in recovered_steps],
                        "final_status": status,
                    },
                )

            return MetricScore(
                name=self.name,
                score=0.0,
                passed=False,
                weight=self.default_weight,
                message=f"Agent failed to recover after encountering tool error: {failed_steps[-1].get('output', {}).get('error', 'unknown error')}.",
                details={
                    "failed_step": failed_steps[-1],
                    "final_status": status,
                },
            )

        # Standard scenario (error recovery not explicitly targeted)
        if not has_failures:
            return MetricScore(
                name=self.name,
                score=1.0,
                passed=True,
                weight=0.0,
                message="Clean execution without errors.",
                details={"skipped": True},
            )

        # Unexpected intermediate errors occurred
        if final_turn_success and completed_steps:
            return MetricScore(
                name=self.name,
                score=1.0,
                passed=True,
                weight=0.5,
                message=f"Agent overcame {len(failed_steps)} unexpected tool error(s) and reached a valid answer.",
                details={"failed_step_count": len(failed_steps)},
            )

        return MetricScore(
            name=self.name,
            score=0.0,
            passed=False,
            weight=self.default_weight,
            message="Unrecovered error during execution.",
            details={"failed_step_count": len(failed_steps), "final_status": status},
        )
