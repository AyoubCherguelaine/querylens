"""Base dataset definition and abstraction for evaluation scenarios."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List

from backend.services.semantic import model_schema


class BaseDataset(ABC):
    """Abstract dataset containing schemas, tables, constraints, seed data, and semantic cubes."""

    name: str = "base"
    schema_name: str = "eval_base"
    description: str = ""

    def __init__(self):
        self._cubes = None

    @abstractmethod
    def get_table_columns(self) -> Dict[tuple[str, str], List[Dict[str, Any]]]:
        """Return mapping of (schema, table) -> list of column dicts."""
        pass

    @abstractmethod
    def get_constraints(self) -> List[Dict[str, Any]]:
        """Return list of constraint dicts for foreign/primary keys."""
        pass

    @abstractmethod
    def get_ddl_statements(self) -> List[str]:
        """Return DDL SQL statements to create schemas and tables."""
        pass

    @abstractmethod
    def get_seed_statements(self) -> List[str]:
        """Return INSERT statements to populate test data."""
        pass

    def get_definitions(self) -> List[Dict[str, Any]]:
        """Return semantic cube definitions generated via model_schema."""
        if self._cubes is None:
            constraints = [{"validated": True, **c} for c in self.get_constraints()]
            self._cubes = model_schema(self.get_table_columns(), constraints)
        return self._cubes

    def get_cube(self, table_name: str) -> Dict[str, Any]:
        """Get the specific cube definition for a table."""
        definitions = self.get_definitions()
        for d in definitions:
            if d.get("table") == table_name and d.get("schema") == self.schema_name:
                return d
        raise ValueError(f"Cube '{self.schema_name}.{table_name}' not found in dataset '{self.name}'.")
