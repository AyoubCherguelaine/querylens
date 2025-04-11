from agents.CubeQueryGeneration import CubeQueryGeneration
from agents.OLAPCubeExtractor import OLAPCubeExtractor

if __name__ == "__main__":
    schema = {
        "tables": [
            {
                "name": "sales",
                "columns": [
                    {"name": "sale_id", "type": "integer", "is_primary": True},
                    {"name": "product_id", "type": "integer"},
                    {"name": "date_id", "type": "integer"},
                    {"name": "amount", "type": "decimal"},
                ],
            },
            {
                "name": "products",
                "columns": [
                    {"name": "product_id", "type": "integer", "is_primary": True},
                    {"name": "product_name", "type": "varchar"},
                ],
            },
            {
                "name": "dates",
                "columns": [
                    {"name": "date_id", "type": "integer", "is_primary": True},
                    {"name": "date", "type": "date"},
                    {"name": "month", "type": "varchar"},
                    {"name": "year", "type": "integer"},
                ],
            },
        ]
    }

    # extractor = OLAPCubeExtractor()
    # olap_cubes = extractor.run(schema)
    # print("\nExtracted OLAP Cubes:\n", olap_cubes)
    cube = {
        "name": "Sales Analysis Cube",
        "describe": "This cube analyzes sales data by different dimensions such as time and products.",
        "dimensions": ["Product", "Date"],
        "measures": ["Total Sales Amount"],
        "sql_query": "SELECT p.product_name AS Product, d.date AS Sale_Date, SUM(s.amount) AS Total_Sales_Amount FROM sales s JOIN products p ON s.product_id = p.product_id JOIN dates d ON s.date_id = d.date_id GROUP BY p.product_name, d.date",
    }
    queryGenerator = CubeQueryGeneration(cube)
    new_query = queryGenerator.run("What are the total sales by product and month?")
    print("\nNew Query:\n", new_query)
