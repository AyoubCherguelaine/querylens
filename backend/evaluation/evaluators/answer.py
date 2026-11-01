"""Evaluator for final answer accuracy, grounding, and relevance."""

import re
from typing import Any, Dict, List

from backend.evaluation.evaluators.base import BaseEvaluator
from backend.evaluation.models import MetricScore, TestCase


def extract_numbers(text: str) -> List[float]:
    """Extract numeric values from text (handling commas, currency signs, percentages)."""
    # Remove currency symbols and comma separators
    cleaned = re.sub(r"[$,€£]", "", text)
    pattern = r"-?\b\d+(?:,\d{3})*(?:\.\d+)?\b"
    matches = re.findall(pattern, cleaned)
    results = []
    for m in matches:
        try:
            results.append(float(m.replace(",", "")))
        except ValueError:
            continue
    return results


class AnswerAccuracyEvaluator(BaseEvaluator):
    """Evaluates the factual accuracy, relevance, and grounding of the final answer."""

    name = "answer_accuracy"
    default_weight = 1.0

    async def evaluate(
        self,
        test_case: TestCase,
        agent_outcome: Dict[str, Any],
        definitions: list,
        pool: Any = None,
    ) -> MetricScore:
        status = agent_outcome.get("status")
        answer = agent_outcome.get("answer", "")
        report = agent_outcome.get("report")
        chart = agent_outcome.get("chart")

        full_text = answer
        if report:
            full_text += " " + report.get("title", "") + " " + report.get("summary", "")
            for sec in report.get("sections", []):
                full_text += " " + sec.get("heading", "") + " " + sec.get("text", "")
        if chart:
            full_text += " " + chart.get("title", "") + " " + chart.get("description", "")

        if not full_text.strip():
            return MetricScore(
                name=self.name,
                score=0.0,
                passed=False,
                weight=self.default_weight,
                message="Agent produced an empty final answer.",
                details={"status": status},
            )

        if status == "error":
            return MetricScore(
                name=self.name,
                score=0.0,
                passed=False,
                weight=self.default_weight,
                message=f"Agent terminated with error: {answer}",
                details={"status": status, "answer": answer},
            )

        reasons = []
        penalties = 0.0

        # Check expected keywords/substrings
        if test_case.expected_answer_contains:
            missing_keywords = []
            text_lower = full_text.lower()
            for token in test_case.expected_answer_contains:
                if token.lower() not in text_lower:
                    missing_keywords.append(token)

            if missing_keywords:
                fraction_missing = len(missing_keywords) / len(test_case.expected_answer_contains)
                penalties += fraction_missing * 0.5
                reasons.append(f"Missing expected answer keywords: {missing_keywords}")

        # Check numerical grounding if rows exist
        rows = agent_outcome.get("rows", [])
        if rows and not test_case.expected_clarification:
            query_numbers = []
            for r in rows[:5]:
                for val in r.values():
                    if isinstance(val, (int, float)):
                        query_numbers.append(float(val))

            answer_numbers = extract_numbers(full_text)
            if query_numbers and answer_numbers:
                # Check if at least one key number from the query result appears in the text
                # (matching either exact or rounded to integer)
                matched_num = False
                for q_num in query_numbers:
                    for a_num in answer_numbers:
                        if abs(q_num - a_num) < 0.01 or (q_num > 10 and abs(round(q_num) - round(a_num)) == 0):
                            matched_num = True
                            break
                    if matched_num:
                        break

                if not matched_num:
                    reasons.append("Answer does not appear to cite key numerical results from query output.")
                    penalties += 0.2

        score = max(0.0, 1.0 - penalties)
        passed = score >= 0.75

        message = "Answer accurately addresses question." if passed else "; ".join(reasons)

        return MetricScore(
            name=self.name,
            score=round(score, 2),
            passed=passed,
            weight=self.default_weight,
            message=message,
            details={
                "answer_snippet": answer[:150],
                "expected_keywords": test_case.expected_answer_contains or [],
                "reasons": reasons,
            },
        )
