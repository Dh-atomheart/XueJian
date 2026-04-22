use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::{Database, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Community {
    pub id: String,
    pub level: i32,
    pub title: String,
    pub member_node_ids_json: String,
    pub parent_community_id: Option<String>,
    pub summary_json: Option<String>,
    pub node_count: i64,
    pub edge_count: i64,
    pub collapsed: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewCommunity {
    pub id: Option<String>,
    pub level: i32,
    pub title: String,
    pub member_node_ids_json: String,
    pub parent_community_id: Option<String>,
    pub summary_json: Option<String>,
    pub node_count: i64,
    pub edge_count: i64,
    pub collapsed: bool,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct CommunityUpdates {
    pub title: Option<String>,
    pub member_node_ids_json: Option<String>,
    pub parent_community_id: Option<Option<String>>,
    pub summary_json: Option<Option<String>>,
    pub node_count: Option<i64>,
    pub edge_count: Option<i64>,
    pub collapsed: Option<bool>,
}

pub struct CommunityRepository<'a> {
    db: &'a Database,
}

impl<'a> CommunityRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn create_community(&self, community: NewCommunity) -> Result<Community> {
        let id = community
            .id
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        self.db.connection().execute(
            "INSERT INTO knowledge_communities (
                id, level, title, member_node_ids_json, parent_community_id,
                summary_json, node_count, edge_count, collapsed
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                &id,
                community.level,
                community.title,
                community.member_node_ids_json,
                community.parent_community_id,
                community.summary_json,
                community.node_count,
                community.edge_count,
                i64::from(community.collapsed),
            ],
        )?;
        self.get_community(&id).map(|item| item.expect("community inserted"))
    }

    pub fn get_community(&self, id: &str) -> Result<Option<Community>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, level, title, member_node_ids_json, parent_community_id,
                    summary_json, node_count, edge_count, collapsed, created_at, updated_at
             FROM knowledge_communities WHERE id = ?1",
        )?;
        stmt.query_row(params![id], map_community_row)
            .optional()
            .map_err(Into::into)
    }

    pub fn list_communities(&self, level: Option<i32>) -> Result<Vec<Community>> {
        let sql = if level.is_some() {
            "SELECT id, level, title, member_node_ids_json, parent_community_id,
                    summary_json, node_count, edge_count, collapsed, created_at, updated_at
             FROM knowledge_communities WHERE level = ?1 ORDER BY level, title"
        } else {
            "SELECT id, level, title, member_node_ids_json, parent_community_id,
                    summary_json, node_count, edge_count, collapsed, created_at, updated_at
             FROM knowledge_communities ORDER BY level, title"
        };
        let mut stmt = self.db.connection().prepare(sql)?;
        let rows = if let Some(level) = level {
            stmt.query_map(params![level], map_community_row)?
        } else {
            stmt.query_map([], map_community_row)?
        };
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn update_community(&self, id: &str, updates: &CommunityUpdates) -> Result<Option<Community>> {
        let Some(current) = self.get_community(id)? else {
            return Ok(None);
        };

        self.db.connection().execute(
            "UPDATE knowledge_communities
             SET title = ?2,
                 member_node_ids_json = ?3,
                 parent_community_id = ?4,
                 summary_json = ?5,
                 node_count = ?6,
                 edge_count = ?7,
                 collapsed = ?8,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            params![
                id,
                updates.title.clone().unwrap_or(current.title),
                updates
                    .member_node_ids_json
                    .clone()
                    .unwrap_or(current.member_node_ids_json),
                updates
                    .parent_community_id
                    .clone()
                    .unwrap_or(current.parent_community_id),
                updates
                    .summary_json
                    .clone()
                    .unwrap_or(current.summary_json),
                updates.node_count.unwrap_or(current.node_count),
                updates.edge_count.unwrap_or(current.edge_count),
                i64::from(updates.collapsed.unwrap_or(current.collapsed)),
            ],
        )?;

        self.get_community(id)
    }

    pub fn delete_community(&self, id: &str) -> Result<()> {
        self.db.connection().execute(
            "DELETE FROM knowledge_communities WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn clear_communities(&self) -> Result<()> {
        self.db.connection().execute("DELETE FROM knowledge_communities", [])?;
        Ok(())
    }

    pub fn get_community_summary(&self, id: &str) -> Result<Option<String>> {
        Ok(self
            .get_community(id)?
            .and_then(|community| community.summary_json))
    }
}

fn map_community_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Community> {
    Ok(Community {
        id: row.get(0)?,
        level: row.get(1)?,
        title: row.get(2)?,
        member_node_ids_json: row.get(3)?,
        parent_community_id: row.get(4)?,
        summary_json: row.get(5)?,
        node_count: row.get(6)?,
        edge_count: row.get(7)?,
        collapsed: row.get::<_, i64>(8)? != 0,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}