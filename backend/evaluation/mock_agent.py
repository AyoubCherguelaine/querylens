"""Mock simulator providing canned responses for offline testing and CI evaluation."""

import json
from types import SimpleNamespace
from typing import Any, Dict, List

from backend.evaluation.models import TestCase


def build_function_call_response(name: str, arguments: Dict[str, Any], call_id: str):
    """Build response matching OpenAI Responses API format."""
    return SimpleNamespace(
        status="completed",
        output=[
            SimpleNamespace(
                type="function_call",
                name=name,
                arguments=json.dumps(arguments),
                call_id=call_id,
            )
        ],
    )


def get_mock_responses_for_test_case(test_case: TestCase) -> List[Any]:
    """Generate realistic sequence of model responses for a given test case."""
    cid = test_case.id

    if test_case.expected_clarification or "ambiguous" in cid:
        clarifying_q = (
            "Could you please clarify whether you mean best-selling products by quantity or highest revenue customers, "
            "and what date range to examine?"
            if "best" in cid
            else "Could you specify the timeframe and metric you would like to evaluate?"
        )
        return [build_function_call_response("ask_user", {"question": clarifying_q}, "call-clarify")]

    if test_case.expected_error_recovery or "recovery" in cid:
        return [
            # 1. Failing query with invalid column name
            build_function_call_response(
                "query_postgres",
                {"sql": "SELECT sum(sales_amount) FROM eval_ecommerce.orders WHERE status = 'completed'", "purpose": "Sum sales amount"},
                "call-err-1",
            ),
            # 2. Self-corrected query with valid column name
            build_function_call_response(
                "query_postgres",
                {"sql": "SELECT sum(total_amount) AS total_revenue FROM eval_ecommerce.orders WHERE status = 'completed'", "purpose": "Sum total amount"},
                "call-corr-2",
            ),
            # 3. Finish
            build_function_call_response(
                "finish",
                {"answer": "The total revenue from completed orders is $40,229.00 across 12 orders."},
                "call-fin-3",
            ),
        ]

    if test_case.category.value == "narrative_report" or "report" in cid:
        return [
            build_function_call_response(
                "query_postgres",
                {
                    "sql": "SELECT c.segment, sum(o.total_amount) AS segment_revenue FROM eval_ecommerce.orders o JOIN eval_ecommerce.customers c ON o.customer_id = c.id WHERE o.status = 'completed' GROUP BY c.segment ORDER BY segment_revenue DESC",
                    "purpose": "Query revenue by customer segment",
                },
                "call-query-1",
            ),
            build_function_call_response(
                "write_analysis",
                {
                    "title": "Sales Performance Analysis by Customer Segment",
                    "summary": "Enterprise customers generate the vast majority of completed revenue ($30,100), followed by SMB ($7,700) and Consumer ($2,429).",
                    "sections": [
                        {
                            "heading": "Segment Breakdown",
                            "text": "Enterprise orders represent 75% of overall gross receipts. SMB customers provide steady recurring volume, while Consumer sales remain smaller in ticket size.",
                        },
                        {
                            "heading": "Strategic Recommendations",
                            "text": "Prioritize account management and premium service for Enterprise clients while expanding Consumer promotions.",
                        },
                    ],
                    "evidence_ids": ["call-query-1"],
                },
                "call-report-2",
            ),
        ]

    if test_case.category.value == "visualization" or "chart" in cid:
        return [
            build_function_call_response(
                "query_postgres",
                {
                    "sql": "SELECT c.segment, sum(o.total_amount) AS revenue FROM eval_ecommerce.orders o JOIN eval_ecommerce.customers c ON o.customer_id = c.id WHERE o.status = 'completed' GROUP BY c.segment ORDER BY revenue DESC",
                    "purpose": "Query segment revenue for chart",
                },
                "call-query-1",
            ),
            build_function_call_response(
                "create_graph",
                {
                    "title": "Revenue by Customer Segment",
                    "chart_type": test_case.expected_chart_type or "bar",
                    "description": "Bar chart comparing revenue across customer segments.",
                    "x_key": "segment",
                    "y_keys": ["revenue"],
                    "z_key": "",
                    "group_mode": "grouped",
                    "x_label": "Segment",
                    "y_label": "Revenue ($)",
                    "evidence_id": "call-query-1",
                },
                "call-chart-2",
            ),
        ]

    # Standard query cases
    sql = ""
    if test_case.expected_result and test_case.expected_result.sql:
        sql = test_case.expected_result.sql
    else:
        sql = f"SELECT count(*) FROM {test_case.dataset_name}.{test_case.cube_table}"

    answer = "The analysis found the requested results grounded in the dataset."
    if test_case.expected_answer_contains:
        answer = f"The query completed: {' '.join(test_case.expected_answer_contains)}."

    return [
        build_function_call_response(
            "query_postgres",
            {"sql": sql, "purpose": f"Executing query for {test_case.name}"},
            "call-q-1",
        ),
        build_function_call_response(
            "finish",
            {"answer": answer},
            "call-fin-2",
        ),
    ]
