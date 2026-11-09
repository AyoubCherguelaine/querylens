"""E-Commerce & Retail benchmark dataset for agent evaluation."""

from typing import Any, Dict, List

from backend.evaluation.datasets.base import BaseDataset


class EcommerceDataset(BaseDataset):
    """E-Commerce dataset with customers, categories, products, orders, and order items."""

    name = "ecommerce"
    schema_name = "eval_ecommerce"
    description = "Enterprise e-commerce dataset covering sales, orders, items, and customers."

    def get_table_columns(self) -> Dict[tuple[str, str], List[Dict[str, Any]]]:
        s = self.schema_name
        return {
            (s, "categories"): [
                {"name": "id", "type": "int4", "nullable": False, "key": True, "description": "Category ID"},
                {"name": "name", "type": "text", "nullable": False, "key": False, "description": "Category name"},
                {"name": "department", "type": "text", "nullable": False, "key": False, "description": "Department"},
            ],
            (s, "products"): [
                {"name": "id", "type": "int4", "nullable": False, "key": True, "description": "Product ID"},
                {"name": "name", "type": "text", "nullable": False, "key": False, "description": "Product name"},
                {"name": "category_id", "type": "int4", "nullable": False, "key": True, "description": "Category FK"},
                {"name": "cost", "type": "numeric", "nullable": False, "key": False, "description": "Cost"},
                {"name": "price", "type": "numeric", "nullable": False, "key": False, "description": "Retail price"},
                {"name": "stock", "type": "int4", "nullable": False, "key": False, "description": "Units in stock"},
            ],
            (s, "customers"): [
                {"name": "id", "type": "int4", "nullable": False, "key": True, "description": "Customer ID"},
                {"name": "name", "type": "text", "nullable": False, "key": False, "description": "Full name"},
                {"name": "email", "type": "text", "nullable": False, "key": False, "description": "Email address"},
                {"name": "segment", "type": "text", "nullable": False, "key": False, "description": "Customer segment"},
                {"name": "city", "type": "text", "nullable": False, "key": False, "description": "City"},
                {"name": "country", "type": "text", "nullable": False, "key": False, "description": "Country"},
                {"name": "created_at", "type": "date", "nullable": False, "key": False, "description": "Account created date"},
            ],
            (s, "orders"): [
                {"name": "id", "type": "int4", "nullable": False, "key": True, "description": "Order ID"},
                {"name": "customer_id", "type": "int4", "nullable": False, "key": True, "description": "Customer FK"},
                {"name": "status", "type": "text", "nullable": False, "key": False, "description": "Order status"},
                {"name": "total_amount", "type": "numeric", "nullable": False, "key": False, "description": "Total order amount"},
                {"name": "discount_amount", "type": "numeric", "nullable": False, "key": False, "description": "Discount applied"},
                {"name": "ordered_at", "type": "date", "nullable": False, "key": False, "description": "Order date"},
            ],
            (s, "order_items"): [
                {"name": "id", "type": "int4", "nullable": False, "key": True, "description": "Item ID"},
                {"name": "order_id", "type": "int4", "nullable": False, "key": True, "description": "Order FK"},
                {"name": "product_id", "type": "int4", "nullable": False, "key": True, "description": "Product FK"},
                {"name": "quantity", "type": "int4", "nullable": False, "key": False, "description": "Quantity purchased"},
                {"name": "unit_price", "type": "numeric", "nullable": False, "key": False, "description": "Unit sale price"},
                {"name": "line_total", "type": "numeric", "nullable": False, "key": False, "description": "Line total"},
            ],
        }

    def get_constraints(self) -> List[Dict[str, Any]]:
        s = self.schema_name
        return [
            # Primary keys
            {"schema": s, "table": "categories", "name": "pk_categories", "kind": "p", "columns": ["id"]},
            {"schema": s, "table": "products", "name": "pk_products", "kind": "p", "columns": ["id"]},
            {"schema": s, "table": "customers", "name": "pk_customers", "kind": "p", "columns": ["id"]},
            {"schema": s, "table": "orders", "name": "pk_orders", "kind": "p", "columns": ["id"]},
            {"schema": s, "table": "order_items", "name": "pk_order_items", "kind": "p", "columns": ["id"]},
            # Foreign keys
            {
                "schema": s,
                "table": "products",
                "name": "fk_products_category",
                "kind": "f",
                "columns": ["category_id"],
                "target_schema": s,
                "target_table": "categories",
                "target_columns": ["id"],
            },
            {
                "schema": s,
                "table": "orders",
                "name": "fk_orders_customer",
                "kind": "f",
                "columns": ["customer_id"],
                "target_schema": s,
                "target_table": "customers",
                "target_columns": ["id"],
            },
            {
                "schema": s,
                "table": "order_items",
                "name": "fk_items_order",
                "kind": "f",
                "columns": ["order_id"],
                "target_schema": s,
                "target_table": "orders",
                "target_columns": ["id"],
            },
            {
                "schema": s,
                "table": "order_items",
                "name": "fk_items_product",
                "kind": "f",
                "columns": ["product_id"],
                "target_schema": s,
                "target_table": "products",
                "target_columns": ["id"],
            },
        ]

    def get_ddl_statements(self) -> List[str]:
        s = self.schema_name
        return [
            f"CREATE SCHEMA IF NOT EXISTS {s}",
            f"""CREATE TABLE IF NOT EXISTS {s}.categories (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                department TEXT NOT NULL
            )""",
            f"""CREATE TABLE IF NOT EXISTS {s}.products (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                category_id INTEGER NOT NULL REFERENCES {s}.categories(id),
                cost NUMERIC(10,2) NOT NULL,
                price NUMERIC(10,2) NOT NULL,
                stock INTEGER NOT NULL
            )""",
            f"""CREATE TABLE IF NOT EXISTS {s}.customers (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                segment TEXT NOT NULL,
                city TEXT NOT NULL,
                country TEXT NOT NULL,
                created_at DATE NOT NULL
            )""",
            f"""CREATE TABLE IF NOT EXISTS {s}.orders (
                id INTEGER PRIMARY KEY,
                customer_id INTEGER NOT NULL REFERENCES {s}.customers(id),
                status TEXT NOT NULL,
                total_amount NUMERIC(12,2) NOT NULL,
                discount_amount NUMERIC(10,2) NOT NULL,
                ordered_at DATE NOT NULL
            )""",
            f"""CREATE TABLE IF NOT EXISTS {s}.order_items (
                id INTEGER PRIMARY KEY,
                order_id INTEGER NOT NULL REFERENCES {s}.orders(id),
                product_id INTEGER NOT NULL REFERENCES {s}.products(id),
                quantity INTEGER NOT NULL,
                unit_price NUMERIC(10,2) NOT NULL,
                line_total NUMERIC(12,2) NOT NULL
            )""",
        ]

    def get_seed_statements(self) -> List[str]:
        s = self.schema_name
        return [
            # Categories (4 items)
            f"""INSERT INTO {s}.categories (id, name, department) VALUES
                (1, 'Laptops & Computers', 'Hardware'),
                (2, 'Monitors & Displays', 'Hardware'),
                (3, 'Peripherals & Audio', 'Accessories'),
                (4, 'Office Furniture', 'Furniture')
            """,
            # Products (10 items)
            f"""INSERT INTO {s}.products (id, name, category_id, cost, price, stock) VALUES
                (1, 'ProBook 15', 1, 650.00, 999.00, 45),
                (2, 'UltraSlim 13', 1, 800.00, 1250.00, 30),
                (3, 'Gaming Rig X', 1, 1200.00, 1850.00, 15),
                (4, '4K UltraClear 27', 2, 280.00, 450.00, 60),
                (5, 'Curved Gaming 34', 2, 450.00, 720.00, 25),
                (6, 'Wireless ANC Headset', 3, 90.00, 180.00, 120),
                (7, 'Mechanical Keyboard RGB', 3, 60.00, 120.00, 80),
                (8, 'Ergonomic Vertical Mouse', 3, 35.00, 75.00, 150),
                (9, 'Standing Desk Pro', 4, 320.00, 580.00, 40),
                (10, 'Mesh Ergonomic Chair', 4, 180.00, 340.00, 55)
            """,
            # Customers (8 items)
            f"""INSERT INTO {s}.customers (id, name, email, segment, city, country, created_at) VALUES
                (1, 'Acme Corp', 'contact@acme.com', 'Enterprise', 'New York', 'USA', '2025-01-15'),
                (2, 'Global Logistics', 'procure@globallog.com', 'Enterprise', 'Chicago', 'USA', '2025-03-20'),
                (3, 'Apex Design Studio', 'sarah@apexdesign.com', 'SMB', 'San Francisco', 'USA', '2025-06-10'),
                (4, 'TechNova Ltd', 'orders@technova.co.uk', 'SMB', 'London', 'UK', '2025-08-05'),
                (5, 'David Miller', 'david.m@gmail.com', 'Consumer', 'Austin', 'USA', '2025-09-12'),
                (6, 'Elena Rossi', 'elena.rossi@berlin.de', 'Consumer', 'Berlin', 'Germany', '2025-10-01'),
                (7, 'Marcus Chen', 'marcus.chen@vancouver.ca', 'Consumer', 'Vancouver', 'Canada', '2025-11-18'),
                (8, 'Quantum Analytics', 'purchasing@quantumanalytics.io', 'Enterprise', 'Boston', 'USA', '2026-01-05')
            """,
            # Orders (16 orders: 12 completed, 2 shipped, 1 pending, 1 cancelled)
            f"""INSERT INTO {s}.orders (id, customer_id, status, total_amount, discount_amount, ordered_at) VALUES
                (1, 1, 'completed', 4500.00, 300.00, '2026-01-10'),
                (2, 2, 'completed', 3700.00, 200.00, '2026-01-22'),
                (3, 3, 'completed', 1450.00, 50.00, '2026-02-05'),
                (4, 5, 'completed', 180.00, 0.00, '2026-02-14'),
                (5, 4, 'completed', 2850.00, 150.00, '2026-02-28'),
                (6, 1, 'completed', 6200.00, 400.00, '2026-03-12'),
                (7, 6, 'completed', 999.00, 0.00, '2026-03-25'),
                (8, 7, 'cancelled', 450.00, 0.00, '2026-04-02'),
                (9, 8, 'completed', 8200.00, 600.00, '2026-04-18'),
                (10, 2, 'completed', 2400.00, 100.00, '2026-05-09'),
                (11, 3, 'completed', 3400.00, 200.00, '2026-05-21'),
                (12, 5, 'completed', 1250.00, 50.00, '2026-06-15'),
                (13, 4, 'shipped', 1900.00, 100.00, '2026-06-28'),
                (14, 1, 'completed', 5100.00, 300.00, '2026-07-04'),
                (15, 8, 'shipped', 4200.00, 200.00, '2026-07-19'),
                (16, 6, 'pending', 720.00, 0.00, '2026-08-01')
            """,
            # Order items (25 records)
            f"""INSERT INTO {s}.order_items (id, order_id, product_id, quantity, unit_price, line_total) VALUES
                (1, 1, 1, 3, 999.00, 2997.00),
                (2, 1, 4, 3, 450.00, 1350.00),
                (3, 1, 7, 3, 120.00, 360.00),
                (4, 2, 2, 2, 1250.00, 2500.00),
                (5, 2, 5, 1, 720.00, 720.00),
                (6, 2, 6, 3, 180.00, 540.00),
                (7, 3, 4, 2, 450.00, 900.00),
                (8, 3, 10, 1, 340.00, 340.00),
                (9, 3, 8, 3, 75.00, 225.00),
                (10, 4, 6, 1, 180.00, 180.00),
                (11, 5, 1, 2, 999.00, 1998.00),
                (12, 5, 9, 1, 580.00, 580.00),
                (13, 5, 8, 4, 75.00, 300.00),
                (14, 6, 3, 2, 1850.00, 3700.00),
                (15, 6, 2, 2, 1250.00, 2500.00),
                (16, 7, 1, 1, 999.00, 999.00),
                (17, 8, 4, 1, 450.00, 450.00),
                (18, 9, 3, 3, 1850.00, 5550.00),
                (19, 9, 9, 3, 580.00, 1740.00),
                (20, 9, 10, 3, 340.00, 1020.00),
                (21, 10, 5, 2, 720.00, 1440.00),
                (22, 10, 4, 2, 450.00, 900.00),
                (23, 11, 2, 2, 1250.00, 2500.00),
                (24, 11, 6, 5, 180.00, 900.00),
                (25, 12, 2, 1, 1250.00, 1250.00)
            """,
        ]
