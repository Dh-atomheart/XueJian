from __future__ import annotations

from .graph import build_knowledge_qa_graph
from ..workflows.knowledge_qa_agent import AgentQaRunner


class LangGraphQaRunner:
    def __init__(self, host) -> None:
        self._runner = AgentQaRunner(host)

    def run(
        self,
        run_id: str,
        question: str,
        document_ids: list[str],
        *,
        conversation_id: str | None = None,
    ):
        graph = build_knowledge_qa_graph(self._runner)
        final_state = graph.invoke(
            {
                "run_id": run_id,
                "question": question,
                "document_ids": document_ids,
                "conversation_id": conversation_id,
            }
        )
        return final_state.get("result")