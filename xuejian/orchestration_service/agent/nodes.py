from __future__ import annotations

from typing import TYPE_CHECKING

from .state import KnowledgeQaGraphState

if TYPE_CHECKING:
    from ..workflows.knowledge_qa_agent import AgentQaRunner


def run_agent_node(state: KnowledgeQaGraphState, runner: AgentQaRunner) -> KnowledgeQaGraphState:
    result = runner.run(
        state["run_id"],
        state["question"],
        state["document_ids"],
        conversation_id=state.get("conversation_id"),
    )
    return {"result": result}