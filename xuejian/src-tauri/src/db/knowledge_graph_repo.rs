use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{Database, Result};

// ───── Row types ─────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeNode {
    pub id: String,
    pub node_type: String,
    pub label: String,
    pub aliases_json: String,
    pub source_ids_json: String,
    pub metadata_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEdge {
    pub id: String,
    pub from_node_id: String,
    pub to_node_id: String,
    pub relation: String,
    pub confidence: f64,
    pub source_ids_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphBuildRun {
    pub id: String,
    pub run_id: Option<String>,
    pub scope_description: String,
    pub document_ids_json: String,
    pub nodes_created: i64,
    pub edges_created: i64,
    pub nodes_merged: i64,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ───── Request DTOs ─────

#[derive(Debug, Deserialize)]
pub struct InsertKnowledgeNodeRequest {
    pub node_type: String,
    pub label: String,
    pub aliases_json: String,
    pub source_ids_json: String,
    pub metadata_json: String,
}

#[derive(Debug, Deserialize)]
pub struct InsertKnowledgeEdgeRequest {
    pub from_node_id: String,
    pub to_node_id: String,
    pub relation: String,
    pub confidence: f64,
    pub source_ids_json: String,
}

#[derive(Debug, Deserialize)]
pub struct InsertGraphBuildRunRequest {
    pub run_id: Option<String>,
    pub scope_description: String,
    pub document_ids_json: String,
}

// ───── Repository ─────

pub struct KnowledgeGraphRepository<'a> {
    db: &'a Database,
}

impl<'a> KnowledgeGraphRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    // ── Nodes ──

    pub fn insert_node(&self, req: InsertKnowledgeNodeRequest) -> Result<KnowledgeNode> {
        let id = Uuid::new_v4().to_string();
        self.db.connection().execute(
            "INSERT INTO knowledge_nodes (id, node_type, label, aliases_json, source_ids_json, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, req.node_type, req.label, req.aliases_json, req.source_ids_json, req.metadata_json],
        )?;
        self.get_node_by_id(&id).map(|opt| opt.expect("just inserted"))
    }

    pub fn get_node_by_id(&self, id: &str) -> Result<Option<KnowledgeNode>> {
        let conn = self.db.connection();
        let mut stmt = conn.prepare(
            "SELECT id, node_type, label, aliases_json, source_ids_json, metadata_json, created_at, updated_at FROM knowledge_nodes WHERE id = ?1",
        )?;
        let row = stmt
            .query_row(params![id], |r| {
                Ok(KnowledgeNode {
                    id: r.get(0)?,
                    node_type: r.get(1)?,
                    label: r.get(2)?,
                    aliases_json: r.get(3)?,
                    source_ids_json: r.get(4)?,
                    metadata_json: r.get(5)?,
                    created_at: r.get(6)?,
                    updated_at: r.get(7)?,
                })
            })
            .optional()?;
        Ok(row)
    }

    pub fn list_nodes(&self) -> Result<Vec<KnowledgeNode>> {
        let conn = self.db.connection();
        let mut stmt = conn.prepare(
            "SELECT id, node_type, label, aliases_json, source_ids_json, metadata_json, created_at, updated_at FROM knowledge_nodes ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(KnowledgeNode {
                id: r.get(0)?,
                node_type: r.get(1)?,
                label: r.get(2)?,
                aliases_json: r.get(3)?,
                source_ids_json: r.get(4)?,
                metadata_json: r.get(5)?,
                created_at: r.get(6)?,
                updated_at: r.get(7)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn merge_node(&self, target_id: &str, source_id: &str) -> Result<()> {
        let conn = self.db.connection();
        // Re-point edges from source to target
        conn.execute(
            "UPDATE knowledge_edges SET from_node_id = ?1, updated_at = CURRENT_TIMESTAMP WHERE from_node_id = ?2",
            params![target_id, source_id],
        )?;
        conn.execute(
            "UPDATE knowledge_edges SET to_node_id = ?1, updated_at = CURRENT_TIMESTAMP WHERE to_node_id = ?2",
            params![target_id, source_id],
        )?;
        // Merge aliases: append source aliases + label to target
        if let Some(source) = self.get_node_by_id(source_id)? {
            if let Some(target) = self.get_node_by_id(target_id)? {
                let mut target_aliases: Vec<String> =
                    serde_json::from_str(&target.aliases_json).unwrap_or_default();
                let source_aliases: Vec<String> =
                    serde_json::from_str(&source.aliases_json).unwrap_or_default();
                target_aliases.push(source.label);
                target_aliases.extend(source_aliases);
                target_aliases.sort();
                target_aliases.dedup();
                let merged = serde_json::to_string(&target_aliases)?;
                // Merge source_ids
                let mut target_src: Vec<String> =
                    serde_json::from_str(&target.source_ids_json).unwrap_or_default();
                let source_src: Vec<String> =
                    serde_json::from_str(&source.source_ids_json).unwrap_or_default();
                target_src.extend(source_src);
                target_src.sort();
                target_src.dedup();
                let merged_src = serde_json::to_string(&target_src)?;
                conn.execute(
                    "UPDATE knowledge_nodes SET aliases_json = ?1, source_ids_json = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
                    params![merged, merged_src, target_id],
                )?;
            }
        }
        // Delete duplicate edges (same from/to after merge)
        conn.execute(
            "DELETE FROM knowledge_edges WHERE rowid NOT IN (SELECT MIN(rowid) FROM knowledge_edges GROUP BY from_node_id, to_node_id, relation)",
            [],
        )?;
        // Delete self-loops
        conn.execute(
            "DELETE FROM knowledge_edges WHERE from_node_id = to_node_id",
            [],
        )?;
        // Delete source node
        conn.execute("DELETE FROM knowledge_nodes WHERE id = ?1", params![source_id])?;
        Ok(())
    }

    pub fn delete_node(&self, id: &str) -> Result<()> {
        self.db
            .connection()
            .execute("DELETE FROM knowledge_nodes WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ── Edges ──

    pub fn insert_edge(&self, req: InsertKnowledgeEdgeRequest) -> Result<KnowledgeEdge> {
        let id = Uuid::new_v4().to_string();
        self.db.connection().execute(
            "INSERT INTO knowledge_edges (id, from_node_id, to_node_id, relation, confidence, source_ids_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, req.from_node_id, req.to_node_id, req.relation, req.confidence, req.source_ids_json],
        )?;
        self.get_edge_by_id(&id).map(|opt| opt.expect("just inserted"))
    }

    pub fn get_edge_by_id(&self, id: &str) -> Result<Option<KnowledgeEdge>> {
        let conn = self.db.connection();
        let mut stmt = conn.prepare(
            "SELECT id, from_node_id, to_node_id, relation, confidence, source_ids_json, created_at, updated_at FROM knowledge_edges WHERE id = ?1",
        )?;
        let row = stmt
            .query_row(params![id], |r| {
                Ok(KnowledgeEdge {
                    id: r.get(0)?,
                    from_node_id: r.get(1)?,
                    to_node_id: r.get(2)?,
                    relation: r.get(3)?,
                    confidence: r.get(4)?,
                    source_ids_json: r.get(5)?,
                    created_at: r.get(6)?,
                    updated_at: r.get(7)?,
                })
            })
            .optional()?;
        Ok(row)
    }

    pub fn list_edges_for_node(&self, node_id: &str) -> Result<Vec<KnowledgeEdge>> {
        let conn = self.db.connection();
        let mut stmt = conn.prepare(
            "SELECT id, from_node_id, to_node_id, relation, confidence, source_ids_json, created_at, updated_at FROM knowledge_edges WHERE from_node_id = ?1 OR to_node_id = ?1 ORDER BY confidence DESC",
        )?;
        let rows = stmt.query_map(params![node_id], |r| {
            Ok(KnowledgeEdge {
                id: r.get(0)?,
                from_node_id: r.get(1)?,
                to_node_id: r.get(2)?,
                relation: r.get(3)?,
                confidence: r.get(4)?,
                source_ids_json: r.get(5)?,
                created_at: r.get(6)?,
                updated_at: r.get(7)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn delete_edge(&self, id: &str) -> Result<()> {
        self.db
            .connection()
            .execute("DELETE FROM knowledge_edges WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ── Build Runs ──

    pub fn insert_build_run(&self, req: InsertGraphBuildRunRequest) -> Result<GraphBuildRun> {
        let id = Uuid::new_v4().to_string();
        self.db.connection().execute(
            "INSERT INTO graph_build_runs (id, run_id, scope_description, document_ids_json) VALUES (?1, ?2, ?3, ?4)",
            params![id, req.run_id, req.scope_description, req.document_ids_json],
        )?;
        self.get_build_run_by_id(&id)
            .map(|opt| opt.expect("just inserted"))
    }

    pub fn get_build_run_by_id(&self, id: &str) -> Result<Option<GraphBuildRun>> {
        let conn = self.db.connection();
        let mut stmt = conn.prepare(
            "SELECT id, run_id, scope_description, document_ids_json, nodes_created, edges_created, nodes_merged, status, error_message, created_at, updated_at FROM graph_build_runs WHERE id = ?1",
        )?;
        let row = stmt
            .query_row(params![id], |r| {
                Ok(GraphBuildRun {
                    id: r.get(0)?,
                    run_id: r.get(1)?,
                    scope_description: r.get(2)?,
                    document_ids_json: r.get(3)?,
                    nodes_created: r.get(4)?,
                    edges_created: r.get(5)?,
                    nodes_merged: r.get(6)?,
                    status: r.get(7)?,
                    error_message: r.get(8)?,
                    created_at: r.get(9)?,
                    updated_at: r.get(10)?,
                })
            })
            .optional()?;
        Ok(row)
    }

    pub fn list_build_runs(&self) -> Result<Vec<GraphBuildRun>> {
        let conn = self.db.connection();
        let mut stmt = conn.prepare(
            "SELECT id, run_id, scope_description, document_ids_json, nodes_created, edges_created, nodes_merged, status, error_message, created_at, updated_at FROM graph_build_runs ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(GraphBuildRun {
                id: r.get(0)?,
                run_id: r.get(1)?,
                scope_description: r.get(2)?,
                document_ids_json: r.get(3)?,
                nodes_created: r.get(4)?,
                edges_created: r.get(5)?,
                nodes_merged: r.get(6)?,
                status: r.get(7)?,
                error_message: r.get(8)?,
                created_at: r.get(9)?,
                updated_at: r.get(10)?,
            })
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn set_build_running(&self, id: &str) -> Result<()> {
        self.db.connection().execute(
            "UPDATE graph_build_runs SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn set_build_completed(
        &self,
        id: &str,
        nodes_created: i64,
        edges_created: i64,
        nodes_merged: i64,
    ) -> Result<()> {
        self.db.connection().execute(
            "UPDATE graph_build_runs SET status = 'completed', nodes_created = ?2, edges_created = ?3, nodes_merged = ?4, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![id, nodes_created, edges_created, nodes_merged],
        )?;
        Ok(())
    }

    pub fn set_build_failed(&self, id: &str, error: &str) -> Result<()> {
        self.db.connection().execute(
            "UPDATE graph_build_runs SET status = 'failed', error_message = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![id, error],
        )?;
        Ok(())
    }

    pub fn delete_build_run(&self, id: &str) -> Result<()> {
        self.db
            .connection()
            .execute("DELETE FROM graph_build_runs WHERE id = ?1", params![id])?;
        Ok(())
    }
}
