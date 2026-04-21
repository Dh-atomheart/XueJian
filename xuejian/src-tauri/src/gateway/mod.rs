pub mod host_http;

use serde::Serialize;

pub const ORCHESTRATION_PROTOCOL_VERSION: &str = "xuejian-orchestration/v1";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayManifest {
    pub protocol_version: &'static str,
    pub model_gateway_commands: Vec<&'static str>,
    pub tool_gateway_commands: Vec<&'static str>,
}

pub fn host_gateway_manifest() -> GatewayManifest {
    GatewayManifest {
        protocol_version: ORCHESTRATION_PROTOCOL_VERSION,
        model_gateway_commands: vec![
            "list_api_configs",
            "get_api_config",
            "create_api_config",
            "update_api_config",
            "set_default_api_config",
            "delete_api_config",
            "store_api_key",
            "test_api_connection",
        ],
        tool_gateway_commands: vec![
            "list_documents",
            "get_document",
            "create_document",
            "update_document_status",
            "delete_document",
            "list_document_anchors",
            "list_document_chunks",
            "list_cards",
            "list_due_cards",
            "create_card",
            "delete_card",
            "update_card",
            "update_card_review",
            "list_highlights",
            "create_highlight",
            "update_highlight",
            "delete_highlight",
            "batch_create_highlights_for_cards",
            "list_card_candidates",
            "update_card_candidate",
            "bulk_update_card_candidate_statuses",
            "start_card_generation_workflow",
            "resume_card_generation_workflow",
            "finalize_card_generation_workflow",
            "export_annotated_pdf",
            "upload_card_media",
            "list_card_media",
            "delete_card_media",
            "import_cards_apkg",
            "pick_and_export_apkg",
            "pick_and_export_csv",
            "search_knowledge",
            "start_knowledge_qa_workflow",
        ],
    }
}
