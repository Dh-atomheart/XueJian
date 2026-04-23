use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{Database, Result};

const VALID_RELATIONS: [&str; 8] = [
    "is_a",
    "part_of",
    "depends_on",
    "causes",
    "related_to",
    "similar_to",
    "uses",
    "produces",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeNode {
    pub id: String,
    pub node_type: String,
    pub label: String,
    pub aliases_json: String,
    pub source_ids_json: String,
    pub description: String,
    pub metadata_json: String,
    pub community_id: Option<String>,
    pub parent_community_id: Option<String>,
    pub degree: i64,
    pub has_embedding: bool,
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
    pub inferred: bool,
    pub metadata_json: String,
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
    pub communities_detected: i64,
    pub status: String,
    pub error_message: Option<String>,
    pub current_stage: i64,
    pub incremental: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphStats {
    pub total_nodes: i64,
    pub total_edges: i64,
    pub total_communities: i64,
    pub node_type_distribution: serde_json::Value,
    pub last_build_run: Option<GraphBuildRun>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityEmbeddingRecord {
    pub node_id: String,
    pub embedding_model: String,
    pub vector_json: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityVectorSearchResult {
    pub node_id: String,
    pub label: String,
    pub node_type: String,
    pub description: String,
    pub similarity: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InsertKnowledgeNodeRequest {
    pub id: Option<String>,
    pub node_type: String,
    pub label: String,
    pub aliases_json: String,
    pub source_ids_json: String,
    pub description: String,
    pub metadata_json: String,
    pub community_id: Option<String>,
    pub parent_community_id: Option<String>,
    pub degree: i64,
    pub has_embedding: bool,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct UpdateKnowledgeNodeRequest {
    pub node_type: Option<String>,
    pub label: Option<String>,
    pub aliases_json: Option<String>,
    pub source_ids_json: Option<String>,
    pub description: Option<String>,
    pub metadata_json: Option<String>,
    pub community_id: Option<Option<String>>,
    pub parent_community_id: Option<Option<String>>,
    pub degree: Option<i64>,
    pub has_embedding: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InsertKnowledgeEdgeRequest {
    pub id: Option<String>,
    pub from_node_id: String,
    pub to_node_id: String,
    pub relation: String,
    pub confidence: f64,
    pub source_ids_json: String,
    pub inferred: bool,
    pub metadata_json: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct UpdateKnowledgeEdgeRequest {
    pub from_node_id: Option<String>,
    pub to_node_id: Option<String>,
    pub relation: Option<String>,
    pub confidence: Option<f64>,
    pub source_ids_json: Option<String>,
    pub inferred: Option<bool>,
    pub metadata_json: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InsertGraphBuildRunRequest {
    pub run_id: Option<String>,
    pub scope_description: String,
    pub document_ids_json: String,
    pub incremental: bool,
}

pub struct KnowledgeGraphRepository<'a> {
    db: &'a Database,
}

impl<'a> KnowledgeGraphRepository<'a> {
    pub fn new(db: &'a Database) -> Self {
        Self { db }
    }

    pub fn clear_graph(&self) -> Result<()> {
        self.db
            .connection()
            .execute("DELETE FROM knowledge_edges", [])?;
        self.db
            .connection()
            .execute("DELETE FROM knowledge_nodes", [])?;
        Ok(())
    }

    pub fn insert_node(&self, req: InsertKnowledgeNodeRequest) -> Result<KnowledgeNode> {
        let id = req.id.unwrap_or_else(|| Uuid::new_v4().to_string());
        self.db.connection().execute(
            "INSERT INTO knowledge_nodes (
                id, node_type, label, aliases_json, source_ids_json, description,
                metadata_json, community_id, parent_community_id, degree, has_embedding
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                &id,
                req.node_type,
                req.label,
                req.aliases_json,
                req.source_ids_json,
                req.description,
                req.metadata_json,
                req.community_id,
                req.parent_community_id,
                req.degree,
                i64::from(req.has_embedding),
            ],
        )?;
        self.get_node_by_id(&id)
            .map(|item| item.expect("node inserted"))
    }

    pub fn update_node(
        &self,
        id: &str,
        updates: UpdateKnowledgeNodeRequest,
    ) -> Result<Option<KnowledgeNode>> {
        let Some(current) = self.get_node_by_id(id)? else {
            return Ok(None);
        };

        self.db.connection().execute(
            "UPDATE knowledge_nodes
             SET node_type = ?2,
                 label = ?3,
                 aliases_json = ?4,
                 source_ids_json = ?5,
                 description = ?6,
                 metadata_json = ?7,
                 community_id = ?8,
                 parent_community_id = ?9,
                 degree = ?10,
                 has_embedding = ?11,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            params![
                id,
                updates.node_type.unwrap_or(current.node_type),
                updates.label.unwrap_or(current.label),
                updates.aliases_json.unwrap_or(current.aliases_json),
                updates.source_ids_json.unwrap_or(current.source_ids_json),
                updates.description.unwrap_or(current.description),
                updates.metadata_json.unwrap_or(current.metadata_json),
                updates.community_id.unwrap_or(current.community_id),
                updates
                    .parent_community_id
                    .unwrap_or(current.parent_community_id),
                updates.degree.unwrap_or(current.degree),
                i64::from(updates.has_embedding.unwrap_or(current.has_embedding)),
            ],
        )?;

        self.get_node_by_id(id)
    }

    pub fn get_node_by_id(&self, id: &str) -> Result<Option<KnowledgeNode>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, node_type, label, aliases_json, source_ids_json, description,
                    metadata_json, community_id, parent_community_id, degree,
                    has_embedding, created_at, updated_at
             FROM knowledge_nodes WHERE id = ?1",
        )?;
        stmt.query_row(params![id], map_node_row)
            .optional()
            .map_err(Into::into)
    }

    pub fn find_node_by_label(&self, label: &str) -> Result<Option<KnowledgeNode>> {
        let normalized = label.trim().to_lowercase();
        if normalized.is_empty() {
            return Ok(None);
        }

        let direct = self
            .db
            .connection()
            .query_row(
                "SELECT id, node_type, label, aliases_json, source_ids_json, description,
                    metadata_json, community_id, parent_community_id, degree,
                    has_embedding, created_at, updated_at
             FROM knowledge_nodes WHERE lower(label) = ?1 LIMIT 1",
                params![normalized],
                map_node_row,
            )
            .optional()?;

        if direct.is_some() {
            return Ok(direct);
        }

        for node in self.list_nodes()? {
            let aliases: Vec<String> = serde_json::from_str(&node.aliases_json).unwrap_or_default();
            if aliases
                .iter()
                .any(|alias| alias.trim().eq_ignore_ascii_case(label.trim()))
            {
                return Ok(Some(node));
            }
        }

        Ok(None)
    }

    pub fn list_nodes(&self) -> Result<Vec<KnowledgeNode>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, node_type, label, aliases_json, source_ids_json, description,
                    metadata_json, community_id, parent_community_id, degree,
                    has_embedding, created_at, updated_at
             FROM knowledge_nodes ORDER BY degree DESC, created_at DESC",
        )?;
        let rows = stmt.query_map([], map_node_row)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn merge_node(&self, target_id: &str, source_id: &str) -> Result<()> {
        let Some(target) = self.get_node_by_id(target_id)? else {
            return Ok(());
        };
        let Some(source) = self.get_node_by_id(source_id)? else {
            return Ok(());
        };

        let mut aliases: Vec<String> =
            serde_json::from_str(&target.aliases_json).unwrap_or_default();
        aliases.push(source.label.clone());
        aliases
            .extend(serde_json::from_str::<Vec<String>>(&source.aliases_json).unwrap_or_default());
        aliases.sort();
        aliases.dedup();

        let mut source_ids: Vec<String> =
            serde_json::from_str(&target.source_ids_json).unwrap_or_default();
        source_ids.extend(
            serde_json::from_str::<Vec<String>>(&source.source_ids_json).unwrap_or_default(),
        );
        source_ids.sort();
        source_ids.dedup();

        let merged_description = if target.description.trim().is_empty() {
            source.description
        } else {
            target.description
        };

        self.db.connection().execute(
            "UPDATE knowledge_nodes
             SET aliases_json = ?2,
                 source_ids_json = ?3,
                 description = ?4,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            params![
                target_id,
                serde_json::to_string(&aliases)?,
                serde_json::to_string(&source_ids)?,
                merged_description,
            ],
        )?;

        self.db.connection().execute(
            "UPDATE knowledge_edges SET from_node_id = ?1, updated_at = CURRENT_TIMESTAMP WHERE from_node_id = ?2",
            params![target_id, source_id],
        )?;
        self.db.connection().execute(
            "UPDATE knowledge_edges SET to_node_id = ?1, updated_at = CURRENT_TIMESTAMP WHERE to_node_id = ?2",
            params![target_id, source_id],
        )?;
        self.db.connection().execute(
            "DELETE FROM knowledge_edges WHERE from_node_id = to_node_id",
            [],
        )?;
        self.db.connection().execute(
            "DELETE FROM knowledge_edges WHERE rowid NOT IN (
                SELECT MIN(rowid)
                FROM knowledge_edges
                GROUP BY from_node_id, to_node_id, relation
            )",
            [],
        )?;
        self.db.connection().execute(
            "DELETE FROM knowledge_nodes WHERE id = ?1",
            params![source_id],
        )?;

        self.recompute_node_degrees()
    }

    pub fn delete_node(&self, id: &str) -> Result<()> {
        self.db
            .connection()
            .execute("DELETE FROM knowledge_nodes WHERE id = ?1", params![id])?;
        self.recompute_node_degrees()
    }

    pub fn insert_edge(&self, req: InsertKnowledgeEdgeRequest) -> Result<KnowledgeEdge> {
        if let Some(existing) =
            self.find_edge_by_signature(&req.from_node_id, &req.to_node_id, &req.relation)?
        {
            return Ok(existing);
        }

        let id = req.id.unwrap_or_else(|| Uuid::new_v4().to_string());
        self.db.connection().execute(
            "INSERT INTO knowledge_edges (
                id, from_node_id, to_node_id, relation, confidence,
                source_ids_json, inferred, metadata_json
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                &id,
                req.from_node_id,
                req.to_node_id,
                normalize_relation(&req.relation),
                req.confidence.clamp(0.0, 1.0),
                req.source_ids_json,
                i64::from(req.inferred),
                req.metadata_json,
            ],
        )?;
        self.recompute_node_degrees()?;
        self.get_edge_by_id(&id)
            .map(|item| item.expect("edge inserted"))
    }

    pub fn update_edge(
        &self,
        id: &str,
        updates: UpdateKnowledgeEdgeRequest,
    ) -> Result<Option<KnowledgeEdge>> {
        let Some(current) = self.get_edge_by_id(id)? else {
            return Ok(None);
        };
        let from_node_id = updates.from_node_id.unwrap_or(current.from_node_id);
        let to_node_id = updates.to_node_id.unwrap_or(current.to_node_id);

        self.db.connection().execute(
            "UPDATE knowledge_edges
             SET from_node_id = ?2,
                 to_node_id = ?3,
                 relation = ?4,
                 confidence = ?5,
                 source_ids_json = ?6,
                 inferred = ?7,
                 metadata_json = ?8,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            params![
                id,
                &from_node_id,
                &to_node_id,
                normalize_relation(updates.relation.as_deref().unwrap_or(&current.relation)),
                updates
                    .confidence
                    .unwrap_or(current.confidence)
                    .clamp(0.0, 1.0),
                updates.source_ids_json.unwrap_or(current.source_ids_json),
                i64::from(updates.inferred.unwrap_or(current.inferred)),
                updates.metadata_json.unwrap_or(current.metadata_json),
            ],
        )?;
        self.recompute_node_degrees()?;
        self.get_edge_by_id(id)
    }

    pub fn get_edge_by_id(&self, id: &str) -> Result<Option<KnowledgeEdge>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, from_node_id, to_node_id, relation, confidence,
                    source_ids_json, inferred, metadata_json, created_at, updated_at
             FROM knowledge_edges WHERE id = ?1",
        )?;
        stmt.query_row(params![id], map_edge_row)
            .optional()
            .map_err(Into::into)
    }

    pub fn find_edge_by_signature(
        &self,
        from_node_id: &str,
        to_node_id: &str,
        relation: &str,
    ) -> Result<Option<KnowledgeEdge>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, from_node_id, to_node_id, relation, confidence,
                    source_ids_json, inferred, metadata_json, created_at, updated_at
             FROM knowledge_edges
             WHERE from_node_id = ?1 AND to_node_id = ?2 AND relation = ?3
             LIMIT 1",
        )?;
        stmt.query_row(
            params![from_node_id, to_node_id, normalize_relation(relation)],
            map_edge_row,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_all_edges(&self) -> Result<Vec<KnowledgeEdge>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, from_node_id, to_node_id, relation, confidence,
                    source_ids_json, inferred, metadata_json, created_at, updated_at
             FROM knowledge_edges ORDER BY confidence DESC, created_at DESC",
        )?;
        let rows = stmt.query_map([], map_edge_row)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn list_edges_for_node(&self, node_id: &str) -> Result<Vec<KnowledgeEdge>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, from_node_id, to_node_id, relation, confidence,
                    source_ids_json, inferred, metadata_json, created_at, updated_at
             FROM knowledge_edges
             WHERE from_node_id = ?1 OR to_node_id = ?1
             ORDER BY confidence DESC, created_at DESC",
        )?;
        let rows = stmt.query_map(params![node_id], map_edge_row)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn delete_edge(&self, id: &str) -> Result<()> {
        self.db
            .connection()
            .execute("DELETE FROM knowledge_edges WHERE id = ?1", params![id])?;
        self.recompute_node_degrees()
    }

    pub fn insert_build_run(&self, req: InsertGraphBuildRunRequest) -> Result<GraphBuildRun> {
        let id = Uuid::new_v4().to_string();
        self.db.connection().execute(
            "INSERT INTO graph_build_runs (
                id, run_id, scope_description, document_ids_json, incremental
             ) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                &id,
                req.run_id,
                req.scope_description,
                req.document_ids_json,
                i64::from(req.incremental),
            ],
        )?;
        self.get_build_run_by_id(&id)
            .map(|item| item.expect("build run inserted"))
    }

    pub fn get_build_run_by_id(&self, id: &str) -> Result<Option<GraphBuildRun>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, run_id, scope_description, document_ids_json, nodes_created,
                    edges_created, nodes_merged, communities_detected, status,
                    error_message, current_stage, incremental, created_at, updated_at
             FROM graph_build_runs WHERE id = ?1",
        )?;
        stmt.query_row(params![id], map_build_run_row)
            .optional()
            .map_err(Into::into)
    }

    pub fn list_build_runs(&self) -> Result<Vec<GraphBuildRun>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, run_id, scope_description, document_ids_json, nodes_created,
                    edges_created, nodes_merged, communities_detected, status,
                    error_message, current_stage, incremental, created_at, updated_at
             FROM graph_build_runs ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], map_build_run_row)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn set_build_running(&self, id: &str) -> Result<()> {
        self.db.connection().execute(
            "UPDATE graph_build_runs
             SET status = 'running', current_stage = 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn update_build_stage(&self, id: &str, current_stage: i64) -> Result<()> {
        self.db.connection().execute(
            "UPDATE graph_build_runs
             SET current_stage = ?2, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            params![id, current_stage],
        )?;
        Ok(())
    }

    pub fn set_build_completed(
        &self,
        id: &str,
        nodes_created: i64,
        edges_created: i64,
        nodes_merged: i64,
        communities_detected: i64,
    ) -> Result<()> {
        self.db.connection().execute(
            "UPDATE graph_build_runs
             SET status = 'completed',
                 nodes_created = ?2,
                 edges_created = ?3,
                 nodes_merged = ?4,
                 communities_detected = ?5,
                 current_stage = 5,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            params![
                id,
                nodes_created,
                edges_created,
                nodes_merged,
                communities_detected
            ],
        )?;
        Ok(())
    }

    pub fn set_build_failed(&self, id: &str, error: &str) -> Result<()> {
        self.db.connection().execute(
            "UPDATE graph_build_runs
             SET status = 'failed', error_message = ?2, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            params![id, error],
        )?;
        Ok(())
    }

    pub fn set_build_cancelled(&self, id: &str) -> Result<()> {
        self.db.connection().execute(
            "UPDATE graph_build_runs
             SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn get_graph_stats(&self) -> Result<GraphStats> {
        let total_nodes =
            self.db
                .connection()
                .query_row("SELECT COUNT(*) FROM knowledge_nodes", [], |row| row.get(0))?;
        let total_edges =
            self.db
                .connection()
                .query_row("SELECT COUNT(*) FROM knowledge_edges", [], |row| row.get(0))?;
        let total_communities = self.db.connection().query_row(
            "SELECT COUNT(*) FROM knowledge_communities",
            [],
            |row| row.get(0),
        )?;

        let mut distribution = serde_json::Map::new();
        for node_type in ["concept", "person", "event", "formula", "term"] {
            let count: i64 = self.db.connection().query_row(
                "SELECT COUNT(*) FROM knowledge_nodes WHERE node_type = ?1",
                params![node_type],
                |row| row.get(0),
            )?;
            distribution.insert(node_type.to_string(), serde_json::json!(count));
        }

        Ok(GraphStats {
            total_nodes,
            total_edges,
            total_communities,
            node_type_distribution: serde_json::Value::Object(distribution),
            last_build_run: self.list_build_runs()?.into_iter().next(),
        })
    }

    pub fn save_entity_embedding(
        &self,
        node_id: &str,
        embedding_model: &str,
        vector: &[f32],
    ) -> Result<()> {
        let vector_json = serde_json::to_string(vector)?;
        self.db.connection().execute(
            "INSERT INTO entity_embeddings (node_id, embedding_model, vector_json, updated_at)
             VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
             ON CONFLICT(node_id) DO UPDATE SET
                 embedding_model = excluded.embedding_model,
                 vector_json = excluded.vector_json,
                 updated_at = excluded.updated_at",
            params![node_id, embedding_model, vector_json],
        )?;
        self.db.connection().execute(
            "UPDATE knowledge_nodes SET has_embedding = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![node_id],
        )?;
        Ok(())
    }

    pub fn get_entity_embedding(&self, node_id: &str) -> Result<Option<EntityEmbeddingRecord>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT node_id, embedding_model, vector_json, updated_at
             FROM entity_embeddings WHERE node_id = ?1",
        )?;
        stmt.query_row(params![node_id], |row| {
            Ok(EntityEmbeddingRecord {
                node_id: row.get(0)?,
                embedding_model: row.get(1)?,
                vector_json: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .optional()
        .map_err(Into::into)
    }

    pub fn vector_search_entity(
        &self,
        query_vector: &[f32],
        top_k: usize,
    ) -> Result<Vec<EntityVectorSearchResult>> {
        if query_vector.is_empty() || top_k == 0 {
            return Ok(Vec::new());
        }

        let mut stmt = self.db.connection().prepare(
            "SELECT e.node_id, n.label, n.node_type, n.description, e.vector_json
             FROM entity_embeddings e
             JOIN knowledge_nodes n ON n.id = e.node_id",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })?;

        let mut scored = rows
            .collect::<std::result::Result<Vec<_>, _>>()?
            .into_iter()
            .filter_map(|(node_id, label, node_type, description, vector_json)| {
                let vector = serde_json::from_str::<Vec<f32>>(&vector_json).ok()?;
                let similarity = cosine_similarity(query_vector, &vector)?;
                Some(EntityVectorSearchResult {
                    node_id,
                    label,
                    node_type,
                    description,
                    similarity,
                })
            })
            .collect::<Vec<_>>();

        scored.sort_by(|left, right| {
            right
                .similarity
                .partial_cmp(&left.similarity)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        scored.truncate(top_k);
        Ok(scored)
    }

    pub fn recompute_node_degrees(&self) -> Result<()> {
        self.db.connection().execute(
            "UPDATE knowledge_nodes
             SET degree = (
                 SELECT COUNT(*)
                 FROM knowledge_edges e
                 WHERE e.from_node_id = knowledge_nodes.id OR e.to_node_id = knowledge_nodes.id
             )",
            [],
        )?;
        Ok(())
    }
}

fn map_node_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeNode> {
    Ok(KnowledgeNode {
        id: row.get(0)?,
        node_type: row.get(1)?,
        label: row.get(2)?,
        aliases_json: row.get(3)?,
        source_ids_json: row.get(4)?,
        description: row.get(5)?,
        metadata_json: row.get(6)?,
        community_id: row.get(7)?,
        parent_community_id: row.get(8)?,
        degree: row.get(9)?,
        has_embedding: row.get::<_, i64>(10)? != 0,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn map_edge_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeEdge> {
    Ok(KnowledgeEdge {
        id: row.get(0)?,
        from_node_id: row.get(1)?,
        to_node_id: row.get(2)?,
        relation: row.get(3)?,
        confidence: row.get(4)?,
        source_ids_json: row.get(5)?,
        inferred: row.get::<_, i64>(6)? != 0,
        metadata_json: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn map_build_run_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<GraphBuildRun> {
    Ok(GraphBuildRun {
        id: row.get(0)?,
        run_id: row.get(1)?,
        scope_description: row.get(2)?,
        document_ids_json: row.get(3)?,
        nodes_created: row.get(4)?,
        edges_created: row.get(5)?,
        nodes_merged: row.get(6)?,
        communities_detected: row.get(7)?,
        status: row.get(8)?,
        error_message: row.get(9)?,
        current_stage: row.get(10)?,
        incremental: row.get::<_, i64>(11)? != 0,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

fn normalize_relation(value: &str) -> String {
    let normalized = value.trim().to_lowercase();
    if VALID_RELATIONS.contains(&normalized.as_str()) {
        return normalized;
    }
    if normalized.contains("type") || normalized.contains("kind") || normalized.contains("subclass")
    {
        return "is_a".to_string();
    }
    if normalized.contains("component")
        || normalized.contains("contain")
        || normalized.contains("part")
    {
        return "part_of".to_string();
    }
    if normalized.contains("require")
        || normalized.contains("need")
        || normalized.contains("prerequisite")
    {
        return "depends_on".to_string();
    }
    if normalized.contains("cause")
        || normalized.contains("lead")
        || normalized.contains("result")
        || normalized.contains("enable")
    {
        return "causes".to_string();
    }
    if normalized.contains("use") || normalized.contains("apply") || normalized.contains("utilize")
    {
        return "uses".to_string();
    }
    if normalized.contains("produce")
        || normalized.contains("generate")
        || normalized.contains("create")
        || normalized.contains("output")
    {
        return "produces".to_string();
    }
    if normalized.contains("similar")
        || normalized.contains("analogous")
        || normalized.contains("equivalent")
    {
        return "similar_to".to_string();
    }
    "related_to".to_string()
}

fn cosine_similarity(left: &[f32], right: &[f32]) -> Option<f64> {
    if left.len() != right.len() || left.is_empty() {
        return None;
    }

    let mut dot = 0.0f64;
    let mut left_norm = 0.0f64;
    let mut right_norm = 0.0f64;
    for (left_value, right_value) in left.iter().zip(right.iter()) {
        let left_value = *left_value as f64;
        let right_value = *right_value as f64;
        dot += left_value * right_value;
        left_norm += left_value * left_value;
        right_norm += right_value * right_value;
    }

    let denominator = left_norm.sqrt() * right_norm.sqrt();
    if denominator == 0.0 {
        return None;
    }
    Some(dot / denominator)
}
