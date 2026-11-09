import asyncio
import io
import os
import sqlite3
from pathlib import Path

import asyncpg
import openpyxl
import pytest

from backend.core.config import Settings
from backend.services.import_parser import ImportInvalid, identifier, parse_file
from tests.test_integration import account, analyze
from tests.test_integration import client as client


def settings(**changes):
    return Settings(
        _env_file=None, database_url="postgresql://localhost/test", jwt_secret="s" * 40, **changes
    )


def sqlite_file(tmp_path, invalid=False):
    path = tmp_path / "Retail Store.sqlite"
    connection = sqlite3.connect(path)
    connection.executescript("""CREATE TABLE customers(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE);
        CREATE TABLE orders(id INTEGER PRIMARY KEY,customer_id INTEGER REFERENCES customers(id),amount NUMERIC);
        INSERT INTO customers VALUES(1,'North'),(2,'South');
        INSERT INTO orders VALUES(1,1,10.25),(2,2,20.5);
        CREATE TABLE empty_table(id INTEGER PRIMARY KEY,amount NUMERIC);""")
    if invalid:
        connection.execute("INSERT INTO orders VALUES(3,99,9)")
    connection.commit()
    connection.close()
    return path.read_bytes()


def preview(client, headers, content, name="Quarterly Sales.csv"):
    return client.post(
        "/sources/preview",
        headers=headers,
        files={"file": (name, content, "application/octet-stream")},
    )


def upload(client, headers, content, name="Quarterly Sales.csv", **options):
    return client.post(
        "/sources/import",
        headers=headers,
        files={"file": (name, content, "application/octet-stream")},
        data=options,
    )


def query(sql, *args):
    async def run():
        connection = await asyncpg.connect(os.environ["TEST_DATABASE_URL"])
        try:
            return await connection.fetch(sql, *args)
        finally:
            await connection.close()

    return asyncio.run(run())


def test_csv_parser_precision_text_dates_and_delimiters():
    parsed = parse_file(
        b"Code;Total;When;Enabled\n001;9007199254740993.125;2026-01-01;true\n002;;2026-02-01;false\n",
        "Quarterly Sales.csv",
        settings(),
    )
    table = parsed.tables[0]
    assert parsed.schema_name == "quarterly_sales"
    assert [c["type"] for c in table.columns] == ["text", "numeric", "date", "bool"]
    assert table.summary()["sample_rows"][0] == ["001", "9007199254740993.125", "2026-01-01", True]
    assert table.summary()["sample_rows"][1][1] is None


@pytest.mark.parametrize(
    "name,result",
    [
        ("My Sales 2026", "my_sales_2026"),
        ("../../Chat Olap", "dataset_chat_olap"),
        ("pg_catalog", "dataset_pg_catalog"),
        ("123", "dataset_123"),
        ("public", "dataset_public"),
        ("équipe ventes", "equipe_ventes"),
    ],
)
def test_names(name, result):
    # path separators normalize as underscores, never become filesystem or SQL paths.
    assert identifier(name) == result


@pytest.mark.parametrize(
    "content,name",
    [
        (b"", "a.csv"),
        (b"a b,a_b\n1,2", "a.csv"),
        (b"a,b\n1,2,3", "a.csv"),
        (b"\xff", "a.csv"),
        (b"not sqlite", "a.sqlite"),
        (b"SELECT 1", "a.sql"),
        (b"a,\n1,2", "a.csv"),
    ],
)
def test_invalid_files_rejected(content, name):
    with pytest.raises(ImportInvalid):
        parse_file(content, name, settings())


def test_csv_row_limit():
    with pytest.raises(ImportInvalid, match="row limit"):
        parse_file(b"a\n1\n2\n", "a.csv", settings(import_max_rows=1))


def test_sqlite_keys_empty_types_and_readonly(tmp_path):
    data = sqlite_file(tmp_path)
    parsed = parse_file(data, "Retail Store.sqlite", settings())
    assert len(parsed.tables) == 3
    orders = next(t for t in parsed.tables if t.name == "orders")
    assert orders.primary_key == ["id"] and orders.foreign_keys[0]["target_table"] == "customers"
    assert next(t for t in parsed.tables if t.name == "empty_table").columns[0]["type"] == "int8"
    assert (tmp_path / "Retail Store.sqlite").read_bytes() == data


def test_virtual_and_generated_sqlite_rejected(tmp_path):
    path = tmp_path / "generated.sqlite"
    db = sqlite3.connect(path)
    db.execute("CREATE TABLE t(a INTEGER,b INTEGER GENERATED ALWAYS AS (a*2))")
    db.close()
    with pytest.raises(ImportInvalid, match="generated"):
        parse_file(path.read_bytes(), path.name, settings())


def test_import_csv_reopen_isolation_and_analysis(client):
    headers = account(client)
    content = b"region,amount,sold_at\nNorth,10.10,2026-01-01\nSouth,20.20,2026-02-01\n"
    response = preview(client, headers, content)
    assert response.status_code == 200, response.text
    assert response.json()["suggested_schema"] == "quarterly_sales"
    assert client.get("/sources", headers=headers).json()["sources"] == []
    imported = upload(client, headers, content, table_name="Sale Records")
    assert imported.status_code == 201, imported.text
    source = imported.json()
    assert source["schema_name"] == "quarterly_sales"
    overview = client.get("/sources", headers=headers).json()
    assert len(overview["sources"]) == 1 and overview["sources"][0]["table_count"] == 1
    detail = client.get("/sources/" + source["id"], headers=headers).json()
    cube = detail["cubes"][0]
    assert cube["definition"]["table"] == "sale_records"
    assert analyze(
        client, headers, cube["id"], metrics=[{"field": "amount", "aggregation": "sum"}]
    ).json()["rows"] == [{"m0": "30.30"}]
    assert (
        client.post("/sources/" + source["id"] + "/discover", headers=headers).json()["discovered"]
        == 1
    )
    other = account(client, "other@example.com")
    assert client.get("/sources", headers=other).json()["sources"] == []
    assert client.get("/sources/" + source["id"], headers=other).status_code == 404
    assert client.post("/sources/" + source["id"] + "/discover", headers=other).status_code == 404
    assert analyze(client, other, cube["id"]).status_code == 404
    assert (
        client.post(
            "/sources/connect", headers=other, json={"schema_name": source["schema_name"]}
        ).status_code
        == 422
    )
    duplicate = upload(client, headers, content).json()
    assert duplicate["schema_name"] == "quarterly_sales_2"
    assert analyze(client, headers, cube["id"]).json()["rows"] == [{"m0": 2}]


def test_sqlite_multitable_constraints_and_atomic_rollback(client, tmp_path):
    headers = account(client)
    data = sqlite_file(tmp_path)
    response = upload(client, headers, data, name="Retail Store.sqlite")
    assert response.status_code == 201, response.text
    source = response.json()
    schema = source["schema_name"]
    cubes = client.get("/sources/" + source["id"], headers=headers).json()["cubes"]
    assert len(cubes) == 3
    order_cube = next(c for c in cubes if c["definition"]["table"] == "orders")
    assert analyze(
        client, headers, order_cube["id"], metrics=[{"field": "amount", "aggregation": "sum"}]
    ).json()["rows"] == [{"m0": "30.75"}]
    constraints = query(
        "SELECT contype::text AS contype FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace WHERE n.nspname=$1",
        schema,
    )
    assert {"p", "u", "f"} <= {row["contype"] for row in constraints}
    # Recreating the connection reads source records from PostgreSQL rather than transient upload state.
    assert len(client.get("/sources", headers=headers).json()["sources"]) == 1
    bad_path = tmp_path / "bad"
    bad_path.mkdir()
    failed = upload(client, headers, sqlite_file(bad_path, True), name="Broken Data.sqlite")
    assert failed.status_code == 422, failed.text
    assert not query("SELECT nspname FROM pg_namespace WHERE nspname='broken_data'")
    assert len(client.get("/sources", headers=headers).json()["sources"]) == 1
    missing_parent = upload(client, headers, data, name="Subset.sqlite", tables='["orders"]')
    assert (
        missing_parent.status_code == 422 and "referenced table" in missing_parent.json()["detail"]
    )
    assert not query("SELECT nspname FROM pg_namespace WHERE nspname='subset'")
    subset = upload(client, headers, data, name="Subset.sqlite", tables='["customers"]')
    assert subset.status_code == 201, subset.text
    assert len(client.get("/sources/" + subset.json()["id"], headers=headers).json()["cubes"]) == 1


def test_existing_schema_reuse_and_no_unapproved_schema(client):
    headers = account(client)
    overview = client.get("/sources", headers=headers).json()
    assert overview["available_schemas"] == [{"schema_name": "business", "table_count": 1}]
    response = client.post("/sources/connect", headers=headers, json={"schema_name": "business"})
    assert response.status_code == 201, response.text
    first = response.json()["id"]
    again = client.post("/sources/connect", headers=headers, json={"schema_name": "business"})
    assert again.json()["id"] == first
    assert len(client.get("/sources", headers=headers).json()["sources"]) == 1
    cube = client.get("/sources/" + first, headers=headers).json()["cubes"][0]
    assert analyze(client, headers, cube["id"]).json()["rows"] == [{"m0": 4}]
    assert (
        client.post(
            "/sources/connect", headers=headers, json={"schema_name": "chat_olap"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/sources/connect", headers=headers, json={"schema_name": "unknown"}
        ).status_code
        == 422
    )


def test_import_rejects_bad_selection_and_rolls_back(client):
    headers = account(client)
    content = b"a\n1\n"
    for tables in ["[]", '["missing"]', "{}", "[42]", '["data","data"]']:
        assert upload(client, headers, content, tables=tables).status_code == 422
    assert client.get("/sources", headers=headers).json()["sources"] == []
    assert preview(client, {}, content).status_code == 401
    assert upload(client, {}, content).status_code == 401


def test_body_size_limit(client):
    headers = account(client)
    response = client.post(
        "/sources/import",
        headers={**headers, "Content-Length": str(100 * 1024 * 1024)},
        content=b"x",
    )
    assert response.status_code == 413


def test_uploaded_schema_cannot_be_connected_by_another_user_even_if_allowlisted(client):
    headers = account(client)
    source = upload(client, headers, b"a\n1\n").json()
    client.app.state.settings.analytics_schemas.append(source["schema_name"])
    other = account(client, "other@example.com")
    available = client.get("/sources", headers=other).json()["available_schemas"]
    assert source["schema_name"] not in [s["schema_name"] for s in available]
    response = client.post(
        "/sources/connect", headers=other, json={"schema_name": source["schema_name"]}
    )
    assert response.status_code == 422
    assert client.post("/cubes/discover", headers=other).json()["discovered"] == 1
    assert all(
        c["definition"]["schema"] != source["schema_name"]
        for c in client.get("/cubes", headers=other).json()
    )


def test_real_file_size_limit_and_streamed_body_limit(client):
    headers = account(client)
    client.app.state.settings.upload_max_bytes = 1024
    assert preview(client, headers, b"a\n" + b"x" * 2000).status_code == 413
    boundary = "import-test-boundary"
    body = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="large.csv"\r\nContent-Type: text/csv\r\n\r\n'.encode()
        + b"x" * (2 * 1024 * 1024)
        + f"\r\n--{boundary}--\r\n".encode()
    )
    response = client.post(
        "/sources/preview",
        headers={**headers, "Content-Type": f"multipart/form-data; boundary={boundary}"},
        content=iter([body[:100], body[100:]]),
    )
    assert response.status_code == 413, response.text


def test_composite_keys_and_cycles_import(client, tmp_path):
    path = tmp_path / "linked.sqlite"
    db = sqlite3.connect(path)
    db.executescript("""CREATE TABLE parent(a INTEGER,b INTEGER,PRIMARY KEY(a,b));
        CREATE TABLE child(a INTEGER,b INTEGER,FOREIGN KEY(a,b) REFERENCES parent(a,b));
        INSERT INTO parent VALUES(1,2);INSERT INTO child VALUES(1,2);
        CREATE TABLE left_side(id INTEGER PRIMARY KEY,right_id INTEGER REFERENCES right_side(id));
        CREATE TABLE right_side(id INTEGER PRIMARY KEY,left_id INTEGER REFERENCES left_side(id));
        INSERT INTO left_side VALUES(1,1);INSERT INTO right_side VALUES(1,1);""")
    db.commit()
    db.close()
    headers = account(client)
    response = upload(client, headers, path.read_bytes(), name=path.name)
    assert response.status_code == 201, response.text
    details = client.get("/sources/" + response.json()["id"], headers=headers).json()
    assert len(details["cubes"]) == 4


def test_large_integer_is_preserved_as_numeric():
    parsed = parse_file(("n\n" + "9" * 4500 + "\n").encode(), "big.csv", settings())
    assert parsed.tables[0].columns[0]["type"] == "numeric"
    assert len(str(parsed.tables[0].rows[0][0])) == 4500


def test_preview_truncates_only_display_values():
    value = "x" * 1000
    parsed = parse_file(("text\n" + value + "\n").encode(), "notes.csv", settings())
    table = parsed.tables[0]
    assert table.rows[0][0] == value
    assert table.summary()["sample_rows"][0][0] == "x" * 300 + "…"


def test_sqlite_binary_values_and_unreserved_sqlite_prefix(client, tmp_path):
    path = tmp_path / "binary.sqlite"
    db = sqlite3.connect(path)
    db.execute("CREATE TABLE sqlitefoo(id INTEGER PRIMARY KEY,payload BLOB)")
    db.execute("INSERT INTO sqlitefoo VALUES(?,?)", (1, b"\x00\xff\x01"))
    db.commit()
    db.close()
    headers = account(client)
    response = upload(client, headers, path.read_bytes(), name=path.name)
    assert response.status_code == 201, response.text
    source = response.json()
    assert (
        query("SELECT payload FROM " + '"' + source["schema_name"] + '".sqlitefoo')[0]["payload"]
        == b"\x00\xff\x01"
    )
    details = client.get("/sources/" + source["id"], headers=headers).json()
    assert [c["name"] for c in details["cubes"][0]["definition"]["fields"]] == ["id"]


def test_migration_backfills_legacy_cubes_without_losing_history(client):
    from uuid import uuid4

    async def verify():
        db = await asyncpg.connect(os.environ["TEST_DATABASE_URL"])
        user_id, cube_id, session_id, message_id = [uuid4() for _ in range(4)]
        try:
            await db.execute(
                "INSERT INTO chat_olap.users(id,email,password_hash) VALUES($1,'legacy@example.com','unused')",
                user_id,
            )
            await db.execute(
                "INSERT INTO chat_olap.cubes(id,owner_id,source_schema,source_table,definition) VALUES($1,$2,'business','sales','{}')",
                cube_id,
                user_id,
            )
            await db.execute(
                "INSERT INTO chat_olap.sessions(id,owner_id,cube_id) VALUES($1,$2,$3)",
                session_id,
                user_id,
                cube_id,
            )
            await db.execute(
                "INSERT INTO chat_olap.messages(id,session_id,question,result) VALUES($1,$2,'old question','{\"answer\":\"stored evidence\"}')",
                message_id,
                session_id,
            )
            for _ in range(2):
                await db.execute(Path("migrations/002_sources.sql").read_text())
            row = await db.fetchrow(
                "SELECT c.id,s.schema_name,s.kind FROM chat_olap.cubes c JOIN chat_olap.sources s ON s.id=c.source_id WHERE c.id=$1",
                cube_id,
            )
            assert dict(row) == {"id": cube_id, "schema_name": "business", "kind": "existing"}
            assert (
                await db.fetchval(
                    "SELECT result->>'answer' FROM chat_olap.messages WHERE id=$1", message_id
                )
                == "stored evidence"
            )
            assert (
                await db.fetchval(
                    "SELECT count(*) FROM chat_olap.sources WHERE owner_id=$1", user_id
                )
                == 1
            )
        finally:
            await db.close()

    asyncio.run(verify())


def test_imported_source_limit_per_account(client):
    headers = account(client)
    content = b"region,amount\nNorth,1\n"
    assert upload(client, headers, content).status_code == 201
    assert upload(client, headers, content).status_code == 201
    third = upload(client, headers, content)
    assert third.status_code == 422 and "2 imported-source limit" in third.json()["detail"]
    other = account(client, "other@example.com")
    assert upload(client, other, content).status_code == 201


def test_delete_source_with_chats_frees_limit(client):
    headers = account(client)
    content = b"region,amount\nNorth,1\n"
    res1 = upload(client, headers, content)
    assert res1.status_code == 201
    source1 = res1.json()

    res2 = upload(client, headers, content)
    assert res2.status_code == 201

    # Limit of 2 reached
    third = upload(client, headers, content)
    assert third.status_code == 422 and "2 imported-source limit" in third.json()["detail"]

    # Create a chat session with source1
    cubes_res = client.get("/cubes", headers=headers)
    assert cubes_res.status_code == 200
    source1_cubes = [c for c in cubes_res.json() if c["source_id"] == source1["id"]]
    assert len(source1_cubes) > 0
    primary_cube_id = source1_cubes[0]["id"]

    session_res = client.post(
        "/chat/session",
        headers=headers,
        json={"cube_id": primary_cube_id, "cube_ids": [primary_cube_id]},
    )
    assert session_res.status_code == 201
    session_id = session_res.json()["id"]

    # Verify session exists
    sessions_res = client.get("/chat/sessions", headers=headers)
    assert any(s["id"] == session_id for s in sessions_res.json())

    # Delete source1
    del_res = client.delete(f"/sources/{source1['id']}", headers=headers)
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # Verify source1 is gone from sources list
    sources_res = client.get("/sources", headers=headers)
    assert all(s["id"] != source1["id"] for s in sources_res.json()["sources"])

    # Verify source1's cubes are gone
    cubes_after = client.get("/cubes", headers=headers).json()
    assert all(c["source_id"] != source1["id"] for c in cubes_after)

    # Verify source1's chat session is cascade deleted
    sessions_after = client.get("/chat/sessions", headers=headers).json()
    assert all(s["id"] != session_id for s in sessions_after)

    # Deleting source1 freed up the limit: upload new source successfully
    res4 = upload(client, headers, content)
    assert res4.status_code == 201


def test_delete_chat_session(client):
    headers = account(client)
    content = b"region,amount\nNorth,1\n"
    res = upload(client, headers, content)
    assert res.status_code == 201
    source = res.json()

    cubes = [
        c
        for c in client.get("/cubes", headers=headers).json()
        if c["source_id"] == source["id"]
    ]
    session_res = client.post(
        "/chat/session",
        headers=headers,
        json={"cube_id": cubes[0]["id"], "cube_ids": [cubes[0]["id"]]},
    )
    assert session_res.status_code == 201
    session_id = session_res.json()["id"]

    # Delete the session
    del_res = client.delete(f"/chat/session/{session_id}", headers=headers)
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # Verify session is gone
    sessions_after = client.get("/chat/sessions", headers=headers).json()
    assert all(s["id"] != session_id for s in sessions_after)



def test_multitable_chat_persistence_join_and_ownership(client, tmp_path, monkeypatch):
    from unittest.mock import AsyncMock

    from pydantic import SecretStr

    from tests.test_chat_agent import response

    headers = account(client)
    source = upload(client, headers, sqlite_file(tmp_path), name="Retail.sqlite").json()
    cubes = client.get("/sources/" + source["id"], headers=headers).json()["cubes"]
    by_table = {c["definition"]["table"]: c for c in cubes}
    primary = by_table["orders"]["id"]
    extra = by_table["customers"]["id"]
    selected = [primary, extra]
    created = client.post(
        "/chat/session", headers=headers, json={"cube_id": primary, "cube_ids": selected}
    )
    assert created.status_code == 201, created.text
    session = created.json()["id"]
    endpoint = f"/chat/session/{session}"
    assert created.json()["cube_ids"] == selected
    assert client.get(endpoint, headers=headers).json()["cube_ids"] == selected
    assert client.get("/chat/sessions", headers=headers).json()[0]["cube_ids"] == selected

    other = account(client, "outsider@example.com")
    assert (
        client.post(endpoint + "/tables", headers=other, json={"cube_ids": selected}).status_code
        == 404
    )
    assert (
        client.post(
            "/chat/session", headers=other, json={"cube_id": primary, "cube_ids": selected}
        ).status_code
        == 404
    )
    own_source = upload(client, other, b"id,name\n1,Other\n", name="Other.csv").json()
    foreign_cube = client.get("/sources/" + own_source["id"], headers=other).json()["cubes"][0][
        "id"
    ]
    assert (
        client.post(
            endpoint + "/tables", headers=headers, json={"cube_ids": [primary, foreign_cube]}
        ).status_code
        == 404
    )
    assert client.get(endpoint, headers=headers).json()["cube_ids"] == selected

    schema = source["schema_name"]
    sql = f'''WITH totals AS (
        SELECT customer_id, sum(amount) AS amount FROM "{schema}".orders GROUP BY customer_id
    ) SELECT c.name, t.amount FROM totals t JOIN "{schema}".customers c ON c.id=t.customer_id
      ORDER BY c.name'''
    provider = AsyncMock()
    provider.__aenter__.return_value = provider
    provider.responses.create.side_effect = [
        response("source_schema", {"purpose": "Inspect selected tables"}, 0),
        response("query_postgres", {"sql": sql, "purpose": "Join order totals to customers"}, 1),
        response("finish", {"answer": "North: 10.25; South: 20.5"}, 2),
    ]
    monkeypatch.setattr("backend.services.chat_agent.AsyncOpenAI", lambda **kw: provider)
    client.app.state.settings.openai_api_key = SecretStr("test-key")
    result = client.post(
        endpoint + "/messages", headers=headers, json={"question": "Join orders and customers"}
    )
    assert result.status_code == 200, result.text
    assert result.json()["rows"] == [
        {"name": "North", "amount": "10.25"},
        {"name": "South", "amount": "20.5"},
    ]
    schema_step = next(s for s in result.json()["steps"] if s["tool"] == "source_schema")
    assert {d["table"] for d in schema_step["output"]["tables"]} == {"orders", "customers"}
    history = client.get(endpoint, headers=headers).json()
    assert len(history["messages"]) == 1
    assert history["messages"][0]["result"]["cube_ids"] == selected

    updated = client.post(endpoint + "/tables", headers=headers, json={"cube_ids": [primary]})
    assert updated.status_code == 200 and updated.json()["cube_ids"] == [primary]
    assert len(client.get(endpoint, headers=headers).json()["messages"]) == 1
    provider.responses.create.side_effect = [
        response("query_postgres", {"sql": sql, "purpose": "Try the previous join"}, 3),
        response("ask_user", {"question": "Add customers to this chat first."}, 4),
    ]
    narrowed = client.post(
        endpoint + "/messages", headers=headers, json={"question": "Repeat the join"}
    ).json()
    assert narrowed["status"] == "clarification"
    attempt = next(step for step in narrowed["steps"] if step["tool"] == "query_postgres")
    assert attempt["status"] == "failed"
    assert "source_schema" in attempt["output"]["error"]
    assert not narrowed.get("rows")
    # The fixed main table is retained, and duplicate selections are collapsed.
    assert (
        client.post(
            endpoint + "/tables", headers=headers, json={"cube_ids": [extra, extra]}
        ).json()["cube_ids"]
        == selected
    )
    assert (
        client.post(endpoint + "/tables", headers=headers, json={"cube_ids": []}).status_code == 422
    )

    labels_source = upload(client, headers, b"id,label\n1,A\n2,B\n", name="Labels.csv").json()
    labels = client.get("/sources/" + labels_source["id"], headers=headers).json()["cubes"][0]
    cross_selected = [primary, labels["id"]]
    assert (
        client.post(
            endpoint + "/tables", headers=headers, json={"cube_ids": cross_selected}
        ).status_code
        == 200
    )
    label_table = f'"{labels["definition"]["schema"]}"."{labels["definition"]["table"]}"'
    cross_sql = f'''SELECT o.id, l.label FROM "{schema}".orders o
        JOIN {label_table} l ON l.id=o.id
        WHERE o.customer_id IN (SELECT id FROM {label_table}) ORDER BY o.id'''
    provider.responses.create.side_effect = [
        response(
            "query_postgres", {"sql": cross_sql, "purpose": "Join across imported schemas"}, 5
        ),
        response("finish", {"answer": "Orders 1 and 2 have labels A and B."}, 6),
    ]
    cross_result = client.post(
        endpoint + "/messages",
        headers=headers,
        json={"question": "Join orders to the uploaded labels"},
    )
    assert cross_result.status_code == 200, cross_result.text
    assert cross_result.json()["rows"] == [{"id": 1, "label": "A"}, {"id": 2, "label": "B"}]
    assert cross_result.json()["cube_ids"] == cross_selected


def make_excel(sheets: dict[str, list[list]]) -> bytes:
    wb = openpyxl.Workbook()
    first = True
    for name, rows in sheets.items():
        ws = wb.active if first else wb.create_sheet(name)
        first = False
        ws.title = name
        for row in rows:
            ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_excel_parser_multiple_sheets_and_types():
    from datetime import date, datetime

    data = make_excel(
        {
            "Customers": [
                ["Customer ID", "Full Name", "Active", "Joined On"],
                [1, "Alice", True, date(2026, 1, 1)],
                [2, "Bob", False, date(2026, 2, 1)],
            ],
            "Orders": [
                ["Order ID", "Total Amount", "Created At"],
                [101, 49.99, datetime(2026, 1, 10, 15, 30)],
                [102, 120.50, datetime(2026, 1, 11, 16, 45)],
            ],
            "EmptySheet": [
                [None, None],
                [None, None],
            ],
        }
    )
    parsed = parse_file(data, "Company Sales.xlsx", settings())
    assert parsed.kind == "excel"
    assert parsed.schema_name == "company_sales"
    assert len(parsed.tables) == 2
    customers = parsed.tables[0]
    orders = parsed.tables[1]
    assert customers.original_name == "Customers"
    assert customers.name == "customers"
    assert [c["type"] for c in customers.columns] == ["int8", "text", "bool", "date"]
    assert orders.original_name == "Orders"
    assert orders.name == "orders"
    assert [c["type"] for c in orders.columns] == ["int8", "numeric", "timestamptz"]


def test_excel_empty_rows_and_trailing_columns():
    data = make_excel(
        {
            "Data": [
                [None, None, None],
                ["Code", "Value", None, None],
                ["A1", 100, None, ""],
                [None, None, None, None],
                ["A2", 200, "", None],
            ]
        }
    )
    parsed = parse_file(data, "Tricky.xlsx", settings())
    assert len(parsed.tables) == 1
    table = parsed.tables[0]
    assert [c["name"] for c in table.columns] == ["code", "value"]
    assert len(table.rows) == 2
    assert table.rows[0] == ("A1", 100)
    assert table.rows[1] == ("A2", 200)


def test_excel_invalid_and_collisions():
    empty_wb = make_excel({"Sheet1": [[None, None]], "Sheet2": []})
    with pytest.raises(ImportInvalid, match="no sheets with valid data"):
        parse_file(empty_wb, "empty.xlsx", settings())

    bad_header = make_excel({"Sheet1": [["A", None, "C"], [1, 2, 3]]})
    with pytest.raises(ImportInvalid, match="non-empty header"):
        parse_file(bad_header, "bad_header.xlsx", settings())

    collision = make_excel({"My Sheet": [["a"], [1]], "My_Sheet": [["b"], [2]]})
    with pytest.raises(ImportInvalid, match="sheet names collide"):
        parse_file(collision, "collision.xlsx", settings())

    with pytest.raises(ImportInvalid, match="not a valid Excel spreadsheet"):
        parse_file(b"PK\x03\x04corrupt_zip_content", "corrupt.xlsx", settings())


def test_import_excel_api_multisheet_and_selection(client):
    headers = account(client, "excel_tester@example.com")
    data = make_excel(
        {
            "Customers": [
                ["ID", "Name"],
                [1, "Alice"],
                [2, "Bob"],
            ],
            "Orders": [
                ["ID", "Customer ID", "Amount"],
                [10, 1, 100.50],
                [20, 2, 200.75],
            ],
        }
    )
    resp = preview(client, headers, data, name="Retail Store.xlsx")
    assert resp.status_code == 200, resp.text
    preview_data = resp.json()
    assert preview_data["kind"] == "excel"
    assert len(preview_data["tables"]) == 2
    table_names = {t["original_name"] for t in preview_data["tables"]}
    assert table_names == {"Customers", "Orders"}

    # Selective import (only Customers)
    imported = upload(client, headers, data, name="Retail Store.xlsx", tables='["Customers"]')
    assert imported.status_code == 201, imported.text
    source = imported.json()
    assert source["kind"] == "excel"
    detail = client.get("/sources/" + source["id"], headers=headers).json()
    assert len(detail["cubes"]) == 1
    assert detail["cubes"][0]["definition"]["table"] == "customers"


def test_import_excel_api_all_sheets_and_data_verification(client):
    headers = account(client, "excel_all_tester@example.com")
    data = make_excel(
        {
            "Customers": [
                ["ID", "Name"],
                [1, "Alice"],
                [2, "Bob"],
            ],
            "Orders": [
                ["ID", "Customer ID", "Amount"],
                [10, 1, 100.50],
                [20, 2, 200.75],
            ],
        }
    )
    imported = upload(client, headers, data, name="All Sales.xlsx")
    assert imported.status_code == 201, imported.text
    source = imported.json()
    assert source["kind"] == "excel"
    detail = client.get("/sources/" + source["id"], headers=headers).json()
    assert len(detail["cubes"]) == 2
    tables = {c["definition"]["table"] for c in detail["cubes"]}
    assert tables == {"customers", "orders"}


