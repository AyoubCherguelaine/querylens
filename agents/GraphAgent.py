"""Graph Agent: Coordinator for graph and chart generation with downloadable data sources."""

from backend.services.graph_agent import create_graph


class GraphAgent:
    """Agent interface for building charts with query evidence and packaged data sources."""

    def __init__(self, spec=None):
        self.spec = spec

    def build_chart(self, arguments: dict, evidence: dict) -> dict:
        return create_graph(arguments, evidence)

