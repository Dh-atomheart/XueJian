"""Base graph builder — shared utilities for all LangGraph graphs in the orchestration service."""
from __future__ import annotations

from typing import Any

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph


class BaseGraphBuilder:
    """Base class for graph builders, providing common patterns.

    Subclasses override:
      - state_class: the TypedDict for graph state
      - _add_nodes(): register nodes on the graph
      - _add_edges(): wire nodes with edges and conditional edges
    """

    state_class: type = None  # type: ignore[assignment]

    def __init__(self, *, checkpointer: MemorySaver | None = None) -> None:
        self._checkpointer = checkpointer

    def build(self) -> Any:
        """Build and compile the graph."""
        graph = StateGraph(self.state_class)
        self._add_nodes(graph)
        self._add_edges(graph)
        return graph.compile(checkpointer=self._checkpointer)

    def _add_nodes(self, graph: StateGraph) -> None:  # type: ignore[override]
        raise NotImplementedError

    def _add_edges(self, graph: StateGraph) -> None:  # type: ignore[override]
        raise NotImplementedError
