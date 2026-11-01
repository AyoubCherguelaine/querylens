"""Load evaluation test cases from JSON or YAML files."""

import json
from pathlib import Path
from typing import List, Union

from backend.evaluation.models import TestCase


def load_test_cases_from_dict_list(data: List[dict]) -> List[TestCase]:
    """Parse a list of dictionaries into TestCase objects."""
    return [TestCase.model_validate(item) for item in data]


def load_test_cases_from_file(path: Union[str, Path]) -> List[TestCase]:
    """Load test cases from a single JSON or YAML file."""
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"Test case file not found: {file_path}")

    content = file_path.read_text(encoding="utf-8")
    if file_path.suffix.lower() == ".json":
        data = json.loads(content)
    elif file_path.suffix.lower() in (".yaml", ".yml"):
        import yaml

        data = yaml.safe_load(content)
    else:
        # Default try JSON
        data = json.loads(content)

    if isinstance(data, list):
        return load_test_cases_from_dict_list(data)
    elif isinstance(data, dict):
        if "cases" in data:
            return load_test_cases_from_dict_list(data["cases"])
        return [TestCase.model_validate(data)]
    raise ValueError(f"Invalid format in test case file: {file_path}")


def load_test_cases_from_directory(dir_path: Union[str, Path]) -> List[TestCase]:
    """Scan a directory for JSON and YAML test case files."""
    folder = Path(dir_path)
    if not folder.is_dir():
        return []

    cases = []
    for ext in ("*.json", "*.yaml", "*.yml"):
        for f in sorted(folder.glob(ext)):
            try:
                cases.extend(load_test_cases_from_file(f))
            except Exception:
                # Log or ignore invalid files
                pass
    return cases
