import pytest

from backend.services.chat_agent import history_context, run_agent
from backend.services.narrative import query_evidence, write_analysis
from tests.test_chat_agent import DEFINITIONS, mock_agent, response
from tests.test_planner import settings


def draft(evidence_ids=None):
    return {
        "title": "Restaurant dataset overview",
        "summary": "The data covers eight restaurants.",
        "sections": [
            {
                "heading": "Coverage",
                "text": "Eight restaurants appear in the source.\n\nThis count describes the dataset, not the whole market.",
            },
            {
                "heading": "What to check next",
                "text": "Compare regions before drawing geographic conclusions.",
            },
        ],
        "evidence_ids": evidence_ids if evidence_ids is not None else ["call-0"],
    }


def test_narrative_preserves_evidence_and_limits():
    evidence = {
        "q1": {
            "sql": "SELECT * FROM source.restaurants",
            "rows": [{"n": 8}],
            "truncated": True,
            "cells_truncated": True,
            "executed_at": "2026-10-17T10:00:00Z",
        }
    }
    report = write_analysis(draft(["q1", "q1"]), evidence)
    assert len(report["evidence"]) == 1
    assert report["evidence"][0]["truncated"] is True
    assert report["evidence"][0]["cells_truncated"] is True
    assert report["sections"][0]["heading"] == "Coverage"


@pytest.mark.parametrize("references", [[], ["missing"], ["failed-query"]])
def test_narrative_requires_actual_query_evidence(references):
    with pytest.raises(ValueError):
        write_analysis(draft(references), {})


def test_only_successful_queries_can_support_writing():
    steps = [
        {"id": "schema", "tool": "source_schema", "status": "completed", "output": {}},
        {"id": "failed", "tool": "query_postgres", "status": "failed", "output": {"error": "bad"}},
        {
            "id": "empty",
            "tool": "query_postgres",
            "status": "completed",
            "output": {"sql": "SELECT 1 WHERE false", "rows": []},
        },
    ]
    assert list(query_evidence(steps, [])) == ["empty"]


async def test_agent_writes_report_and_streams_completion(monkeypatch):
    _, query = mock_agent(
        monkeypatch,
        [
            response(
                "query_postgres",
                {"sql": "SELECT count(*) AS n FROM sales.orders", "purpose": "Count source rows"},
                0,
            ),
            response("write_analysis", draft(), 1),
        ],
    )
    events = []

    async def emit(event):
        events.append(event)

    result = await run_agent(None, settings(), DEFINITIONS[0], "Write an analysis", [], emit)
    assert result["status"] == "answered" and result["report"]["title"] == draft()["title"]
    assert result["answer"] == draft()["summary"]
    assert result["report"]["evidence"][0]["rows"] == [{"n": 8}]
    assert events[-1]["step"]["tool"] == "write_analysis"
    assert events[-1]["step"]["status"] == "completed"
    assert query.call_count == 1
    assert result["report"]["evidence"][0]["evidence_id"] == "call-0"


async def test_writing_only_followup_reuses_query_history(monkeypatch):
    client, query = mock_agent(
        monkeypatch, [response("write_analysis", draft(["history-0-query-0"]), 0)]
    )
    history = [
        {
            "question": "count",
            "result": {
                "answer": "Eight rows",
                "sql": "SELECT count(*) AS n FROM sales.orders",
                "rows": [{"n": 8}],
            },
        }
    ]
    result = await run_agent(None, settings(), DEFINITIONS[0], "Turn that into a summary", history)
    assert result["status"] == "answered"
    assert result["report"]["evidence"][0]["id"] == "history-0-query-0"
    query.assert_not_called()
    # The report and its supporting samples remain available for the next rewrite.
    previous = history_context([{"question": "write report", "result": result}])[0]
    assert previous["report"]["sections"] == draft()["sections"]
    assert previous["queries"][0]["rows"] == [{"n": 8}]
    assert client.responses.create.call_count == 1


async def test_report_without_evidence_returns_tool_error_and_can_recover(monkeypatch):
    mock_agent(
        monkeypatch,
        [
            response("write_analysis", draft(), 0),
            response("ask_user", {"question": "Which data should this report cover?"}, 1),
        ],
    )
    result = await run_agent(None, settings(), DEFINITIONS[0], "Write a report", [])
    assert result["status"] == "clarification" and "report" not in result
    writing = next(s for s in result["steps"] if s["tool"] == "write_analysis")
    assert writing["status"] == "failed"
