"""Command-line interface for the QueryLens Agent Evaluation Framework."""

import argparse
import asyncio
import sys
from pathlib import Path

from backend.core.config import get_settings
from backend.evaluation.datasets import list_datasets
from backend.evaluation.reporter import ConsoleReporter, JsonReporter, MarkdownReporter
from backend.evaluation.runner import EvaluationRunner
from backend.evaluation.test_cases import get_default_registry, load_test_cases_from_file


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="evaluate",
        description="QueryLens Conversational AI Agent Evaluation Framework",
    )
    parser.add_argument(
        "--category",
        "-c",
        type=str,
        default=None,
        help="Filter test cases by category (e.g. basic_aggregation, multi_table_join, ambiguous_question, error_recovery, narrative_report, visualization)",
    )
    parser.add_argument(
        "--tag",
        "-t",
        type=str,
        default=None,
        help="Filter test cases by tag (e.g. smoke, joins, saas, ecommerce)",
    )
    parser.add_argument(
        "--case",
        type=str,
        default=None,
        help="Run a single test case by ID (e.g. ecom_01_total_revenue)",
    )
    parser.add_argument(
        "--dataset",
        "-d",
        type=str,
        default=None,
        help="Filter test cases by dataset (ecommerce, saas, finance)",
    )
    parser.add_argument(
        "--file",
        "-f",
        type=str,
        default=None,
        help="Load test cases from custom JSON or YAML file",
    )
    parser.add_argument(
        "--mock",
        "-m",
        action="store_true",
        default=False,
        help="Run in offline mock mode (simulates agent with canned tool calls; no OpenAI API key needed)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Override the OpenAI model name to evaluate (e.g. gpt-4o, gpt-4o-mini)",
    )
    parser.add_argument(
        "--output-dir",
        "-o",
        type=str,
        default="eval_reports",
        help="Directory where JSON and Markdown reports are saved (default: eval_reports)",
    )
    parser.add_argument(
        "--format",
        choices=["console", "json", "markdown", "all"],
        default="all",
        help="Output report formats to generate (default: all)",
    )
    parser.add_argument(
        "--fail-under",
        type=float,
        default=None,
        help="Fail (exit code 1) if pass rate is below this percentage (e.g. 80.0)",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        default=False,
        help="Print verbose step-by-step diagnostic output for all tests",
    )
    parser.add_argument(
        "--list-cases",
        action="store_true",
        help="List all registered test cases and exit",
    )
    parser.add_argument(
        "--list-datasets",
        action="store_true",
        help="List all registered datasets and exit",
    )
    return parser.parse_args(argv)


async def async_main(args) -> int:
    registry = get_default_registry()

    if args.list_datasets:
        print("Available datasets:")
        for d in list_datasets():
            print(f"  - {d}")
        return 0

    if args.file:
        loaded = load_test_cases_from_file(args.file)
        registry.register_many(loaded)

    if args.list_cases:
        cases = registry.list_all()
        print(f"Registered test cases ({len(cases)} total):")
        for c in cases:
            print(f"  [{c.id:<26}] {c.name:<32} (Category: {c.category.value})")
        return 0

    cases = registry.filter(
        category=args.category,
        tag=args.tag,
        dataset=args.dataset,
        case_id=args.case,
    )

    if not cases:
        print("No test cases matched the specified criteria.", file=sys.stderr)
        return 1

    print(f"Running evaluation on {len(cases)} test case(s)...", flush=True)

    settings = None
    try:
        settings = get_settings()
    except Exception:
        pass

    # If no API key is set and mock mode was not specified, advise the user or auto-fallback
    if not args.mock:
        key = settings.openai_api_key.get_secret_value() if settings else ""
        if not key:
            print(
                "Notice: OPENAI_API_KEY is not configured. Automatically running in --mock mode.\n"
                "To evaluate live models, configure OPENAI_API_KEY in .env.",
                flush=True,
            )
            args.mock = True

    runner = EvaluationRunner(
        settings=settings,
        mock_mode=args.mock,
        model_name=args.model,
    )

    def on_progress(result):
        badge = "[PASS]" if result.passed else "[FAIL]"
        print(f"  {badge:<6} {result.test_case_id:<26} ({result.score*100:.1f}%) in {result.duration_ms}ms", flush=True)

    report = await runner.run_suite(cases, progress_callback=on_progress)

    # Render console output
    if args.format in ("console", "all"):
        console_output = ConsoleReporter.render(report, verbose=args.verbose)
        print("\n" + console_output)

    # Save artifact files
    out_dir = Path(args.output_dir)
    if args.format in ("json", "all"):
        json_file = out_dir / f"{report.run_id}.json"
        saved_json = JsonReporter.save(report, json_file)
        print(f"JSON report saved: {saved_json}")

    if args.format in ("markdown", "all"):
        md_file = out_dir / f"{report.run_id}.md"
        saved_md = MarkdownReporter.save(report, md_file)
        print(f"Markdown report saved: {saved_md}")

    # Check CI pass rate threshold
    if args.fail_under is not None:
        if report.pass_rate < args.fail_under:
            print(
                f"\nEvaluation failed CI gate: pass rate {report.pass_rate}% is below required {args.fail_under}%.",
                file=sys.stderr,
            )
            return 1

    return 0 if report.failed_cases == 0 else (1 if args.fail_under is not None else 0)


def main():
    args = parse_args()
    exit_code = asyncio.run(async_main(args))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
