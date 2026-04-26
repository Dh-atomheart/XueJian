use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::{Database, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeQaConversation {
    pub id: String,
    pub title: String,
    pub document_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeQaMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub status: String,
    pub workflow_run_id: Option<String>,
    pub document_ids: Vec<String>,
    pub answer_payload: Option<serde_json::Value>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub struct KnowledgeQaRepository<'a> {
    db: &'a Database,
}

impl<'a> KnowledgeQaRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn list_conversations(&self, limit: Option<i64>) -> Result<Vec<KnowledgeQaConversation>> {
        let limit = limit.unwrap_or(50);
        let mut stmt = self.db.connection().prepare(
            "SELECT id, title, document_ids, created_at, updated_at
             FROM knowledge_qa_conversations
             ORDER BY updated_at DESC
             LIMIT ?1",
        )?;

        let rows = stmt.query_map(params![limit], map_conversation)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn get_conversation(&self, id: &str) -> Result<Option<KnowledgeQaConversation>> {
        self.db
            .connection()
            .query_row(
                "SELECT id, title, document_ids, created_at, updated_at
                 FROM knowledge_qa_conversations
                 WHERE id = ?1",
                params![id],
                map_conversation,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn create_conversation(
        &self,
        title: &str,
        document_ids: &[String],
    ) -> Result<KnowledgeQaConversation> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let title = title.trim();
        let title = if title.is_empty() {
            "Knowledge Q&A".to_string()
        } else {
            title.chars().take(80).collect::<String>()
        };
        let document_ids_json = serde_json::to_string(document_ids)?;

        self.db.connection().execute(
            "INSERT INTO knowledge_qa_conversations (
                id, title, document_ids, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![&id, &title, &document_ids_json, &now, &now],
        )?;

        Ok(KnowledgeQaConversation {
            id,
            title,
            document_ids: document_ids.to_vec(),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn touch_conversation(&self, id: &str) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        self.db.connection().execute(
            "UPDATE knowledge_qa_conversations SET updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        Ok(())
    }

    pub fn list_messages(&self, conversation_id: &str) -> Result<Vec<KnowledgeQaMessage>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, conversation_id, role, content, status, workflow_run_id,
                    document_ids, answer_payload, error_message, created_at, updated_at
             FROM knowledge_qa_messages
             WHERE conversation_id = ?1
             ORDER BY created_at ASC",
        )?;

        let rows = stmt.query_map(params![conversation_id], map_message)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn get_message(&self, id: &str) -> Result<Option<KnowledgeQaMessage>> {
        self.db
            .connection()
            .query_row(
                "SELECT id, conversation_id, role, content, status, workflow_run_id,
                        document_ids, answer_payload, error_message, created_at, updated_at
                 FROM knowledge_qa_messages
                 WHERE id = ?1",
                params![id],
                map_message,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn create_message(
        &self,
        conversation_id: &str,
        role: &str,
        content: &str,
        status: &str,
        workflow_run_id: Option<&str>,
        document_ids: &[String],
    ) -> Result<KnowledgeQaMessage> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let document_ids_json = serde_json::to_string(document_ids)?;

        self.db.connection().execute(
            "INSERT INTO knowledge_qa_messages (
                id, conversation_id, role, content, status, workflow_run_id,
                document_ids, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                &id,
                conversation_id,
                role,
                content,
                status,
                workflow_run_id,
                &document_ids_json,
                &now,
                &now,
            ],
        )?;

        Ok(KnowledgeQaMessage {
            id,
            conversation_id: conversation_id.to_string(),
            role: role.to_string(),
            content: content.to_string(),
            status: status.to_string(),
            workflow_run_id: workflow_run_id.map(str::to_string),
            document_ids: document_ids.to_vec(),
            answer_payload: None,
            error_message: None,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn update_message_result(
        &self,
        id: &str,
        status: &str,
        content: Option<&str>,
        answer_payload: Option<&serde_json::Value>,
        error_message: Option<&str>,
    ) -> Result<Option<KnowledgeQaMessage>> {
        let now = chrono::Utc::now().to_rfc3339();
        let current = self.get_message(id)?;
        let Some(current) = current else {
            return Ok(None);
        };

        let next_content = content
            .map(str::to_string)
            .unwrap_or_else(|| current.content.clone());
        let next_payload = match answer_payload {
            Some(value) => Some(serde_json::to_string(value)?),
            None => current
                .answer_payload
                .map(|value| serde_json::to_string(&value))
                .transpose()?,
        };
        let next_error = error_message.map(str::to_string).or(current.error_message);

        self.db.connection().execute(
            "UPDATE knowledge_qa_messages
             SET status = ?1,
                 content = ?2,
                 answer_payload = ?3,
                 error_message = ?4,
                 updated_at = ?5
             WHERE id = ?6",
            params![status, next_content, next_payload, next_error, &now, id],
        )?;

        self.get_message(id)
    }
}

fn map_conversation(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeQaConversation> {
    let raw_document_ids: String = row.get(2)?;
    Ok(KnowledgeQaConversation {
        id: row.get(0)?,
        title: row.get(1)?,
        document_ids: serde_json::from_str(&raw_document_ids).unwrap_or_default(),
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn map_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeQaMessage> {
    let raw_document_ids: String = row.get(6)?;
    let raw_answer_payload: Option<String> = row.get(7)?;
    Ok(KnowledgeQaMessage {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        role: row.get(2)?,
        content: row.get(3)?,
        status: row.get(4)?,
        workflow_run_id: row.get(5)?,
        document_ids: serde_json::from_str(&raw_document_ids).unwrap_or_default(),
        answer_payload: raw_answer_payload.and_then(|raw| serde_json::from_str(&raw).ok()),
        error_message: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}
