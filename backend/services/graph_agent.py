"""Validate graph specifications and attach query evidence and special downloadable data source."""

import csv
import io
import re
from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import Field

from backend.schemas import StrictModel

ChartType = Literal["bar", "line", "area", "pie", "scatter"]


class GraphSpec(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    chart_type: ChartType = "bar"
    description: str = Field(min_length=1, max_length=4000)
    x_key: str = Field(min_length=1, max_length=128)
    y_keys: list[str] = Field(min_length=1, max_length=10)
    x_label: Optional[str] = Field(default=None, max_length=128)
    y_label: Optional[str] = Field(default=None, max_length=128)
    evidence_id: str = Field(min_length=1, max_length=128)


def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r"[^\w\s-]", "", name).strip().lower()
    return re.sub(r"[-\s]+", "_", cleaned) or "chart_data"


def rows_to_csv(rows: list[dict], columns: list[dict], title: str, sql: str) -> str:
    output = io.StringIO()
    output.write(f"# Data Source: {title}\n")
    if sql:
        single_line_sql = " ".join(sql.split())
        output.write(f"# SQL: {single_line_sql}\n")
    output.write(f"# Exported At: {datetime.now(timezone.utc).isoformat()}\n")
    output.write(f"# Rows: {len(rows)}\n")

    if not rows:
        return output.getvalue()

    keys = [c["key"] for c in columns] if columns else list(rows[0].keys())
    labels = [c.get("label", c["key"]) for c in columns] if columns else keys

    writer = csv.writer(output)
    writer.writerow(labels)
    for row in rows:
        writer.writerow([row.get(k, "") for k in keys])
    return output.getvalue()


def create_graph(arguments: dict, evidence: dict) -> dict:
    draft = GraphSpec.model_validate(arguments)
    if not draft.title.strip() or not draft.description.strip():
        raise ValueError("Write a nonempty title and description for the graph.")

    if draft.evidence_id not in evidence:
        raise ValueError(
            f"Cite a successful query evidence ID. '{draft.evidence_id}' not found. "
            f"Available evidence IDs: {', '.join(evidence) if evidence else 'none'}"
        )

    evidence_item = evidence[draft.evidence_id]
    rows = evidence_item.get("rows", [])
    if not rows:
        raise ValueError(f"Evidence '{draft.evidence_id}' has no result rows to plot.")

    columns = evidence_item.get("columns", [])
    available_keys = {c["key"] for c in columns} if columns else set(rows[0].keys())

    x_key = draft.x_key
    if x_key not in available_keys:
        match = next((k for k in available_keys if k.lower() == x_key.lower()), None)
        if match:
            x_key = match
        else:
            x_key = next(iter(available_keys))

    matched_y_keys = []
    for yk in draft.y_keys:
        if yk in available_keys:
            matched_y_keys.append(yk)
        else:
            match = next((k for k in available_keys if k.lower() == yk.lower()), None)
            if match:
                matched_y_keys.append(match)

    if not matched_y_keys:
        for k, v in rows[0].items():
            if isinstance(v, (int, float)) and k != x_key:
                matched_y_keys.append(k)
        if not matched_y_keys:
            matched_y_keys = [k for k in available_keys if k != x_key][:1] or [x_key]

    if not columns:
        columns = [{"key": k, "label": k.replace("_", " ").title()} for k in rows[0].keys()]

    sql = evidence_item.get("sql", "")
    filename_base = sanitize_filename(draft.title)
    download_name = f"{filename_base}_data_source.csv"
    csv_data = rows_to_csv(rows, columns, draft.title, sql)

    data_source = {
        "name": draft.title,
        "sql": sql,
        "row_count": len(rows),
        "download_name": download_name,
        "columns": columns,
        "rows": rows,
        "csv_data": csv_data,
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }

    return {
        "title": draft.title.strip(),
        "chart_type": draft.chart_type,
        "description": draft.description.strip(),
        "x_key": x_key,
        "y_keys": matched_y_keys,
        "x_label": draft.x_label or x_key.replace("_", " ").title(),
        "y_label": draft.y_label or ", ".join(k.replace("_", " ").title() for k in matched_y_keys),
        "evidence_id": draft.evidence_id,
        "sql": sql,
        "rows": rows,
        "columns": columns,
        "data_source": data_source,
    }

