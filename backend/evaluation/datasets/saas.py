"""SaaS subscription and customer usage benchmark dataset."""

from typing import Any, Dict, List

from backend.evaluation.datasets.base import BaseDataset


class SaasDataset(BaseDataset):
    """SaaS dataset with accounts, subscription plans, and telemetry usage events."""

    name = "saas"
    schema_name = "eval_saas"
    description = "SaaS analytics dataset covering MRR, subscription tiers, retention, and event usage."

    def get_table_columns(self) -> Dict[tuple[str, str], List[Dict[str, Any]]]:
        s = self.schema_name
        return {
            (s, "accounts"): [
                {"name": "id", "type": "int4", "nullable": False, "key": True, "description": "Account ID"},
                {"name": "company_name", "type": "text", "nullable": False, "key": False, "description": "Company name"},
                {"name": "tier", "type": "text", "nullable": False, "key": False, "description": "Plan tier"},
                {"name": "status", "type": "text", "nullable": False, "key": False, "description": "Account status"},
                {"name": "mrr", "type": "numeric", "nullable": False, "key": False, "description": "Monthly recurring revenue"},
                {"name": "created_at", "type": "date", "nullable": False, "key": False, "description": "Signup date"},
            ],
            (s, "subscriptions"): [
                {"name": "id", "type": "int4", "nullable": False, "key": True, "description": "Subscription ID"},
                {"name": "account_id", "type": "int4", "nullable": False, "key": True, "description": "Account FK"},
                {"name": "plan_name", "type": "text", "nullable": False, "key": False, "description": "Plan name"},
                {"name": "billing_cycle", "type": "text", "nullable": False, "key": False, "description": "Billing cycle"},
                {"name": "price", "type": "numeric", "nullable": False, "key": False, "description": "Subscription price"},
                {"name": "start_date", "type": "date", "nullable": False, "key": False, "description": "Start date"},
            ],
            (s, "usage_events"): [
                {"name": "id", "type": "int4", "nullable": False, "key": True, "description": "Event record ID"},
                {"name": "account_id", "type": "int4", "nullable": False, "key": True, "description": "Account FK"},
                {"name": "event_type", "type": "text", "nullable": False, "key": False, "description": "Event type"},
                {"name": "event_count", "type": "int4", "nullable": False, "key": False, "description": "Count of events"},
                {"name": "recorded_date", "type": "date", "nullable": False, "key": False, "description": "Date recorded"},
            ],
        }

    def get_constraints(self) -> List[Dict[str, Any]]:
        s = self.schema_name
        return [
            {"schema": s, "table": "accounts", "name": "pk_accounts", "kind": "p", "columns": ["id"]},
            {"schema": s, "table": "subscriptions", "name": "pk_subscriptions", "kind": "p", "columns": ["id"]},
            {"schema": s, "table": "usage_events", "name": "pk_usage_events", "kind": "p", "columns": ["id"]},
            {
                "schema": s,
                "table": "subscriptions",
                "name": "fk_subs_account",
                "kind": "f",
                "columns": ["account_id"],
                "target_schema": s,
                "target_table": "accounts",
                "target_columns": ["id"],
            },
            {
                "schema": s,
                "table": "usage_events",
                "name": "fk_usage_account",
                "kind": "f",
                "columns": ["account_id"],
                "target_schema": s,
                "target_table": "accounts",
                "target_columns": ["id"],
            },
        ]

    def get_ddl_statements(self) -> List[str]:
        s = self.schema_name
        return [
            f"CREATE SCHEMA IF NOT EXISTS {s}",
            f"""CREATE TABLE IF NOT EXISTS {s}.accounts (
                id INTEGER PRIMARY KEY,
                company_name TEXT NOT NULL,
                tier TEXT NOT NULL,
                status TEXT NOT NULL,
                mrr NUMERIC(10,2) NOT NULL,
                created_at DATE NOT NULL
            )""",
            f"""CREATE TABLE IF NOT EXISTS {s}.subscriptions (
                id INTEGER PRIMARY KEY,
                account_id INTEGER NOT NULL REFERENCES {s}.accounts(id),
                plan_name TEXT NOT NULL,
                billing_cycle TEXT NOT NULL,
                price NUMERIC(10,2) NOT NULL,
                start_date DATE NOT NULL
            )""",
            f"""CREATE TABLE IF NOT EXISTS {s}.usage_events (
                id INTEGER PRIMARY KEY,
                account_id INTEGER NOT NULL REFERENCES {s}.accounts(id),
                event_type TEXT NOT NULL,
                event_count INTEGER NOT NULL,
                recorded_date DATE NOT NULL
            )""",
        ]

    def get_seed_statements(self) -> List[str]:
        s = self.schema_name
        return [
            # Accounts (10 accounts: 7 active, 2 churned, 1 trial)
            f"""INSERT INTO {s}.accounts (id, company_name, tier, status, mrr, created_at) VALUES
                (1, 'AlphaCloud', 'Enterprise', 'active', 2500.00, '2025-01-10'),
                (2, 'BetaWorks', 'Professional', 'active', 850.00, '2025-02-15'),
                (3, 'GammaAI', 'Enterprise', 'active', 3200.00, '2025-03-01'),
                (4, 'DeltaPay', 'Starter', 'churned', 150.00, '2025-03-20'),
                (5, 'EpsilonNet', 'Professional', 'active', 950.00, '2025-04-12'),
                (6, 'ZetaData', 'Starter', 'active', 190.00, '2025-05-18'),
                (7, 'EtaSecurity', 'Enterprise', 'active', 4100.00, '2025-06-25'),
                (8, 'ThetaHealth', 'Professional', 'churned', 800.00, '2025-07-08'),
                (9, 'IotaLogistics', 'Starter', 'active', 220.00, '2025-08-14'),
                (10, 'KappaMedia', 'Professional', 'trial', 0.00, '2025-09-01')
            """,
            # Subscriptions
            f"""INSERT INTO {s}.subscriptions (id, account_id, plan_name, billing_cycle, price, start_date) VALUES
                (1, 1, 'Enterprise Yearly', 'annual', 27000.00, '2025-01-10'),
                (2, 2, 'Pro Monthly', 'monthly', 850.00, '2025-02-15'),
                (3, 3, 'Enterprise Yearly', 'annual', 35000.00, '2025-03-01'),
                (4, 4, 'Starter Monthly', 'monthly', 150.00, '2025-03-20'),
                (5, 5, 'Pro Yearly', 'annual', 10000.00, '2025-04-12'),
                (6, 6, 'Starter Monthly', 'monthly', 190.00, '2025-05-18'),
                (7, 7, 'Enterprise Monthly', 'monthly', 4100.00, '2025-06-25'),
                (8, 8, 'Pro Monthly', 'monthly', 800.00, '2025-07-08'),
                (9, 9, 'Starter Monthly', 'monthly', 220.00, '2025-08-14')
            """,
            # Usage Events
            f"""INSERT INTO {s}.usage_events (id, account_id, event_type, event_count, recorded_date) VALUES
                (1, 1, 'api_request', 150000, '2026-01-01'),
                (2, 1, 'report_export', 450, '2026-01-02'),
                (3, 2, 'api_request', 35000, '2026-01-01'),
                (4, 3, 'api_request', 280000, '2026-01-01'),
                (5, 3, 'report_export', 820, '2026-01-02'),
                (6, 5, 'api_request', 42000, '2026-01-01'),
                (7, 6, 'api_request', 8000, '2026-01-01'),
                (8, 7, 'api_request', 390000, '2026-01-01'),
                (9, 7, 'report_export', 1100, '2026-01-02'),
                (10, 9, 'api_request', 12000, '2026-01-01')
            """,
        ]
