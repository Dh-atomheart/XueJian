-- V23: Persist Knowledge Q&A conversations and messages.

CREATE TABLE IF NOT EXISTS knowledge_qa_conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    document_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_qa_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('pending', 'answered', 'error', 'cancelled')),
    workflow_run_id TEXT,
    document_ids TEXT NOT NULL DEFAULT '[]',
    answer_payload TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES knowledge_qa_conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_qa_messages_conversation
    ON knowledge_qa_messages(conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_knowledge_qa_messages_workflow_run
    ON knowledge_qa_messages(workflow_run_id);
