"""Corporate Finance & Budgeting benchmark dataset."""

from typing import Any, Dict, List

from backend.evaluation.datasets.base import BaseDataset


class FinanceDataset(BaseDataset):
    """Financial dataset with departments, annual budgets, and departmental expenses."""

    name = "finance"
    schema_name = "eval_finance"
    description = "Corporate finance dataset covering department budgets, actual expenses, and variances."

    def get_table_columns(self) -> Dict[tuple[str, str], List[Dict[str, Any]]]:
        s = self.schema_name
        return {
            (s, "departments"): [
                {"name": "id", "type": "int4", "nullable": False, "key": True, "description": "Department ID"},
                {"name": "name", "type": "text", "nullable": False, "key": False, "description": "Department name"},
                {"name": "headcount", "type": "int4", "nullable": False, "key": False, "description": "Full-time headcount"},
            ],
            (s, "budgets"): [
                {"name": "id", "type": "int4", "nullable": False, "key": True, "description": "Budget record ID"},
                {"name": "department_id", "type": "int4", "nullable": False, "key": True, "description": "Department FK"},
                {"name": "fiscal_year", "type": "int4", "nullable": False, "key": False, "description": "Fiscal year"},
                {"name": "allocated_amount", "type": "numeric", "nullable": False, "key": False, "description": "Allocated budget"},
            ],
            (s, "expenses"): [
                {"name": "id", "type": "int4", "nullable": False, "key": True, "description": "Expense ID"},
                {"name": "department_id", "type": "int4", "nullable": False, "key": True, "description": "Department FK"},
                {"name": "category", "type": "text", "nullable": False, "key": False, "description": "Expense category"},
                {"name": "amount", "type": "numeric", "nullable": False, "key": False, "description": "Expense amount"},
                {"name": "incurred_date", "type": "date", "nullable": False, "key": False, "description": "Expense date"},
            ],
        }

    def get_constraints(self) -> List[Dict[str, Any]]:
        s = self.schema_name
        return [
            {"schema": s, "table": "departments", "name": "pk_departments", "kind": "p", "columns": ["id"]},
            {"schema": s, "table": "budgets", "name": "pk_budgets", "kind": "p", "columns": ["id"]},
            {"schema": s, "table": "expenses", "name": "pk_expenses", "kind": "p", "columns": ["id"]},
            {
                "schema": s,
                "table": "budgets",
                "name": "fk_budgets_dept",
                "kind": "f",
                "columns": ["department_id"],
                "target_schema": s,
                "target_table": "departments",
                "target_columns": ["id"],
            },
            {
                "schema": s,
                "table": "expenses",
                "name": "fk_expenses_dept",
                "kind": "f",
                "columns": ["department_id"],
                "target_schema": s,
                "target_table": "departments",
                "target_columns": ["id"],
            },
        ]

    def get_ddl_statements(self) -> List[str]:
        s = self.schema_name
        return [
            f"CREATE SCHEMA IF NOT EXISTS {s}",
            f"""CREATE TABLE IF NOT EXISTS {s}.departments (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                headcount INTEGER NOT NULL
            )""",
            f"""CREATE TABLE IF NOT EXISTS {s}.budgets (
                id INTEGER PRIMARY KEY,
                department_id INTEGER NOT NULL REFERENCES {s}.departments(id),
                fiscal_year INTEGER NOT NULL,
                allocated_amount NUMERIC(14,2) NOT NULL
            )""",
            f"""CREATE TABLE IF NOT EXISTS {s}.expenses (
                id INTEGER PRIMARY KEY,
                department_id INTEGER NOT NULL REFERENCES {s}.departments(id),
                category TEXT NOT NULL,
                amount NUMERIC(12,2) NOT NULL,
                incurred_date DATE NOT NULL
            )""",
        ]

    def get_seed_statements(self) -> List[str]:
        s = self.schema_name
        return [
            # Departments (5 departments)
            f"""INSERT INTO {s}.departments (id, name, headcount) VALUES
                (1, 'Engineering', 45),
                (2, 'Sales & Marketing', 30),
                (3, 'Product Management', 12),
                (4, 'Finance & Legal', 8),
                (5, 'Human Resources', 6)
            """,
            # Budgets for Fiscal Year 2026
            f"""INSERT INTO {s}.budgets (id, department_id, fiscal_year, allocated_amount) VALUES
                (1, 1, 2026, 1200000.00),
                (2, 2, 2026, 850000.00),
                (3, 3, 2026, 350000.00),
                (4, 4, 2026, 250000.00),
                (5, 5, 2026, 180000.00)
            """,
            # Expenses (15 line items)
            f"""INSERT INTO {s}.expenses (id, department_id, category, amount, incurred_date) VALUES
                (1, 1, 'Cloud Infrastructure', 185000.00, '2026-01-15'),
                (2, 1, 'Developer Tooling', 42000.00, '2026-02-01'),
                (3, 1, 'Contract Engineering', 95000.00, '2026-02-20'),
                (4, 2, 'Ad Campaigns', 140000.00, '2026-01-20'),
                (5, 2, 'Events & Conferences', 65000.00, '2026-02-15'),
                (6, 2, 'Sales CRM Licensing', 38000.00, '2026-03-01'),
                (7, 3, 'User Research', 25000.00, '2026-01-10'),
                (8, 3, 'Design Software', 15000.00, '2026-02-12'),
                (9, 4, 'Audit Services', 45000.00, '2026-01-28'),
                (10, 4, 'Legal Retainer', 30000.00, '2026-02-25'),
                (11, 5, 'Recruiting Platforms', 22000.00, '2026-01-18'),
                (12, 5, 'Employee Training', 18000.00, '2026-02-22'),
                (13, 1, 'Cloud Infrastructure', 195000.00, '2026-03-15'),
                (14, 2, 'Ad Campaigns', 160000.00, '2026-03-20'),
                (15, 3, 'Prototyping Hardware', 18000.00, '2026-03-25')
            """,
        ]
