use std::{collections::HashMap, time::Duration};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

use crate::{
    commands::{AppState, CommandError, CommandResult},
    db::{
        AppendWorkflowEventRequest, Community, CommunityRepository, CreateWorkflowRunRequest,
        GraphBuildRun, InsertGraphBuildRunRequest, InsertKnowledgeEdgeRequest,
        InsertKnowledgeNodeRequest, KnowledgeEdge, KnowledgeGraphRepository, KnowledgeNode,
        UpdateKnowledgeEdgeRequest, UpdateKnowledgeNodeRequest, UpdateWorkflowRunRequest,
        WorkflowRepository,
    },
};

const GRAPH_PRESET_ID: &str = "v4-1-knowledge-graph";

fn json_string<T: Serialize>(value: &T) -> CommandResult<String> {
    serde_json::to_string(value).map_err(|error| CommandError::Internal(error.to_string()))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeNodeDto {
    pub id: String,
    pub node_type: String,
    pub label: String,
    pub aliases: Vec<String>,
    pub source_ids: Vec<String>,
    pub description: String,
    pub metadata: serde_json::Value,
    pub community_id: Option<String>,
    pub parent_community_id: Option<String>,
    pub degree: i64,
    pub has_embedding: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl From<KnowledgeNode> for KnowledgeNodeDto {
    fn from(node: KnowledgeNode) -> Self {
        Self {
            id: node.id,
            node_type: node.node_type,
            label: node.label,
            aliases: serde_json::from_str(&node.aliases_json).unwrap_or_default(),
            source_ids: serde_json::from_str(&node.source_ids_json).unwrap_or_default(),
            description: node.description,
            metadata: serde_json::from_str(&node.metadata_json).unwrap_or(serde_json::json!({})),
            community_id: node.community_id,
            parent_community_id: node.parent_community_id,
            degree: node.degree,
            has_embedding: node.has_embedding,
            created_at: node.created_at,
            updated_at: node.updated_at,
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
    pub inferred: bool,
    pub metadata: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

impl From<KnowledgeEdge> for KnowledgeEdgeDto {
    fn from(edge: KnowledgeEdge) -> Self {
        Self {
            id: edge.id,
            from_node_id: edge.from_node_id,
            to_node_id: edge.to_node_id,
            relation: edge.relation,
            confidence: edge.confidence,
            source_ids: serde_json::from_str(&edge.source_ids_json).unwrap_or_default(),
            inferred: edge.inferred,
            metadata: serde_json::from_str(&edge.metadata_json).unwrap_or(serde_json::json!({})),
            created_at: edge.created_at,
            updated_at: edge.updated_at,
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
    pub communities_detected: i64,
    pub status: String,
    pub error_message: Option<String>,
    pub current_stage: i64,
    pub created_at: String,
    pub updated_at: String,
}

impl From<GraphBuildRun> for GraphBuildRunDto {
    fn from(run: GraphBuildRun) -> Self {
        Self {
            id: run.id,
            run_id: run.run_id,
            scope_description: run.scope_description,
            document_ids: serde_json::from_str(&run.document_ids_json).unwrap_or_default(),
            nodes_created: run.nodes_created,
            edges_created: run.edges_created,
            nodes_merged: run.nodes_merged,
            communities_detected: run.communities_detected,
            status: run.status,
            error_message: run.error_message,
            current_stage: run.current_stage,
            created_at: run.created_at,
            updated_at: run.updated_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommunityDto {
    pub id: String,
    pub level: i32,
    pub title: String,
    pub member_node_ids: Vec<String>,
    pub parent_community_id: Option<String>,
    pub summary_json: Option<String>,
    pub node_count: i64,
    pub edge_count: i64,
    pub collapsed: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl From<Community> for CommunityDto {
    fn from(community: Community) -> Self {
        Self {
            id: community.id,
            level: community.level,
            title: community.title,
            member_node_ids: serde_json::from_str(&community.member_node_ids_json)
                .unwrap_or_default(),
            parent_community_id: community.parent_community_id,
            summary_json: community.summary_json,
            node_count: community.node_count,
            edge_count: community.edge_count,
            collapsed: community.collapsed,
            created_at: community.created_at,
            updated_at: community.updated_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphStatsDto {
    pub total_nodes: i64,
    pub total_edges: i64,
    pub total_communities: i64,
    pub node_type_distribution: serde_json::Value,
    pub last_build_run: Option<GraphBuildRunDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartGraphBuildDto {
    pub document_ids: Vec<String>,
    pub scope_description: Option<String>,
    #[serde(default)]
    pub incremental: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeNodesDto {
    pub target_node_id: String,
    pub source_node_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeNodePatchDto {
    pub node_type: Option<String>,
    pub label: Option<String>,
    pub aliases: Option<Vec<String>>,
    pub source_ids: Option<Vec<String>>,
    pub description: Option<String>,
    pub metadata: Option<Value>,
    pub community_id: Option<Option<String>>,
    pub parent_community_id: Option<Option<String>>,
    pub degree: Option<i64>,
    pub has_embedding: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateKnowledgeNodeDto {
    pub node_id: String,
    pub updates: KnowledgeNodePatchDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateKnowledgeEdgeDto {
    pub from_node_id: String,
    pub to_node_id: String,
    pub relation: String,
    pub confidence: f64,
    pub source_ids: Vec<String>,
    pub inferred: bool,
    pub metadata: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEdgePatchDto {
    pub from_node_id: Option<String>,
    pub to_node_id: Option<String>,
    pub relation: Option<String>,
    pub confidence: Option<f64>,
    pub source_ids: Option<Vec<String>>,
    pub inferred: Option<bool>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateKnowledgeEdgeDto {
    pub edge_id: String,
    pub updates: KnowledgeEdgePatchDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleCommunityCollapseDto {
    pub community_id: String,
    pub collapsed: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrchestrationGraphPayload {
    #[serde(default)]
    nodes: Vec<OrchestrationNode>,
    #[serde(default)]
    edges: Vec<OrchestrationEdge>,
    #[serde(default)]
    communities: Vec<OrchestrationCommunity>,
    #[serde(default, rename = "entityEmbeddings")]
    entity_embeddings: Vec<OrchestrationEntityEmbedding>,
    nodes_created: Option<i64>,
    edges_created: Option<i64>,
    nodes_merged: Option<i64>,
    communities_detected: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrchestrationNode {
    id: Option<String>,
    label: String,
    #[serde(rename = "type")]
    node_type: Option<String>,
    #[serde(default)]
    aliases: Vec<String>,
    #[serde(default)]
    source_ids: Vec<String>,
    #[serde(default)]
    description: String,
    #[serde(default)]
    metadata: Value,
    community_id: Option<String>,
    parent_community_id: Option<String>,
    degree: Option<i64>,
    has_embedding: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrchestrationEdge {
    id: Option<String>,
    from_node_id: Option<String>,
    to_node_id: Option<String>,
    from_label: Option<String>,
    to_label: Option<String>,
    relation: String,
    confidence: f64,
    #[serde(default)]
    source_ids: Vec<String>,
    #[serde(default)]
    inferred: bool,
    #[serde(default)]
    metadata: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrchestrationCommunity {
    id: Option<String>,
    level: i32,
    #[serde(default)]
    title: String,
    #[serde(default)]
    member_node_ids: Vec<String>,
    parent_community_id: Option<String>,
    summary_json: Option<String>,
    node_count: Option<i64>,
    edge_count: Option<i64>,
    collapsed: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrchestrationEntityEmbedding {
    node_id: String,
    embedding_model: String,
    #[serde(default)]
    vector: Vec<f32>,
}

struct PersistedGraphResult {
    nodes_created: i64,
    edges_created: i64,
    nodes_merged: i64,
    communities_detected: i64,
}

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

        let scope = data.scope_description.unwrap_or_else(|| {
            if data.incremental {
                format!("incremental: {} document(s)", data.document_ids.len())
            } else {
                format!("{} document(s)", data.document_ids.len())
            }
        });

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
            message: Some(format!(
                "Queued graph build for {} document(s)",
                data.document_ids.len()
            )),
            progress: Some(0.0),
            payload: None,
        })?;

        graph_repo.insert_build_run(InsertGraphBuildRunRequest {
            run_id: Some(run.id),
            scope_description: scope,
            document_ids_json: json_string(&data.document_ids)?,
            incremental: data.incremental,
        })?
    };

    spawn_graph_build_worker(app_handle, build_run.id.clone());
    Ok(build_run.into())
}

#[tauri::command]
pub fn list_graph_nodes(state: State<'_, AppState>) -> CommandResult<Vec<KnowledgeNodeDto>> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    Ok(repo.list_nodes()?.into_iter().map(Into::into).collect())
}

#[tauri::command]
pub fn list_all_graph_edges(
    state: State<'_, AppState>,
) -> CommandResult<Vec<KnowledgeEdgeDto>> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    Ok(repo.list_all_edges()?.into_iter().map(Into::into).collect())
}

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

#[tauri::command]
pub fn get_node_sources(
    state: State<'_, AppState>,
    node_id: String,
) -> CommandResult<Vec<String>> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    let node = repo.get_node_by_id(&node_id)?.ok_or(CommandError::NotFound)?;
    Ok(serde_json::from_str(&node.source_ids_json).unwrap_or_default())
}

#[tauri::command]
pub fn update_knowledge_node(
    state: State<'_, AppState>,
    data: UpdateKnowledgeNodeDto,
) -> CommandResult<KnowledgeNodeDto> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    let updated = repo
        .update_node(
            &data.node_id,
            UpdateKnowledgeNodeRequest {
                node_type: data.updates.node_type,
                label: data.updates.label,
                aliases_json: data
                    .updates
                    .aliases
                    .map(|value| json_string(&value))
                    .transpose()?,
                source_ids_json: data
                    .updates
                    .source_ids
                    .map(|value| json_string(&value))
                    .transpose()?,
                description: data.updates.description,
                metadata_json: data.updates.metadata.map(|value| value.to_string()),
                community_id: data.updates.community_id,
                parent_community_id: data.updates.parent_community_id,
                degree: data.updates.degree,
                has_embedding: data.updates.has_embedding,
            },
        )?
        .ok_or(CommandError::NotFound)?;
    Ok(updated.into())
}

#[tauri::command]
pub fn merge_graph_nodes(
    state: State<'_, AppState>,
    data: MergeNodesDto,
) -> CommandResult<KnowledgeNodeDto> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    repo.get_node_by_id(&data.target_node_id)?
        .ok_or(CommandError::NotFound)?;
    repo.get_node_by_id(&data.source_node_id)?
        .ok_or(CommandError::NotFound)?;
    repo.merge_node(&data.target_node_id, &data.source_node_id)?;
    let merged = repo
        .get_node_by_id(&data.target_node_id)?
        .ok_or(CommandError::NotFound)?;
    Ok(merged.into())
}

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

#[tauri::command]
pub fn create_knowledge_edge(
    state: State<'_, AppState>,
    data: CreateKnowledgeEdgeDto,
) -> CommandResult<KnowledgeEdgeDto> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    let edge = repo.insert_edge(InsertKnowledgeEdgeRequest {
        id: None,
        from_node_id: data.from_node_id,
        to_node_id: data.to_node_id,
        relation: data.relation,
        confidence: data.confidence,
        source_ids_json: json_string(&data.source_ids)?,
        inferred: data.inferred,
        metadata_json: data.metadata.to_string(),
    })?;
    Ok(edge.into())
}

#[tauri::command]
pub fn update_knowledge_edge(
    state: State<'_, AppState>,
    data: UpdateKnowledgeEdgeDto,
) -> CommandResult<KnowledgeEdgeDto> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    let updated = repo
        .update_edge(
            &data.edge_id,
            UpdateKnowledgeEdgeRequest {
                from_node_id: data.updates.from_node_id,
                to_node_id: data.updates.to_node_id,
                relation: data.updates.relation,
                confidence: data.updates.confidence,
                source_ids_json: data
                    .updates
                    .source_ids
                    .map(|value| json_string(&value))
                    .transpose()?,
                inferred: data.updates.inferred,
                metadata_json: data.updates.metadata.map(|value| value.to_string()),
            },
        )?
        .ok_or(CommandError::NotFound)?;
    Ok(updated.into())
}

#[tauri::command]
pub fn delete_knowledge_edge(
    state: State<'_, AppState>,
    edge_id: String,
) -> CommandResult<()> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    repo.delete_edge(&edge_id)?;
    Ok(())
}

#[tauri::command]
pub fn list_communities(
    state: State<'_, AppState>,
    level: Option<i32>,
) -> CommandResult<Vec<CommunityDto>> {
    let db = state.lock_db()?;
    let repo = CommunityRepository::new(&db);
    Ok(repo
        .list_communities(level)?
        .into_iter()
        .map(Into::into)
        .collect())
}

#[tauri::command]
pub fn get_community_summary(
    state: State<'_, AppState>,
    community_id: String,
) -> CommandResult<Option<Value>> {
    let db = state.lock_db()?;
    let repo = CommunityRepository::new(&db);
    Ok(repo
        .get_community_summary(&community_id)?
        .and_then(|value| serde_json::from_str(&value).ok()))
}

#[tauri::command]
pub fn toggle_community_collapse(
    state: State<'_, AppState>,
    data: ToggleCommunityCollapseDto,
) -> CommandResult<()> {
    let db = state.lock_db()?;
    let repo = CommunityRepository::new(&db);
    repo.update_community(
        &data.community_id,
        &crate::db::CommunityUpdates {
            collapsed: Some(data.collapsed),
            ..Default::default()
        },
    )?
    .ok_or(CommandError::NotFound)?;
    Ok(())
}

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

#[tauri::command]
pub fn cancel_graph_build(
    state: State<'_, AppState>,
    build_run_id: String,
) -> CommandResult<()> {
    let db = state.lock_db()?;
    let graph_repo = KnowledgeGraphRepository::new(&db);
    let workflow_repo = WorkflowRepository::new(&db);
    let build = graph_repo
        .get_build_run_by_id(&build_run_id)?
        .ok_or(CommandError::NotFound)?;
    graph_repo.set_build_cancelled(&build_run_id)?;

    if let Some(run_id) = build.run_id {
        workflow_repo.update_run(
            &run_id,
            UpdateWorkflowRunRequest {
                status: Some("cancelled".to_string()),
                checkpoint_ref: None,
                approval_payload: None,
                cost_usd: None,
                error_message: None,
                started_at: None,
                finished_at: Some(chrono::Utc::now().to_rfc3339()),
            },
        )?;
        workflow_repo.append_event(AppendWorkflowEventRequest {
            run_id,
            event_type: "failed".to_string(),
            message: Some("Knowledge graph build cancelled".to_string()),
            progress: None,
            payload: None,
        })?;
    }

    Ok(())
}

#[tauri::command]
pub fn get_graph_stats(
    state: State<'_, AppState>,
) -> CommandResult<GraphStatsDto> {
    let db = state.lock_db()?;
    let repo = KnowledgeGraphRepository::new(&db);
    let stats = repo.get_graph_stats()?;
    Ok(GraphStatsDto {
        total_nodes: stats.total_nodes,
        total_edges: stats.total_edges,
        total_communities: stats.total_communities,
        node_type_distribution: stats.node_type_distribution,
        last_build_run: stats.last_build_run.map(Into::into),
    })
}

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
    let (run_id, document_ids, incremental) = {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let graph_repo = KnowledgeGraphRepository::new(&db);

        let build = graph_repo
            .get_build_run_by_id(build_run_id)?
            .ok_or(CommandError::NotFound)?;
        let document_ids: Vec<String> =
            serde_json::from_str(&build.document_ids_json).unwrap_or_default();
        graph_repo.set_build_running(build_run_id)?;
        (build.run_id, document_ids, build.incremental)
    };

    let run_id_str = run_id.as_deref().unwrap_or("");
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

    let payload = match try_orchestration_graph_build(
        app_handle,
        build_run_id,
        run_id_str,
        &document_ids,
        incremental,
    )
    .await
    {
        Ok(result) => result,
        Err(error) => {
            log::warn!(
                "Python orchestration unavailable for graph build, using fallback: {error}"
            );
            build_fallback_graph(&document_ids)
        }
    };

    let persisted = {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        persist_graph_payload(&db, payload, incremental)?
    };

    {
        let state = app_handle.state::<AppState>();
        let db = state.lock_db()?;
        let graph_repo = KnowledgeGraphRepository::new(&db);
        let workflow_repo = WorkflowRepository::new(&db);

        if graph_repo
            .get_build_run_by_id(build_run_id)?
            .is_some_and(|run| run.status == "cancelled")
        {
            return Ok(());
        }

        graph_repo.set_build_completed(
            build_run_id,
            persisted.nodes_created,
            persisted.edges_created,
            persisted.nodes_merged,
            persisted.communities_detected,
        )?;

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
                    "Graph build completed: {} nodes, {} edges, {} communities",
                    persisted.nodes_created,
                    persisted.edges_created,
                    persisted.communities_detected,
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
    build_run_id: &str,
    run_id: &str,
    document_ids: &[String],
    incremental: bool,
) -> Result<OrchestrationGraphPayload, String> {
    let state = app_handle.state::<AppState>();
    let health = state
        .orchestration
        .health()
        .await
        .map_err(|error| error.to_string())?;
    let endpoint = health.endpoint.ok_or("No orchestration endpoint")?;
    if health.status != "healthy" && health.status != "degraded" {
        return Err(format!("Orchestration service status: {}", health.status));
    }

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .post(format!("{endpoint}/workflows/knowledge-graph"))
        .json(&serde_json::json!({
            "buildRunId": build_run_id,
            "runId": run_id,
            "documentIds": document_ids,
            "incremental": incremental,
        }))
        .send()
        .await
        .map_err(|error| format!("Orchestration request failed: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Orchestration returned {status}: {body}"));
    }

    response
        .json::<OrchestrationGraphPayload>()
        .await
        .map_err(|error| error.to_string())
}

fn build_fallback_graph(document_ids: &[String]) -> OrchestrationGraphPayload {
    let nodes = document_ids
        .iter()
        .map(|document_id| OrchestrationNode {
            id: None,
            label: format!("Document {}", &document_id[..8.min(document_id.len())]),
            node_type: Some("concept".to_string()),
            aliases: Vec::new(),
            source_ids: vec![document_id.to_string()],
            description:
                "Python orchestration unavailable; fallback graph created from document shell."
                    .to_string(),
            metadata: serde_json::json!({"fallback": true}),
            community_id: None,
            parent_community_id: None,
            degree: Some(0),
            has_embedding: Some(false),
        })
        .collect::<Vec<_>>();

    OrchestrationGraphPayload {
        nodes_created: Some(nodes.len() as i64),
        edges_created: Some(0),
        nodes_merged: Some(0),
        communities_detected: Some(0),
        nodes,
        edges: Vec::new(),
        communities: Vec::new(),
        entity_embeddings: Vec::new(),
    }
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

fn persist_graph_payload(
    db: &crate::db::Database,
    payload: OrchestrationGraphPayload,
    incremental: bool,
) -> crate::db::Result<PersistedGraphResult> {
    let graph_repo = KnowledgeGraphRepository::new(db);
    let community_repo = CommunityRepository::new(db);

    if !incremental {
        community_repo.clear_communities()?;
        graph_repo.clear_graph()?;
    }

    let mut ref_to_id = HashMap::<String, String>::new();
    let mut nodes_created = 0i64;
    let mut nodes_merged = payload.nodes_merged.unwrap_or(0);

    for node in payload.nodes {
        let existing = graph_repo.find_node_by_label(&node.label)?;
        let resolved_id = if let Some(existing) = existing {
            let mut aliases = parse_json_string_array(&existing.aliases_json);
            aliases.extend(node.aliases.clone());
            aliases.sort();
            aliases.dedup();

            let mut source_ids = parse_json_string_array(&existing.source_ids_json);
            source_ids.extend(node.source_ids.clone());
            source_ids.sort();
            source_ids.dedup();

            let preserve_user_fields = metadata_flag(&existing.metadata_json);
            graph_repo.update_node(
                &existing.id,
                UpdateKnowledgeNodeRequest {
                    node_type: if preserve_user_fields {
                        None
                    } else {
                        Some(node.node_type.clone().unwrap_or(existing.node_type.clone()))
                    },
                    label: if preserve_user_fields {
                        None
                    } else {
                        Some(node.label.clone())
                    },
                    aliases_json: Some(serde_json::to_string(&aliases)?),
                    source_ids_json: Some(serde_json::to_string(&source_ids)?),
                    description: if preserve_user_fields {
                        None
                    } else {
                        Some(node.description.clone())
                    },
                    metadata_json: Some(node.metadata.to_string()),
                    community_id: Some(node.community_id.clone()),
                    parent_community_id: Some(node.parent_community_id.clone()),
                    degree: node.degree,
                    has_embedding: node.has_embedding,
                },
            )?;
            nodes_merged += 1;
            existing.id
        } else {
            let inserted = graph_repo.insert_node(InsertKnowledgeNodeRequest {
                id: node.id.clone(),
                node_type: node.node_type.unwrap_or_else(|| "concept".to_string()),
                label: node.label.clone(),
                aliases_json: serde_json::to_string(&node.aliases)?,
                source_ids_json: serde_json::to_string(&node.source_ids)?,
                description: node.description,
                metadata_json: node.metadata.to_string(),
                community_id: node.community_id,
                parent_community_id: node.parent_community_id,
                degree: node.degree.unwrap_or(0),
                has_embedding: node.has_embedding.unwrap_or(false),
            })?;
            nodes_created += 1;
            inserted.id
        };

        ref_to_id.insert(node.label.to_lowercase(), resolved_id.clone());
        if let Some(id) = node.id {
            ref_to_id.insert(id, resolved_id.clone());
        }
        for alias in node.aliases {
            ref_to_id.insert(alias.to_lowercase(), resolved_id.clone());
        }
    }

    for embedding in payload.entity_embeddings {
        let Some(node_id) = ref_to_id
            .get(&embedding.node_id)
            .cloned()
            .or_else(|| graph_repo.get_node_by_id(&embedding.node_id).ok().flatten().map(|node| node.id))
        else {
            continue;
        };
        if embedding.vector.is_empty() {
            continue;
        }
        graph_repo.save_entity_embedding(&node_id, &embedding.embedding_model, &embedding.vector)?;
    }

    let mut edges_created = 0i64;
    for edge in payload.edges {
        let from_node_id = edge
            .from_node_id
            .as_ref()
            .and_then(|id| ref_to_id.get(id).cloned())
            .or_else(|| {
                edge.from_label
                    .as_ref()
                    .and_then(|label| ref_to_id.get(&label.to_lowercase()).cloned())
            });
        let to_node_id = edge
            .to_node_id
            .as_ref()
            .and_then(|id| ref_to_id.get(id).cloned())
            .or_else(|| {
                edge.to_label
                    .as_ref()
                    .and_then(|label| ref_to_id.get(&label.to_lowercase()).cloned())
            });

        let (Some(from_node_id), Some(to_node_id)) = (from_node_id, to_node_id) else {
            continue;
        };
        if from_node_id == to_node_id {
            continue;
        }

        let source_ids_json = serde_json::to_string(&edge.source_ids)?;
        if let Some(existing) =
            graph_repo.find_edge_by_signature(&from_node_id, &to_node_id, &edge.relation)?
        {
            if !metadata_flag(&existing.metadata_json) {
                graph_repo.update_edge(
                    &existing.id,
                    UpdateKnowledgeEdgeRequest {
                        confidence: Some(existing.confidence.max(edge.confidence)),
                        source_ids_json: Some(merge_json_string_arrays(
                            &existing.source_ids_json,
                            &source_ids_json,
                        )?),
                        inferred: Some(existing.inferred || edge.inferred),
                        metadata_json: Some(edge.metadata.to_string()),
                        ..Default::default()
                    },
                )?;
            }
            continue;
        }

        graph_repo.insert_edge(InsertKnowledgeEdgeRequest {
            id: edge.id,
            from_node_id,
            to_node_id,
            relation: edge.relation,
            confidence: edge.confidence,
            source_ids_json,
            inferred: edge.inferred,
            metadata_json: edge.metadata.to_string(),
        })?;
        edges_created += 1;
    }

    community_repo.clear_communities()?;
    let mut communities_detected = 0i64;
    for community in payload.communities {
        let member_ids = community
            .member_node_ids
            .iter()
            .filter_map(|id| ref_to_id.get(id).cloned())
            .collect::<Vec<_>>();

        community_repo.create_community(crate::db::NewCommunity {
            id: community.id,
            level: community.level,
            title: community.title,
            member_node_ids_json: serde_json::to_string(&member_ids)?,
            parent_community_id: community.parent_community_id,
            summary_json: community.summary_json,
            node_count: community.node_count.unwrap_or(member_ids.len() as i64),
            edge_count: community.edge_count.unwrap_or(0),
            collapsed: community.collapsed.unwrap_or(false),
        })?;
        communities_detected += 1;
    }

    graph_repo.recompute_node_degrees()?;

    Ok(PersistedGraphResult {
        nodes_created: payload.nodes_created.unwrap_or(nodes_created),
        edges_created: payload.edges_created.unwrap_or(edges_created),
        nodes_merged,
        communities_detected: payload
            .communities_detected
            .unwrap_or(communities_detected),
    })
}

fn parse_json_string_array(value: &str) -> Vec<String> {
    serde_json::from_str(value).unwrap_or_default()
}

fn merge_json_string_arrays(
    left: &str,
    right: &str,
) -> crate::db::Result<String> {
    let mut values = parse_json_string_array(left);
    values.extend(parse_json_string_array(right));
    values.sort();
    values.dedup();
    Ok(serde_json::to_string(&values)?)
}

fn metadata_flag(metadata_json: &str) -> bool {
    serde_json::from_str::<Value>(metadata_json)
        .ok()
        .and_then(|value| {
            value
                .get("user_edited")
                .and_then(Value::as_bool)
                .or_else(|| value.get("userEdited").and_then(Value::as_bool))
        })
        .unwrap_or(false)
}
