use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        AppendWorkflowEventRequest, CreateWorkflowRunRequest, GraphBuildRun, InsertGraphBuildRunRequest,
        InsertKnowledgeEdgeRequest, InsertKnowledgeNodeRequest, KnowledgeEdge, KnowledgeGraphRepository,
        KnowledgeNode, UpdateWorkflowRunRequest, WorkflowRepository,
    },
};

const GRAPH_PRESET_ID: &str = "v4-1-knowledge-graph";

// ───── DTOs ─────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeNodeDto {
    pub id: String,
    pub node_type: String,
    pub label: String,
    pub aliases: Vec<String>,
    pub source_ids: Vec<String>,
    pub metadata: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

impl From<KnowledgeNode> for KnowledgeNodeDto {
    fn from(n: KnowledgeNode) -> Self {
        Self {
            id: n.id,
            node_type: n.node_type,
            label: n.label,
            aliases: serde_json::from_str(&n.aliases_json).unwrap_or_default(),
            source_ids: serde_json::from_str(&n.source_ids_json).unwrap_or_default(),
            metadata: serde_json::from_str(&n.metadata_json).unwrap_or(serde_json::json!({})),
            created_at: n.created_at,
            updated_at: n.updated_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEdgeDto {
    pub id: String,
    pub from_node_id: String,
    pub to_node_id: String,
    pub relation: String,
    pub confidence: f64,
    pub source_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<KnowledgeEdge> for KnowledgeEdgeDto {
    fn from(e: KnowledgeEdge) -> Self {
        Self {
            id: e.id,
            from_node_id: e.from_node_id,
            to_node_id: e.to_node_id,
            relation: e.relation,
            confidence: e.confidence,
            source_ids: serde_json::from_str(&e.source_ids_json).unwrap_or_default(),
            created_at: e.created_at,
            updated_at: e.updated_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphBuildRunDto {
    pub id: String,
    pub run_id: Option<String>,
    pub scope_description: String,
    pub document_ids: Vec<String>,
    pub nodes_created: i64,
    pub edges_created: i64,
    pub nodes_merged: i64,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<GraphBuildRun> for GraphBuildRunDto {
    fn from(r: GraphBuildRun) -> Self {
        Self {
            id: r.id,
            run_id: r.run_id,
            scope_description: r.scope_description,
            document_ids: serde_json::from_str(&r.document_ids_json).unwrap_or_default(),
            nodes_created: r.nodes_created,
            edges_created: r.edges_created,
            nodes_merged: r.nodes_merged,
            status: r.status,
            error_message: r.error_message,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartGraphBuildDto {
    pub document_ids: Vec<String>,
    pub scope_description: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeNodesDto {
    pub target_node_id: String,
    pub source_node_id: String,
}

// ───── Commands ─────

/// Start a knowledge graph build from the specified documents.
#[tauri::command]
pub fn start_graph_build_workflow(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    data: StartGraphBuildDto,
) -> CommandResult<GraphBuildRunDto> {
    if data.document_ids.is_empty() {
        return Err(CommandError::InvalidInput(
            "At least one document_id is required".to_string(),
        ));
    }

    let build_run = {
        let db = state.lock_db()?;
        let graph_repo = KnowledgeGraphRepository::new(&db);
        let workflow_repo = WorkflowRepository::new(&db);

        let scope = data
            .scope_description
            .unwrap_or_else(|| format!("{} document(s)", data.document_ids.len()));

        let run = workflow_repo.create_run(CreateWorkflowRunRequest {
            workflow_type: "knowledge_graph".to_string(),
            preset_id: Some(GRAPH_PRESET_ID.to_string()),
            status: "queued".to_string(),
            thread_id: format!("graph-build:{}", data.document_ids.join(",")),
            started_at: None,
        })?;

        workflow_repo.append_event(AppendWorkflowEventRequest {
            run_id: run.id.clone(),
            event_type: "queued".to_string(),
            message: Some(format!("Queued graph build for {} document(s)", data.document_ids.len())),
            progress: Some(0.0),
            payload: None,
        })?;

        let doc_ids_json = serde_json::to_string(&data.document_ids)
            .unwrap_or_else(|_| "[]".to_string());

        let build_run = graph_repo.insert_build_run(InsertGraphBuildRunRequest {
            run_id: Some(run.id.clone()),
            scope_description: scope,
            document_ids_json: doc_ids_json,
        })?;

        build_run
    };

    spawn_graph_build_worker(app_handle, build_run.id.clone());
    Ok(GraphBuildRunDto::from(build_run))
}

/// List all graph nodes.
#[tauri::command]
pub fn list_graph_nodes(
    state: State<'_, AppState>,
) -> CommandResult<Vec<KnowledgeNodeDto>> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    Ok(repo.list_nodes()?.into_iter().map(Into::into).collect())
}

/// Get edges for a specific node.
#[tauri::command]
pub fn list_graph_edges(
    state: State<'_, AppState>,
    node_id: String,
) -> CommandResult<Vec<KnowledgeEdgeDto>> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    Ok(repo
        .list_edges_for_node(&node_id)?
        .into_iter()
        .map(Into::into)
        .collect())
}

/// Get source IDs for a specific node.
#[tauri::command]
pub fn get_node_sources(
    state: State<'_, AppState>,
    node_id: String,
) -> CommandResult<Vec<String>> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    let node = repo
        .get_node_by_id(&node_id)?
        .ok_or(CommandError::NotFound)?;
    let sources: Vec<String> = serde_json::from_str(&node.source_ids_json).unwrap_or_default();
    Ok(sources)
}

/// Merge two nodes: merge source into target.
#[tauri::command]
pub fn merge_graph_nodes(
    state: State<'_, AppState>,
    data: MergeNodesDto,
) -> CommandResult<KnowledgeNodeDto> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);

    // Verify both exist
    repo.get_node_by_id(&data.target_node_id)?
        .ok_or(CommandError::NotFound)?;
    repo.get_node_by_id(&data.source_node_id)?
        .ok_or(CommandError::NotFound)?;

    repo.merge_node(&data.target_node_id, &data.source_node_id)?;

    let merged = repo
        .get_node_by_id(&data.target_node_id)?
        .ok_or(CommandError::NotFound)?;
    Ok(KnowledgeNodeDto::from(merged))
}

/// Delete a node and its edges.
#[tauri::command]
pub fn delete_graph_node(
    state: State<'_, AppState>,
    node_id: String,
) -> CommandResult<()> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    repo.delete_node(&node_id)?;
    Ok(())
}

/// List all graph build runs.
#[tauri::command]
pub fn list_graph_build_runs(
    state: State<'_, AppState>,
) -> CommandResult<Vec<GraphBuildRunDto>> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    Ok(repo
        .list_build_runs()?
        .into_iter()
        .map(Into::into)
        .collect())
}

// ───── Worker ─────

fn spawn_graph_build_worker(app_handle: AppHandle, build_run_id: String) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = execute_graph_build_worker(&app_handle, &build_run_id).await {
            log::error!("Graph build worker {build_run_id} failed: {error}");
            let _ = mark_build_failed(&app_handle, &build_run_id, &error.to_string());
        }
    });
}

async fn execute_graph_build_worker(
    app_handle: &AppHandle,
    build_run_id: &str,
) -> CommandResult<()> {
    let (run_id, document_ids) = {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let graph_repo = KnowledgeGraphRepository::new(&db);

        let build = graph_repo
            .get_build_run_by_id(build_run_id)?
            .ok_or(CommandError::NotFound)?;
        let doc_ids: Vec<String> =
            serde_json::from_str(&build.document_ids_json).unwrap_or_default();

        graph_repo.set_build_running(build_run_id)?;
        (build.run_id, doc_ids)
    };

    let run_id_str = run_id.as_deref().unwrap_or("");

    // Mark running
    if !run_id_str.is_empty() {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let workflow_repo = WorkflowRepository::new(&db);
        workflow_repo.update_run(
            run_id_str,
            UpdateWorkflowRunRequest {
                status: Some("running".to_string()),
                checkpoint_ref: Some("extracting".to_string()),
                approval_payload: None,
                cost_usd: None,
                error_message: None,
                started_at: Some(chrono::Utc::now().to_rfc3339()),
                finished_at: None,
            },
        )?;
        workflow_repo.append_event(AppendWorkflowEventRequest {
            run_id: run_id_str.to_string(),
            event_type: "started".to_string(),
            message: Some(format!("Extracting from {} document(s)", document_ids.len())),
            progress: Some(0.1),
            payload: None,
        })?;
    }

    // Try Python orchestration service
    let extraction_result =
        try_orchestration_graph_build(app_handle, run_id_str, &document_ids).await;

    let (nodes, edges) = match extraction_result {
        Ok(result) => result,
        Err(error) => {
            log::warn!(
                "Python orchestration unavailable for graph build, using fallback: {error}"
            );
            build_fallback_graph(&document_ids)
        }
    };

    // Persist extracted nodes and edges
    let (nodes_created, edges_created) = {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let graph_repo = KnowledgeGraphRepository::new(&db);

        let mut nc = 0i64;
        for node_req in nodes {
            graph_repo.insert_node(node_req)?;
            nc += 1;
        }

        let mut ec = 0i64;
        for edge_req in edges {
            graph_repo.insert_edge(edge_req)?;
            ec += 1;
        }

        (nc, ec)
    };

    // Mark completed
    {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let graph_repo = KnowledgeGraphRepository::new(&db);
        let workflow_repo = WorkflowRepository::new(&db);

        graph_repo.set_build_completed(build_run_id, nodes_created, edges_created, 0)?;

        if !run_id_str.is_empty() {
            workflow_repo.update_run(
                run_id_str,
                UpdateWorkflowRunRequest {
                    status: Some("completed".to_string()),
                    checkpoint_ref: Some("ready".to_string()),
                    approval_payload: None,
                    cost_usd: None,
                    error_message: None,
                    started_at: None,
                    finished_at: Some(chrono::Utc::now().to_rfc3339()),
                },
            )?;
            workflow_repo.append_event(AppendWorkflowEventRequest {
                run_id: run_id_str.to_string(),
                event_type: "completed".to_string(),
                message: Some(format!(
                    "Graph build completed: {nodes_created} nodes, {edges_created} edges"
                )),
                progress: Some(1.0),
                payload: None,
            })?;
        }
    }

    Ok(())
}

async fn try_orchestration_graph_build(
    app_handle: &AppHandle,
    run_id: &str,
    document_ids: &[String],
) -> Result<(Vec<InsertKnowledgeNodeRequest>, Vec<InsertKnowledgeEdgeRequest>), String> {
    let state = app_handle.state::<AppState>();
    let health = state
        .orchestration
        .health()
        .await
        .map_err(|e| e.to_string())?;
    let endpoint = health.endpoint.ok_or("No orchestration endpoint")?;
    if health.status != "healthy" && health.status != "degraded" {
        return Err(format!(
            "Orchestration service status: {}",
            health.status
        ));
    }

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .post(format!("{endpoint}/workflows/knowledge-graph"))
        .json(&serde_json::json!({
            "runId": run_id,
            "documentIds": document_ids,
        }))
        .send()
        .await
        .map_err(|e| format!("Orchestration request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Orchestration returned {status}: {body}"));
    }

    let result: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    let mut nodes = Vec::new();
    if let Some(node_arr) = result["nodes"].as_array() {
        for n in node_arr {
            nodes.push(InsertKnowledgeNodeRequest {
                node_type: n["type"].as_str().unwrap_or("concept").to_string(),
                label: n["label"].as_str().unwrap_or("").to_string(),
                aliases_json: serde_json::to_string(
                    n.get("aliases").unwrap_or(&serde_json::json!([])),
                )
                .unwrap_or_else(|_| "[]".to_string()),
                source_ids_json: serde_json::to_string(
                    n.get("sourceIds").unwrap_or(&serde_json::json!([])),
                )
                .unwrap_or_else(|_| "[]".to_string()),
                metadata_json: serde_json::to_string(
                    n.get("metadata").unwrap_or(&serde_json::json!({})),
                )
                .unwrap_or_else(|_| "{}".to_string()),
            });
        }
    }

    let mut edges = Vec::new();
    if let Some(edge_arr) = result["edges"].as_array() {
        for e_val in edge_arr {
            edges.push(InsertKnowledgeEdgeRequest {
                from_node_id: e_val["fromNodeId"].as_str().unwrap_or("").to_string(),
                to_node_id: e_val["toNodeId"].as_str().unwrap_or("").to_string(),
                relation: e_val["relation"].as_str().unwrap_or("related_to").to_string(),
                confidence: e_val["confidence"].as_f64().unwrap_or(0.5),
                source_ids_json: serde_json::to_string(
                    e_val.get("sourceIds").unwrap_or(&serde_json::json!([])),
                )
                .unwrap_or_else(|_| "[]".to_string()),
            });
        }
    }

    Ok((nodes, edges))
}

fn build_fallback_graph(
    document_ids: &[String],
) -> (Vec<InsertKnowledgeNodeRequest>, Vec<InsertKnowledgeEdgeRequest>) {
    // Minimal fallback: one placeholder concept node per document
    let nodes: Vec<InsertKnowledgeNodeRequest> = document_ids
        .iter()
        .map(|doc_id| InsertKnowledgeNodeRequest {
            node_type: "concept".to_string(),
            label: format!("Document {}", &doc_id[..8.min(doc_id.len())]),
            aliases_json: "[]".to_string(),
            source_ids_json: serde_json::to_string(&[doc_id]).unwrap_or_else(|_| "[]".to_string()),
            metadata_json: r#"{"fallback":true}"#.to_string(),
        })
        .collect();

    (nodes, Vec::new())
}

fn mark_build_failed(
    app_handle: &AppHandle,
    build_run_id: &str,
    error: &str,
) -> CommandResult<()> {
    let state = app_handle.state::<AppState>();
    let db = state.lock_db()?;
    let graph_repo = KnowledgeGraphRepository::new(&db);

    let build = graph_repo.get_build_run_by_id(build_run_id)?;
    graph_repo.set_build_failed(build_run_id, error)?;

    if let Some(build) = build {
        if let Some(run_id) = build.run_id {
            let workflow_repo = WorkflowRepository::new(&db);
            let _ = workflow_repo.update_run(
                &run_id,
                UpdateWorkflowRunRequest {
                    status: Some("failed".to_string()),
                    checkpoint_ref: None,
                    approval_payload: None,
                    cost_usd: None,
                    error_message: Some(error.to_string()),
                    started_at: None,
                    finished_at: Some(chrono::Utc::now().to_rfc3339()),
                },
            );
            let _ = workflow_repo.append_event(AppendWorkflowEventRequest {
                run_id,
                event_type: "failed".to_string(),
                message: Some(error.to_string()),
                progress: None,
                payload: None,
            });
        }
    }

    Ok(())
}
