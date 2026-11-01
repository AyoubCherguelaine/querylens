"""Report generation in Console, Markdown, and JSON formats."""

from pathlib import Path

from backend.evaluation.models import EvaluationReport


class ConsoleReporter:
    """Renders formatted evaluation reports in the terminal."""

    # ANSI Colors
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    BOLD = "\033[1m"
    RESET = "\033[0m"

    @classmethod
    def render(cls, report: EvaluationReport, verbose: bool = False) -> str:
        lines = []

        # Banner
        lines.append(f"{cls.BOLD}{cls.CYAN}========================================================================{cls.RESET}")
        lines.append(f"{cls.BOLD}{cls.CYAN}              QueryLens Agent Evaluation Report                         {cls.RESET}")
        lines.append(f"{cls.BOLD}{cls.CYAN}========================================================================{cls.RESET}")
        lines.append(f"Run ID:      {report.run_id}")
        lines.append(f"Timestamp:   {report.timestamp}")
        lines.append(f"Model:       {report.model_name}")
        lines.append(f"Total Cases: {report.total_cases} | Passed: {cls.GREEN}{report.passed_cases}{cls.RESET} | Failed: {cls.RED if report.failed_cases else cls.GREEN}{report.failed_cases}{cls.RESET}")
        lines.append(f"Pass Rate:   {cls.BOLD}{cls.GREEN if report.pass_rate >= 80 else cls.RED}{report.pass_rate}%{cls.RESET} | Avg Score: {cls.BOLD}{report.average_score * 100:.1f}%{cls.RESET}")
        lines.append(f"Duration:    {report.total_duration_ms} ms")
        lines.append("")

        # Metric Dimensions Summary
        lines.append(f"{cls.BOLD}--- Performance by Evaluation Dimension ---{cls.RESET}")
        lines.append(f"{'Dimension':<25} {'Evaluated':<10} {'Passed':<8} {'Pass Rate':<12} {'Avg Score':<10}")
        lines.append("-" * 65)
        for metric, data in report.metric_summary.items():
            rate_color = cls.GREEN if data["pass_rate"] >= 80 else cls.RED
            lines.append(
                f"{metric:<25} {data['total_evaluated']:<10} {data['passed']:<8} {rate_color}{data['pass_rate']:<11.1f}%{cls.RESET} {data['avg_score']*100:<9.1f}%"
            )
        lines.append("")

        # Category Breakdown
        lines.append(f"{cls.BOLD}--- Performance by Analytical Category ---{cls.RESET}")
        lines.append(f"{'Category':<24} {'Total':<8} {'Passed':<8} {'Failed':<8} {'Pass Rate':<12} {'Avg Score':<10}")
        lines.append("-" * 72)
        for cat, data in report.category_summary.items():
            rate_color = cls.GREEN if data["pass_rate"] >= 80 else cls.RED
            lines.append(
                f"{cat:<24} {data['total']:<8} {data['passed']:<8} {data['failed']:<8} {rate_color}{data['pass_rate']:<11.1f}%{cls.RESET} {data['avg_score']*100:<9.1f}%"
            )
        lines.append("")

        # Test Case Details
        lines.append(f"{cls.BOLD}--- Individual Test Results ---{cls.RESET}")
        lines.append(f"{'Status':<8} {'Case ID':<26} {'Category':<20} {'Score':<8} {'Time (ms)':<10}")
        lines.append("-" * 75)
        for r in report.results:
            status_badge = f"{cls.GREEN}[PASS]{cls.RESET}" if r.passed else f"{cls.RED}[FAIL]{cls.RESET}"
            lines.append(
                f"{status_badge:<17} {r.test_case_id:<26} {r.category:<20} {r.score*100:<7.1f}% {r.duration_ms:<10}"
            )

            if verbose or not r.passed:
                if r.generated_sql:
                    clean_sql = " ".join(r.generated_sql.split())
                    lines.append(f"         {cls.BLUE}SQL:{cls.RESET} {clean_sql[:100]}{'...' if len(clean_sql) > 100 else ''}")
                if r.tools_used:
                    lines.append(f"         {cls.CYAN}Tools:{cls.RESET} {', '.join(r.tools_used)}")
                if r.failure_reasons:
                    for reason in r.failure_reasons:
                        lines.append(f"         {cls.RED}Failure:{cls.RESET} {reason}")
                lines.append("")

        # Failed cases detailed debug section if any
        if report.failed_results:
            lines.append(f"{cls.BOLD}{cls.RED}================ FAILED CASES DEBUGGING INFO ================{cls.RESET}")
            for f in report.failed_results:
                lines.append(f"\n{cls.BOLD}Case: {f.test_case_id} ({f.test_case_name}){cls.RESET}")
                lines.append(f"Category: {f.category} | Final Status: {f.agent_status}")
                lines.append(f"Agent Answer: {f.agent_answer}")
                if f.generated_sql:
                    lines.append(f"Generated SQL: {f.generated_sql}")
                lines.append("Metric Scores:")
                for m_name, m_score in f.metric_scores.items():
                    pass_str = f"{cls.GREEN}PASS{cls.RESET}" if m_score.passed else f"{cls.RED}FAIL{cls.RESET}"
                    lines.append(f"  - {m_name:<20}: {pass_str} (score: {m_score.score:.2f}) - {m_score.message or ''}")
                lines.append("Failure Reasons:")
                for r in f.failure_reasons:
                    lines.append(f"  * {cls.RED}{r}{cls.RESET}")

        lines.append(f"{cls.BOLD}{cls.CYAN}========================================================================{cls.RESET}")
        return "\n".join(lines)


class JsonReporter:
    """Generates structured JSON evaluation reports."""

    @classmethod
    def save(cls, report: EvaluationReport, file_path: Path | str) -> str:
        path = Path(file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        content = report.model_dump_json(indent=2)
        path.write_text(content, encoding="utf-8")
        return str(path.resolve())


class MarkdownReporter:
    """Generates clean GitHub-flavored Markdown evaluation reports."""

    @classmethod
    def render(cls, report: EvaluationReport) -> str:
        md = []
        md.append(f"# QueryLens Agent Evaluation Report: `{report.run_id}`")
        md.append("")
        md.append(f"- **Timestamp:** {report.timestamp}")
        md.append(f"- **Model Under Test:** `{report.model_name}`")
        md.append(f"- **Total Scenarios:** {report.total_cases}")
        md.append(f"- **Pass Rate:** **{report.pass_rate:.1f}%** ({report.passed_cases} passed, {report.failed_cases} failed)")
        md.append(f"- **Average Composite Score:** **{report.average_score * 100:.1f}%**")
        md.append(f"- **Total Duration:** {report.total_duration_ms} ms")
        md.append("")

        # Metric summary table
        md.append("## Evaluation Dimensions Summary")
        md.append("")
        md.append("| Dimension | Total Evaluated | Passed | Pass Rate | Avg Score |")
        md.append("|:---|:---:|:---:|:---:|:---:|")
        for metric, data in report.metric_summary.items():
            status = "✅" if data["pass_rate"] >= 80 else "⚠️"
            md.append(
                f"| `{metric}` | {data['total_evaluated']} | {data['passed']} | {status} {data['pass_rate']:.1f}% | {data['avg_score']*100:.1f}% |"
            )
        md.append("")

        # Category summary table
        md.append("## Performance by Scenario Category")
        md.append("")
        md.append("| Category | Total Cases | Passed | Failed | Pass Rate | Avg Score |")
        md.append("|:---|:---:|:---:|:---:|:---:|:---:|")
        for cat, data in report.category_summary.items():
            status = "✅" if data["pass_rate"] >= 80 else "⚠️"
            md.append(
                f"| `{cat}` | {data['total']} | {data['passed']} | {data['failed']} | {status} {data['pass_rate']:.1f}% | {data['avg_score']*100:.1f}% |"
            )
        md.append("")

        # Individual Test Results Table
        md.append("## Test Case Execution Details")
        md.append("")
        md.append("| Status | Case ID | Name | Category | Score | Latency |")
        md.append("|:---:|:---|:---|:---|:---:|:---:|")
        for r in report.results:
            icon = "✅ Pass" if r.passed else "❌ Fail"
            md.append(
                f"| {icon} | `{r.test_case_id}` | {r.test_case_name} | `{r.category}` | {r.score*100:.1f}% | {r.duration_ms}ms |"
            )
        md.append("")

        # Detailed Failed Cases
        if report.failed_results:
            md.append("## Failed Cases & Debugging Diagnostics")
            md.append("")
            for f in report.failed_results:
                md.append(f"### ❌ `{f.test_case_id}`: {f.test_case_name}")
                md.append(f"- **Category:** `{f.category}`")
                md.append(f"- **Composite Score:** `{f.score:.2f}`")
                md.append(f"- **Agent Status:** `{f.agent_status}`")
                md.append(f"- **Agent Answer:** {f.agent_answer}")
                md.append(f"- **Tools Called:** `{', '.join(f.tools_used)}`")
                if f.generated_sql:
                    md.append(f"```sql\n{f.generated_sql}\n```")
                md.append("**Failure Reasons:**")
                for r in f.failure_reasons:
                    md.append(f"- {r}")
                md.append("")

        return "\n".join(md)

    @classmethod
    def save(cls, report: EvaluationReport, file_path: Path | str) -> str:
        path = Path(file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        content = cls.render(report)
        path.write_text(content, encoding="utf-8")
        return str(path.resolve())
