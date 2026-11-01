# QueryLens Agent Evaluation Framework

The **QueryLens Agent Evaluation Framework** is an automated, rigorous testing and benchmarking system that measures the performance, accuracy, and reliability of the conversational AI agent across diverse data analytics tasks.

It reuses the exact same backend agent, tool execution pipeline, AST SQL validation, and evidence system as the production QueryLens application—ensuring that evaluations faithfully reflect real-world user interactions while operating against completely isolated test datasets.

---

## Key Features & Evaluation Dimensions

The framework automatically scores agent turns against 6 core criteria:

1. **SQL Generation and Execution Success (`sql_execution`)**
   - Validates that the agent constructs syntactically valid PostgreSQL queries conforming to QueryLens's conservative AST validator (`pglast`).
   - Ensures queries use fully qualified table references (e.g. `eval_ecommerce.orders`), authorized analytics functions, and read-only semantics.
   - Evaluates whether queries execute cleanly against the database without runtime errors.

2. **Accuracy of Query Results (`result_accuracy`)**
   - Dynamically compares the agent's executed query rows against ground-truth expectations.
   - Supports both explicit reference rows and ground-truth reference SQL queries executed on the fly.
   - Features order-insensitive multiset matching, configurable numeric tolerances (e.g., float rounding differences), and column alias normalization.

3. **Correct Tool Selection and Usage (`tool_selection`)**
   - Checks that required tools were invoked (e.g., `query_postgres`, `ask_user`, `write_analysis`, `create_graph`).
   - Ensures forbidden tools were avoided.
   - Validates tool parameter schemas:
     - For `write_analysis`: verifies non-empty title, summary, structured sections, and valid evidence query IDs.
     - For `create_graph`: verifies valid chart types (`bar`, `line`, `area`, `pie`, `scatter`), axes keys (`x_key`, `y_keys`), and evidence linkage.

4. **Clarification Handling (`clarification`)**
   - Evaluates whether the agent recognizes ambiguous, incomplete, or underspecified user questions (e.g. *"Show me the best ones"*).
   - Verifies that the agent calls `ask_user` with a clear, relevant clarifying question rather than guessing or executing arbitrary queries.
   - Ensures the agent does NOT ask for clarification when questions are clear and specific.

5. **Error Recovery and Self-Correction (`error_recovery`)**
   - Tests the agent's resilience when queries fail (e.g., non-existent columns, type mismatches).
   - Assesses whether the agent detects the error message returned by the tool, repairs the SQL query in a subsequent step, and successfully completes the turn.

6. **Accuracy, Grounding, and Relevance of Final Answers (`answer_accuracy`)**
   - Validates that the final natural-language answer accurately addresses the user prompt.
   - Verifies that numerical claims in the prose are grounded in the observed query results.
   - Checks for the presence of expected analytical keywords, entities, and absence of failure phrases.

---

## Isolated Test Datasets

Evaluations run in isolated sandboxes and **never modify production or user databases**.

Three preconfigured domain datasets are included:

| Dataset | Schema | Key Tables | Description |
|:---|:---|:---|:---|
| **E-Commerce** | `eval_ecommerce` | `categories`, `products`, `customers`, `orders`, `order_items` | Retail sales data covering product categories, order fulfillment statuses, multi-table joins, and customer segments. |
| **SaaS Subscriptions** | `eval_saas` | `accounts`, `subscriptions`, `usage_events` | B2B SaaS metrics covering Monthly Recurring Revenue (MRR), subscription tiers, churn statuses, and platform usage events. |
| **Corporate Finance** | `eval_finance` | `departments`, `budgets`, `expenses` | Departmental budget allocations, categorized operational expenses, headcount, and budget variance analytics. |

### Database Engines

- **In-Memory SQLite Engine (Zero Setup / CI Mode):**
  Uses an in-memory SQLite database with attached schemas and custom PostgreSQL analytics functions. Requires no running PostgreSQL container or external network. Ideal for CI pipelines and instant local testing.
- **PostgreSQL Server Engine:**
  When connected to PostgreSQL, creates isolated schemas (e.g. `eval_<dataset>_<run_id>`), populates deterministic seed data, executes all queries in read-only transactions, and automatically drops all schemas upon teardown.

---

## Benchmark Test Suite

The built-in benchmark collection covers 15 representative analytical scenarios:

| Case ID | Scenario / Category | Question | Expected Tools |
|:---|:---|:---|:---|
| `ecom_01_total_revenue` | `basic_aggregation` | "What is the total revenue from all completed orders?" | `query_postgres`, `finish` |
| `ecom_02_status_breakdown` | `basic_aggregation` | "How many orders are in each status?" | `query_postgres`, `finish` |
| `ecom_03_top_customers` | `multi_table_join` | "Who are the top 3 customers by total spending on completed orders?" | `query_postgres`, `finish` |
| `ecom_04_category_revenue` | `multi_table_join` | "What is the total sales revenue generated by each product category?" | `query_postgres`, `finish` |
| `ecom_05_monthly_trend` | `complex_analytics` | "Show the monthly sales totals for completed orders across 2026." | `query_postgres`, `finish` |
| `ecom_06_ambiguous_best` | `ambiguous_question` | "Show me the best ones." | `ask_user` |
| `ecom_07_ambiguous_recent` | `ambiguous_question` | "How did we do recently?" | `ask_user` |
| `ecom_08_error_recovery` | `error_recovery` | "What is the total sales amount of completed orders?" | `query_postgres`, `finish` |
| `ecom_09_executive_report` | `narrative_report` | "Write a readable analysis of product sales performance across customer segments." | `query_postgres`, `write_analysis` |
| `ecom_10_bar_chart` | `visualization` | "Show a bar chart of completed orders revenue by customer segment." | `query_postgres`, `create_graph` |
| `saas_01_active_mrr` | `basic_aggregation` | "What is the total monthly recurring revenue (MRR) for all active accounts?" | `query_postgres`, `finish` |
| `saas_02_tier_distribution`| `basic_aggregation` | "How many accounts are in each subscription tier, and what is the average MRR?" | `query_postgres`, `finish` |
| `saas_03_usage_by_tier` | `multi_table_join` | "What is the total API request volume for active accounts by tier?" | `query_postgres`, `finish` |
| `saas_04_ambiguous_stats` | `ambiguous_question` | "Give me the stats." | `ask_user` |
| `fin_01_budget_vs_expense` | `multi_table_join` | "What is the total expense amount compared to the allocated budget for each department?" | `query_postgres`, `finish` |

---

## Quickstart & CLI Usage

Run evaluations directly from the command line using `scripts/evaluate.py`:

### 1. Run full suite in fast offline/mock mode (recommended for CI & verification)

```bash
python scripts/evaluate.py --mock
```

### 2. Run against a live OpenAI model (e.g. GPT-4o-mini, GPT-4o)

Ensure `OPENAI_API_KEY` is configured in `.env`, then run:

```bash
python scripts/evaluate.py --model gpt-4o-mini
```

### 3. Filter by category, tag, or specific case

```bash
# Evaluate only ambiguous questions
python scripts/evaluate.py --mock --category ambiguous_question

# Evaluate only multi-table joins
python scripts/evaluate.py --mock --category multi_table_join

# Evaluate SaaS scenarios by tag
python scripts/evaluate.py --mock --tag saas

# Run a single specific test case with verbose step logs
python scripts/evaluate.py --mock --case ecom_01_total_revenue --verbose
```

### 4. CI/CD Quality Gate with `--fail-under`

Set a minimum pass rate threshold. If the agent achieves less than the required percentage, the command exits with exit code `1`:

```bash
python scripts/evaluate.py --mock --fail-under 85.0
```

### 5. Inspect registered test cases and datasets

```bash
python scripts/evaluate.py --list-cases
python scripts/evaluate.py --list-datasets
```

---

## Extending the Framework with New Test Cases

The evaluation framework is designed to be easily extensible. Developers can add test cases either programmatically or via JSON/YAML files.

### Option A: Defining Test Cases in JSON or YAML

Create a JSON file (e.g. `custom_eval.json`):

```json
[
  {
    "id": "ecom_custom_discount",
    "name": "Customer Segment Discounts",
    "category": "multi_table_join",
    "question": "What is the average discount given per customer segment?",
    "dataset_name": "ecommerce",
    "cube_table": "orders",
    "expected_tools": ["query_postgres", "finish"],
    "expected_result": {
      "sql": "SELECT c.segment, round(avg(o.discount_amount), 2) AS avg_discount FROM eval_ecommerce.orders o JOIN eval_ecommerce.customers c ON o.customer_id = c.id GROUP BY c.segment"
    },
    "expected_answer_contains": ["Enterprise", "SMB"],
    "tags": ["discounts", "custom"]
  }
]
```

Run it immediately with the `--file` flag:

```bash
python scripts/evaluate.py --mock --file custom_eval.json
```

### Option B: Defining Test Cases in Python

Add the `TestCase` definition to `backend/evaluation/test_cases/suite.py` or register it directly with `TestCaseRegistry`:

```python
from backend.evaluation.models import TestCase, EvaluationCategory, ExpectedResult
from backend.evaluation.test_cases import get_default_registry

registry = get_default_registry()
registry.register(
    TestCase(
        id="my_custom_test",
        name="Custom Analysis",
        category=EvaluationCategory.BASIC_AGGREGATION,
        question="How many active subscriptions are there?",
        dataset_name="saas",
        cube_table="subscriptions",
        expected_tools=["query_postgres", "finish"],
        expected_result=ExpectedResult(
            sql="SELECT count(*) FROM eval_saas.subscriptions WHERE end_date IS NULL"
        ),
    )
)
```

---

## Evaluation Reports & Artifacts

After every evaluation run, the framework generates reports in three formats:

1. **Terminal Console Output:**
   - Colorized table summarizing overall statistics (pass rate, duration, average score).
   - Breakdown by evaluation dimension (`sql_execution`, `result_accuracy`, `tool_selection`, `clarification`, `error_recovery`, `answer_accuracy`).
   - Breakdown by scenario category.
   - Line-by-line test status with generated SQL and failure diagnostics.
2. **JSON Report (`eval_reports/<run_id>.json`):**
   - Complete machine-readable trace of all turns, steps, tool arguments, outputs, metric scores, and failure reasons.
3. **Markdown Report (`eval_reports/<run_id>.md`):**
   - Clean GitHub-flavored Markdown document with summary tables, metric matrix, and collapsible debugging logs for failed test cases.

---

## Future Dashboard REST API Endpoints

The framework exposes REST API endpoints in `backend/api/evaluation.py` for integration with future web dashboards:

- `GET /api/evaluation/suites`: Lists all registered test cases, categories, and tags.
- `GET /api/evaluation/datasets`: Lists all available evaluation datasets.
- `POST /api/evaluation/run`: Triggers an evaluation run with optional category, tag, dataset, or mock filters, returning the full report.
- `GET /api/evaluation/reports`: Lists historical evaluation reports saved on disk.
- `GET /api/evaluation/reports/{run_id}`: Retrieves the detailed results and diagnostics of a specific evaluation run.
