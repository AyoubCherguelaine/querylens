"""Evaluator for clarification handling on ambiguous or underspecified questions."""

from typing import Any, Dict

from backend.evaluation.evaluators.base import BaseEvaluator
from backend.evaluation.models import MetricScore, TestCase


class ClarificationEvaluator(BaseEvaluator):
    """Evaluates whether the agent asks for clarification on ambiguous prompts."""

    name = "clarification"
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
        tools_called = [s.get("tool") for s in steps if s.get("tool") and s.get("tool") != "model"]

        called_ask_user = "ask_user" in tools_called or status == "clarification"

        if test_case.expected_clarification:
            # The agent SHOULD ask for clarification
            if not called_ask_user:
                return MetricScore(
                    name=self.name,
                    score=0.0,
                    passed=False,
                    weight=self.default_weight,
                    message="Ambiguous question: agent should have called ask_user, but proceeded without clarifying.",
                    details={
                        "status": status,
                        "tools_called": tools_called,
                        "answer": agent_outcome.get("answer", "")[:100],
                    },
                )

            # Extract the clarification question
            ask_steps = [s for s in steps if s.get("tool") == "ask_user"]
            clarification_text = ""
            if ask_steps:
                clarification_text = ask_steps[-1].get("arguments", {}).get("question", "")
            if not clarification_text:
                clarification_text = agent_outcome.get("answer", "")

            if not clarification_text.strip():
                return MetricScore(
                    name=self.name,
                    score=0.5,
                    passed=False,
                    weight=self.default_weight,
                    message="Agent called ask_user but provided an empty clarification question.",
                    details={"clarification_text": ""},
                )

            # Check for keyword relevance if provided
            matched_keywords = []
            if test_case.clarification_keywords:
                lowered = clarification_text.lower()
                for kw in test_case.clarification_keywords:
                    if kw.lower() in lowered:
                        matched_keywords.append(kw)

                if not matched_keywords:
                    return MetricScore(
                        name=self.name,
                        score=0.7,
                        passed=True,
                        weight=self.default_weight,
                        message=f"Agent asked clarification, but did not mention expected focus areas: {test_case.clarification_keywords}.",
                        details={
                            "clarification_text": clarification_text,
                            "expected_keywords": test_case.clarification_keywords,
                            "matched_keywords": [],
                        },
                    )

            return MetricScore(
                name=self.name,
                score=1.0,
                passed=True,
                weight=self.default_weight,
                message="Agent appropriately identified ambiguity and requested clarification.",
                details={
                    "clarification_text": clarification_text,
                    "matched_keywords": matched_keywords,
                },
            )

        # Non-ambiguous question: agent should NOT unnecessarily ask for clarification
        if called_ask_user:
            return MetricScore(
                name=self.name,
                score=0.2,
                passed=False,
                weight=self.default_weight,
                message="Unnecessary clarification: agent asked for clarification on an unambiguous question.",
                details={"status": status, "tools_called": tools_called},
            )

        return MetricScore(
            name=self.name,
            score=1.0,
            passed=True,
            weight=0.0,
            message="No clarification needed and none requested.",
            details={"skipped": True},
        )
