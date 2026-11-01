"""API endpoints for agent evaluation suites and reports (enabling future evaluation dashboard)."""

import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.evaluation.datasets import list_datasets
from backend.evaluation.reporter import JsonReporter, MarkdownReporter
from backend.evaluation.runner import EvaluationRunner
from backend.evaluation.test_cases import get_default_registry

router = APIRouter(prefix="/evaluation", tags=["Agent Evaluation"])


class RunEvaluationRequest(BaseModel):
    category: Optional[str] = None
    tag: Optional[str] = None
    case_id: Optional[str] = None
    dataset: Optional[str] = None
    mock_mode: bool = False
    model_name: Optional[str] = None


@router.get("/suites")
async def get_suites():
    """List all registered test cases and metadata."""
    registry = get_default_registry()
    cases = registry.list_all()
    categories = sorted(list({c.category.value for c in cases}))
    tags = sorted(list({t for c in cases for t in c.tags}))
    return {
        "total_cases": len(cases),
        "categories": categories,
        "tags": tags,
        "cases": [
            {
                "id": c.id,
                "name": c.name,
                "category": c.category.value,
                "question": c.question,
                "dataset_name": c.dataset_name,
                "tags": c.tags,
            }
            for c in cases
        ],
    }


@router.get("/datasets")
async def get_datasets():
    """List available evaluation datasets."""
    return {"datasets": list_datasets()}


@router.post("/run")
async def run_evaluation(body: RunEvaluationRequest, request: Request):
    """Execute evaluation suite and return report."""
    registry = get_default_registry()
    cases = registry.filter(
        category=body.category,
        tag=body.tag,
        dataset=body.dataset,
        case_id=body.case_id,
    )

    if not cases:
        raise HTTPException(status_code=400, detail="No test cases matched the criteria.")

    settings = getattr(request.app.state, "settings", None)
    mock = body.mock_mode or not (settings and settings.openai_api_key.get_secret_value())

    runner = EvaluationRunner(
        settings=settings,
        mock_mode=mock,
        model_name=body.model_name,
    )

    report = await runner.run_suite(cases)

    # Persist report files
    out_dir = Path("eval_reports")
    JsonReporter.save(report, out_dir / f"{report.run_id}.json")
    MarkdownReporter.save(report, out_dir / f"{report.run_id}.md")

    return report


@router.get("/reports")
async def list_reports():
    """List past evaluation reports saved to disk."""
    out_dir = Path("eval_reports")
    if not out_dir.is_dir():
        return {"reports": []}

    reports = []
    for f in sorted(out_dir.glob("*.json"), reverse=True):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            reports.append({
                "run_id": data.get("run_id", f.stem),
                "timestamp": data.get("timestamp"),
                "model_name": data.get("model_name"),
                "pass_rate": data.get("pass_rate"),
                "average_score": data.get("average_score"),
                "total_cases": data.get("total_cases"),
                "passed_cases": data.get("passed_cases"),
                "failed_cases": data.get("failed_cases"),
                "duration_ms": data.get("total_duration_ms"),
            })
        except Exception:
            continue
    return {"reports": reports}


@router.get("/reports/{run_id}")
async def get_report(run_id: str):
    """Retrieve full details of a past evaluation report."""
    file_path = Path("eval_reports") / f"{run_id}.json"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    return json.loads(file_path.read_text(encoding="utf-8"))
