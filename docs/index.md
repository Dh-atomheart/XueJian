# XueJian Documentation Index

This is the active documentation entry point for the repository. Documents in `docs/archive/` are historical references only and should not drive current implementation decisions.

## Start Here

Recommended reading order for new development:

```text
spec.md -> architecture.md -> mvps/README.md -> current phase or milestone
```

For the current RAG and LangGraph work, start with:

- [RAG LangChain / LangGraph refactor](./rag/rag-langchain-langgraph-refactor.md)
- [Phase 10: Supervisor v2 and long-running tasks](./phases/phase-10-supervisor-v2-long-running-tasks.md)
- [Phase 13 runtime hardening](./phases/phase-13-runtime-hardening.md)
- [Phase 13 runtime hardening plan](./phases/phase-13-runtime-hardening-plan.md)
- [Evaluation cases](./evals/README.md)

## Current Authority

- [Product and project scope](./spec.md)
- [Architecture](./architecture.md)
- [UI implementation guidance](./ui.md)
- [Reuse strategy](./reuse-strategy.md)
- [IPC API](./ipc-api.md)
- [Database baseline](./database-baseline.md)
- [Background jobs](./background-jobs.md)
- [Review scheduler](./review-scheduler.md)
- [AI card generation](./ai-card-generation.md)
- [Multi-agent development guide](./multi-agent-development-guide.md)

When documents conflict:

- Product scope and roadmap: `spec.md`
- System boundaries and data authority: `architecture.md`
- UI direction: `ui.md`
- Tauri command and gateway contracts: `ipc-api.md`
- RAG / graph refactor: `docs/rag/rag-langchain-langgraph-refactor.md`

## Modules

- [AI module](./modules/ai.md)
- [Cards module](./modules/cards.md)
- [Documents module](./modules/documents.md)
- [Study module](./modules/study.md)

## MVPs and Milestones

- [MVP index](./mvps/README.md)
- [Milestone index](./milestones/README.md)
- [Phase index](./phases/README.md)

## RAG Legacy Planning

Older RAG planning documents were moved out of the docs root to reduce clutter. They are useful background, but the active refactor document above takes priority.

- [Legacy RAG docs](./rag/legacy/)

## Audits and Evaluations

- [Audit reports](./audit/)
- [Evaluation docs](./evals/)
- [Unused code cleanup candidates](./unused-code-delete-list.md)

## Archives

- [Historical docs](./archive/)
- [Archived XueJian upgrade docs](./archive/xuejian-upgrade-docs/)
