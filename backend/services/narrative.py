"""Validate written analysis and attach actual query evidence."""

from pydantic import Field

from backend.schemas import StrictModel


class AnalysisSection(StrictModel):
    heading: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1, max_length=8000)


class WrittenAnalysis(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1, max_length=3000)
    sections: list[AnalysisSection] = Field(min_length=1, max_length=8)
    evidence_ids: list[str] = Field(min_length=1, max_length=12)


def query_evidence(steps, history):
    evidence = {}
    for turn in history:
        for query in turn["queries"]:
            output = query.get("result", query)
            if query.get("status") == "failed" or not output.get("sql"):
                continue
            evidence[query["evidence_id"]] = dict(output)
    for step in steps:
        if step["status"] == "completed" and step["tool"] in {"query_postgres", "sample_table"}:
            evidence[step["id"]] = dict(step["output"])
    return evidence


def write_analysis(arguments, evidence):
    draft = WrittenAnalysis.model_validate(arguments)
    if any(
        not value.strip()
        for value in [draft.title, draft.summary]
        + [value for section in draft.sections for value in (section.heading, section.text)]
    ):
        raise ValueError("Write nonempty titles, headings and paragraphs.")
    references = list(dict.fromkeys(draft.evidence_ids))
    if any(reference not in evidence for reference in references):
        raise ValueError(
            "Cite only successful query evidence IDs from tool calls or history. "
            "Available evidence IDs: " + ", ".join(evidence)
        )
    return {
        **draft.model_dump(exclude={"evidence_ids"}),
        "evidence": [{"id": reference, **evidence[reference]} for reference in references],
    }
