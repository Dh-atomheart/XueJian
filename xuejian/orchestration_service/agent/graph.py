from __future__ import annotations

from .nodes import run_agent_node
from .state import KnowledgeQaGraphState


def build_knowledge_qa_graph(runner):
    try:
        from langgraph.graph import END, START, StateGraph
    except ImportError as exc:
        raise RuntimeError("langgraph not available") from exc

    graph = StateGraph(KnowledgeQaGraphState)
    graph.add_node("run_agent", lambda state: run_agent_node(state, runner))
    graph.add_edge(START, "run_agent")
    graph.add_edge("run_agent", END)
    return graph.compile()