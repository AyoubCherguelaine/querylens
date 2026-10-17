# Chat OLAP

A PostgreSQL analytics workspace with a FastAPI backend and Next.js frontend. Upload a CSV or multi-table SQLite database, organize its tables under a file-named schema, reopen saved sources from the dashboard, and analyze actual query results with inspectable evidence.

Chat uses a **conversational tool agent**. It receives the new question, the most recent 30 saved turns, prior SQL attempts and up to five result rows per query (history is capped at 100,000 characters). It can inspect the selected source, sample tables, run multiple SQL queries with joins and subqueries, recover from SQL errors, ask the user for clarification, and answer from observed results. The UI streams model/tool status, inputs, outputs and errors; completed traces are saved with the conversation and can be downloaded as evidence. Sampling offers explicit discovered table references and also resolves bare, schema-qualified, quoted, or unambiguous display names.

Python parses agent SQL with PostgreSQL's parser and permits one SELECT over fully qualified tables discovered in the selected source. Queries use read-only transactions, a restricted search path, a built-in analytics function/cast/operator allowlist, statement timeouts and bounded cursor fetching. Writes, application/system tables, other sources, row locking and arbitrary functions are rejected. Use derived subqueries instead of CTE references. Model answers still require review against the displayed evidence. The direct structured-plan analysis and profiling actions remain available without a model.

For narrative output, ask “Write a readable analysis of this dataset” or “Turn those results into a summary for my manager,” or select **Write an analysis**. The agent can also choose narrative output when it helps explain findings. Its `write_analysis` tool returns a titled report with a summary, short sections and supporting query references. Reports appear directly in the conversation and can be downloaded as plain text. They persist with their evidence and can be rewritten in later turns without rerunning SQL. Unknown or failed query references are rejected; language-model interpretation and numerical claims still need review against the evidence. Samples and limited results retain their flags, and the writing instructions require material limitations and distinguish observations from interpretation.

Source schemas, row samples and query results are sent to the configured model (`store=False`). Live tool results sent to the model include up to 20 rows; history includes up to five per query. The UI retains up to `MAX_RESULT_ROWS` per query, at most 128 columns, with cells clipped at 4,000 characters and truncation flagged.

## Local setup

Requires Python 3.12+, Node.js 22+, and Docker for the dedicated PostgreSQL server. Ports 8001 and 3001 avoid other local services.

```bash
uv venv --python 3.12
uv pip install -r requirements.lock
cp .env.example .env       # only for a fresh checkout; preserve an existing .env
```

Edit `.env`:

- `DB_PASSWORD`: a URL-safe random password for the project PostgreSQL container.
- `POSTGRES_PORT`: host port, default `5435`; Docker services use `postgres:5432`.

- `DATABASE_URL`: PostgreSQL URL for application storage. All metadata lives in the `chat_olap` schema.
- `ANALYTICS_DATABASE_URL`: PostgreSQL source URL. Blank uses `DATABASE_URL`. A separate read-only source role is recommended.
- `ANALYTICS_SCHEMAS`: JSON allowlist for existing PostgreSQL schemas, for example `["analytics"]`. Imported sources are authorized by ownership and do not need to be added here. Application and PostgreSQL system schemas are rejected.
- `JWT_SECRET`: a random secret of at least 32 characters (`openssl rand -hex 32`).
- `OPENAI_API_KEY`: needed for the conversational agent and natural-language planning.
- `OPENAI_MODEL`: explicit model supporting function calling and Structured Outputs; defaults to `gpt-4o-mini`. There is no silent model fallback. Account access is checked by the provider at request time.
- `QUERY_TIMEOUT_MS`, `MAX_RESULT_ROWS`, `LLM_TIMEOUT_SECONDS`: query/result and per-model-request limits.
- `AGENT_MAX_STEPS`, `AGENT_TIMEOUT_SECONDS`: tool/model round limit (default 12) and total agent time limit (default 180 seconds). The agent returns partial evidence on limit/provider failures.
- `ALLOW_SIGNUP`: disable public registration after provisioning accounts if needed.
- `LOG_LEVEL`, `TOKEN_MINUTES`: logging and session lifetime.
- `UPLOAD_MAX_BYTES`, `IMPORT_MAX_ROWS`, `IMPORT_MAX_TABLES`, `IMPORT_MAX_COLUMNS`, `IMPORT_TIMEOUT_MS`, `MAX_IMPORTED_SOURCES`: import limits (defaults: 25 MiB, 100,000 total rows, 50 tables, 128 columns per table, 60-second SQL timeout, 2 saved imports per account). Match `UPLOAD_MAX_BYTES` in the frontend environment; Compose passes it automatically.
- `MAX_CHAT_SESSIONS`, `MAX_QUESTIONS_PER_SESSION`: chat quotas (defaults: 10 chats per account, 3 questions per chat).

URLs must use `postgresql://` or `postgres://`. Percent-encode special characters in credentials. `.env` is ignored by Git; never put server keys in `NEXT_PUBLIC_*` variables.

```bash
docker compose up -d --wait postgres
.venv/bin/python -m scripts.migrate
.venv/bin/uvicorn main:app --reload --host 127.0.0.1 --port 8001 --no-access-log
```

In another terminal:

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

Open **http://localhost:3001** to see the public landing page and try the interactive demo without signing in. The demo calculates answers from a small local sample dataset using preset questions; it does not contact the backend or an AI provider. Choose **Get started** to create an account or **Sign in** to log in at `/login`. The authenticated app is at `/workspace`; use **Upload** or **Sources → Use this schema** to add data. Select a source and table, inspect **Schema & measures**, and run **Count all rows** or **Profile data quality** without a model. Ask a natural-language question once the provider is configured. Expand **Inspect query & evidence** to review SQL, parameters, the interpreted plan, execution time, and caveats. Evidence can be downloaded as JSON.

API documentation: http://localhost:8001/docs. Liveness: `/health/live`; database readiness: `/health/ready`.

## Importing and reopening data

The dashboard lists your saved sources, table counts, and imported row counts. **Explore source** reopens a saved schema. The **Active schema** selector in the right sidebar changes the source, and the table list only shows that source’s cubes. Chat history lives in the left sidebar, and the navbar opens chat, sources, and uploads. Refreshing `/workspace` reopens the analysis view; saved sources and chat histories remain in PostgreSQL.

1. Click **Import data** and choose or drag a `.csv`, `.db`, `.sqlite`, or `.sqlite3` file.
2. Inspect normalized field names, inferred types, row counts, up to five sample rows (long cells truncated in preview), and SQLite key relationships.
3. Accept or edit the schema name. A CSV creates one table (`data` by default, editable). SQLite retains each selected table under a normalized name.
4. Click **Import tables**. The backend creates the schema, imports records, validates supported constraints, and generates cubes in one transaction. Any failure rolls back the complete import.

For example:

```text
Quarterly Sales.csv       → quarterly_sales.data
Retail Store.sqlite      → retail_store.customers
                            retail_store.orders
```

Schema, table, and column names use lowercase ASCII letters, numbers, and underscores. Reserved names and names starting with numbers receive a `dataset_` prefix. A schema collision creates `quarterly_sales_2`, then `_3`, and so on; an upload never overwrites an existing source. Colliding table or column names inside a file are rejected so you can resolve them explicitly. Imported sources belong to the uploading account and cannot be reopened or analyzed by another account, even if an administrator accidentally adds the imported schema to the shared allowlist.

CSV requires a header row and UTF-8 encoding (BOM supported). Comma, semicolon, tab, and pipe delimiters are detected. Types are inferred from all rows; exact decimals and large integers use PostgreSQL `numeric`, leading-zero identifiers remain text, and empty cells become NULL. ISO dates and timestamps are recognized; timestamps without a zone use UTC. Business keys are not guessed. Invalid or inconsistent formats fail explicitly; values are never silently dropped.

SQLite is read in a bounded, read-only temporary environment and migrated into PostgreSQL. The file’s SQL is never executed in PostgreSQL. Ordinary tables, stored values, primary keys, ordinary unique keys, composite keys, and supported foreign keys are imported. Select referenced tables together. Cyclic foreign keys are supported when the data satisfies them. BLOB values are stored as `bytea`, but are omitted from analytical cube fields. Mixed-type columns are converted conservatively; incompatible PostgreSQL keys or values cause rollback. Source TEXT columns retain text semantics. Empty SQLite columns use their supported declared type when available.

Views, virtual tables, generated columns, triggers, defaults, CHECK constraints, collations, non-unique indexes, and partial/expression indexes are not recreated. Virtual/generated tables are rejected with an explanation. `SET DEFAULT` foreign-key actions are rejected because default expressions are not migrated. Close or checkpoint the SQLite database before uploading; a separate WAL file is not imported. Uploads are inspected twice (preview and confirmation), then temporary files are removed. The imported data and source metadata remain in PostgreSQL.

Existing PostgreSQL schemas are available through **Use this schema** when they are in `ANALYTICS_SCHEMAS` and contain accessible ordinary tables. The source is registered once and can be reopened later. Imported sources live in the application’s PostgreSQL database; existing sources use the configured analytics connection. A new migration backfills source records for legacy saved cubes, preserving their IDs and chat sessions.

Agent analysis is scoped to the chosen source and can query its discovered tables, including joins. The chosen cube provides the initial business grain. Direct structured-plan analysis can use its declared to-one dimension paths. Importing SQLite foreign keys preserves relationships in PostgreSQL. Numeric measures still require business review. Source dashboards contain real counts and metadata; no model generates their values.

## Temporary demo

The following uses an isolated database on the configured server, seeds 240 synthetic sales records, and starts both services. It requires the server role to have `CREATEDB`. It never loads sample rows into an existing database. Ctrl+C stops the services and deletes the temporary database. Build the frontend first.

```bash
npm run build --prefix frontend
.venv/bin/python -m scripts.demo
```

Create any demo account in the UI and click **Use this schema** for `demo`, or import a file. Direct analysis works without an OpenAI key. You can run beside existing services with `DEMO_API_PORT=8002 DEMO_WEB_PORT=3002 .venv/bin/python -m scripts.demo`. A forced process kill can leave the temporary `chat_olap_demo_*` database behind; remove that database when no demo is running.

## Docker

Compose provides a dedicated PostgreSQL 16 server for this project, with its own project network and persistent `postgres_data` volume. Database and user: `chat_olap`. Host connection: `localhost:5435` (or `POSTGRES_PORT`); API connection inside Docker: `postgres:5432`.

Set `DB_PASSWORD` to a URL-safe random value in `.env`. `DATABASE_URL` expands `DB_PASSWORD` and `POSTGRES_PORT` for host commands; Compose builds the internal API URL from the same password. Set `DOCKER_ANALYTICS_DATABASE_URL` only when analyzing a separate PostgreSQL source.

```bash
docker compose build
docker compose up -d
```

The one-shot `migrate` service applies pending migrations before `api` starts.

`docker compose down` preserves the database volume. `docker compose down -v` deletes this project's database data.

For HTTPS hosting, set `COOKIE_SECURE=true` and `APP_ORIGIN` to the exact public origin. Set `BACKEND_URL` in `frontend/.env.local` when the host backend URL differs. The web server proxies only known API paths, rejects cross-origin writes, and keeps the JWT in an HTTP-only SameSite cookie. Configure ingress request limits, authentication rate limits, and HTTPS before exposing this service publicly. The supplied compose binds both services to localhost.

## Architecture

```text
main.py                      Stable ASGI entrypoint
backend/
  app.py                     Factory, lifecycle, health, request logging
  api/                       Accounts, sources/imports, ownership, cubes, analysis, chat
  core/                      Validated configuration and JSON logging
  database/                  Async PostgreSQL pools and read-only transactions
  schemas.py                 Strict request and plan contracts
  services/
    catalog.py               PostgreSQL catalog discovery and cube definitions
    compiler.py              Closed analytical language → parameterized SQL
    planner.py, prompts.py   Structured model planning and refusal handling
    analysis.py              Query execution, profiling, result evidence
    chat_agent.py            Conversational tool loop, history and step events
    agent_sql.py             PostgreSQL AST validation and bounded SQL execution
    narrative.py             Written report validation and supporting query references
    import_parser.py         Bounded CSV/SQLite parsing and type/key inspection
    sources.py               Source registry and atomic schema/table imports
migrations/                  Versioned PostgreSQL DDL
scripts/                     Migration, isolated tests, temporary demo
tests/                       Compiler and real PostgreSQL integration tests
frontend/                    Next.js App Router, cookie proxy, responsive UI
agents/                      Legacy class import paths, backed by the new services
```

PostgreSQL stores users, owned source records and import manifests, cube definitions as JSONB, sessions, and immutable message results. UUID identities and foreign keys replace MongoDB ObjectIds. Passwords use Argon2; JWTs require an expiry, subject, and audience. Source/cube/session operations enforce ownership. Imported schemas are private to their owner. Existing configured analytics schemas are shared with registered analysts: saved-object ownership is **not** row-level source isolation for those shared schemas. Use separate deployments/source credentials for different data access boundaries.

Structured logs go to stdout as JSON with request IDs, status, latency, model/token usage, and result counts. Agent step logs include the tool name, step ID, completion/failure status and duration; inspect failed tool details in the private conversation evidence. Responses carry `X-Request-ID`. Logs intentionally exclude passwords, tokens, DSNs, prompts, filter values, result rows, and provider error bodies. SQL parameters and query results are stored as private session evidence in PostgreSQL, so apply your normal database retention and access policy.

## Cubes and supported analysis

Discovery reads real table columns, PostgreSQL types, primary/foreign/unique keys, and planner row estimates. It includes ordinary and partitioned parent tables, skips partition children and views, and ignores unsupported types such as JSONB, arrays, and custom domains. A cube is a semantic definition, not a precomputed materialized cube.

- Schema analysis: reads primary, unique and foreign keys (including composite keys), table/column comments, and non-value column statistics. Classifies cubes as facts, entities, bridges or snapshots with an explanation and suggested questions. Unsupported types remain excluded.
- Grain: one base record, identified by its declared primary key. Validated foreign keys expose related dimensions through up to three to-one hops, including role-playing paths such as billing and shipping customers. LEFT JOINs preserve missing relationships. Child collections are never expanded into a parent cube. Expansion is bounded to 32 joins and approximately 512 fields per cube.
- Measures: record count; sum candidates for recognizable additive amounts/quantities; average/min/max for numeric attributes. Identifiers, codes and years are excluded from numeric measures. Prices, rates, ratios and balances are not automatically summed. When a row contains one quantity field and `unit_price`, an explicit candidate `__extended_amount` measure sums their product before adjustments; its definition includes the unit-price assumption. Parent amounts never become measures at the child grain.
- Grouping: up to five base or related dimension fields, using the exact dotted semantic names; day/week/month/quarter/year for dates and timestamps. Time grouping runs in UTC.
- Filters: typed equality, comparisons, literal substring matching, NULL checks; all combined with AND. Values are bound parameters.
- Sorting: validated output aliases with stable secondary group ordering.
- Limits: fetch one additional group to detect truncation; no misleading full-result totals from a limited result.
- Decimal values and integers beyond JavaScript’s safe range: returned as strings to preserve precision. NULL stays NULL; counts retain PostgreSQL semantics.
- Profiling: exact row count, NULL count, distinct count for up to 64 supported fields, bounded by statement timeout. This direct action does not call a model.

Direct structured-plan queries run inside read-only transactions with statement timeouts. Only server-discovered tables/columns and fixed aggregate/date functions reach compiled SQL. Unknown fields, unsupported metrics, invalid sorting, stale schemas, provider refusal, incomplete plans, and unavailable providers fail explicitly. Natural-language chat uses saved conversation and SQL evidence as context for follow-up questions.

Numeric columns are candidates, not certified business measures: an exchange rate, balance, or percentage should not automatically be summed. Review units and additivity. The structured-plan API supports discovered to-one dimension joins and the explicit extended-amount recipe. It excludes arbitrary joins/formulas, currency conversion, fiscal calendars, forecasting, OR filters, and arbitrary SQL. Related-table schema and constraint changes invalidate saved models; use **Discover cubes** on existing sources to rebuild them after upgrading. The conversational agent can express joins, formulas and OR filters through validated SELECT SQL within its source; business definitions still need user confirmation. PostgreSQL planner row estimates can be stale; profiling computes exact counts.

## API examples

Sign up and log in at `/users/signup` and `/users/login`. Send the returned token as `Authorization: Bearer TOKEN` for direct API access. The frontend handles its cookie session automatically.

| Endpoint | Purpose |
| --- | --- |
| `GET /users/me` | Current account |
| `GET /sources` | Saved sources, available schemas, upload limits |
| `POST /sources/preview` | Multipart file inspection; saves nothing |
| `POST /sources/import` | Multipart file plus `schema_name`, JSON `tables`, CSV `table_name` |
| `POST /sources/connect` | Register existing `{ "schema_name": "analytics" }` |
| `GET /sources/{id}` | Owned source metadata and its cubes |
| `POST /sources/{id}/discover` | Refresh cubes only for the owned source |
| `POST /cubes/discover` | Idempotently discover/update owned cubes |
| `GET /cubes` | List saved cubes |
| `POST /cubes/{id}/profile` | Exact NULL/distinct profiling |
| `POST /cubes/{id}/analyze` | Execute a structured plan without a model |
| `POST /chat/session` | Create session with `{ "cube_id": "UUID" }` |
| `GET /chat/sessions` | Latest 100 owned sessions |
| `GET /chat/session/{id}` | First 200 messages with stored evidence |
| `POST /chat/session/{id}/messages` | Ask `{ "question": "Count rows by region", "stream": true }` for NDJSON progress, or omit `stream` for a final JSON result |

Example body for `/cubes/{id}/analyze`:

```json
{
  "plan": {
    "clarification": null,
    "groups": [{"field": "region", "grain": null}],
    "metrics": [{"field": "amount", "aggregation": "sum"}],
    "filters": [],
    "order_by": "m0",
    "descending": true,
    "limit": 20
  }
}
```

Group aliases are `g0`, `g1`, … and metric aliases are `m0`, `m1`, …. If the agent needs more information, the chat endpoint returns `status: "clarification"`; the next user message continues the conversation. Agent results use `answered`, `clarification`, `error` or `limit_reached` and include `steps`. Failures include a safe `error` code and diagnostics distinguishing invalid provider requests, authentication/access issues, rate limits/quota, connection failures and timeouts. Logs retain provider status/code/parameter/request ID, without raw provider bodies or credentials. Streaming events are `step`, `heartbeat`, `result` or `error`. Missing provider configuration returns 503 before streaming; provider/time-limit failures during an agent run return an error result with partial evidence. Direct-plan validation returns 422 and timed-out direct analysis returns 504.

## Verification

```bash
uv pip install -r requirements-dev.txt
.venv/bin/pytest -q                         # unit tests; PostgreSQL tests skip without TEST_DATABASE_URL
.venv/bin/ruff check backend agents scripts tests main.py app.py
npm run build --prefix frontend
```

For integration tests, use an **isolated disposable database**: fixtures create a `business` schema, reset its test table, and truncate application metadata. Never point tests at an application or shared data database.

```bash
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5435/isolated_test_db .venv/bin/pytest -q
```

`python -m scripts.verify_postgres` creates an isolated database on this project’s running PostgreSQL container, runs the suite, then drops only that temporary database. It reads credentials privately from Docker. `TEST_PG_CONTAINER` optionally selects a different test container. Start the project database first with `docker compose up -d --wait postgres`.

Automated tests additionally cover CSV and SQLite preview/import, normalized names, exact numeric and date types, source reopening, multi-table and selective imports, foreign-key validation, composite/cyclic relationships, collision handling, full rollback, streamed upload limits, and imported-source ownership. Core tests cover parameter binding, field/aggregate rejection, limits, date grouping, exact decimal results, literal substring filters, schema drift, NULL handling, authentication, ownership, persistence, clarification, and unavailable-model behavior. Live provider access/accuracy and production deployment require separate verification with your chosen source and model.

## Upgrade notes

This is an intentional storage/API upgrade. MongoDB, Gradio, CrewAI, and LangChain are removed from the runtime. SQLite is now an import format; analytical queries and persistent storage run exclusively on PostgreSQL. Legacy Mongo-backed modules under `users/`, `chats/`, `cubes/`, and `db/` were replaced by `backend/`. `main:app` remains the ASGI entrypoint. The two `agents` class import paths remain; `CubeQueryGeneration.run` is now async and returns a structured SQL/parameter/plan bundle, and both classes require the new PostgreSQL cube metadata format.

Existing MongoDB data is **not automatically migrated**. Export it before decommissioning the old service, explicitly map ObjectIds to UUIDs and ownership references, and validate the import. Legacy JWTs and sessions are not accepted. Rediscover cubes from the PostgreSQL source; an old SQLite database can be uploaded through the new import dashboard. Existing source records are never rewritten by discovery or analysis.

Implementation references: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [PostgreSQL read-only transactions](https://www.postgresql.org/docs/16/sql-set-transaction.html), and [Next.js cookie handling](https://nextjs.org/docs/app/api-reference/functions/cookies).
