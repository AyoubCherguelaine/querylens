"""Compatibility entrypoint for deterministic cube extraction."""

from backend.services.catalog import build_cube


class OLAPCubeExtractor:
    def run(self, schema: dict):
        return [
            build_cube(
                table.get("schema", "public"),
                table["name"],
                [
                    {
                        "name": c["name"],
                        "type": c["type"],
                        "nullable": c.get("nullable", True),
                        "key": c.get("is_primary", False) or c.get("is_foreign", False),
                    }
                    for c in table["columns"]
                ],
            )
            for table in schema["tables"]
        ]
