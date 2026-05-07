# Tauri Native Smoke Report

- Generated at: `2026-05-05T10:16:09.052195300+00:00`
- Fixture: `C:\Users\86137\AppData\Local\Temp\xuejian-native-smoke-f0868e98-2cf2-44b5-b8c7-c78f4eb2bd6b\fixtures\tauri-native-smoke-fixture.md`
- Document ID: `6f80fda1-2af1-4640-8e2f-b174ccdab079`

| Step | Status | Details |
| --- | --- | --- |
| app_boot | passed_native | Tauri app initialized with AppState |
| orchestration_health | passed_native | status=healthy, endpoint=Some("http://127.0.0.1:54144"), hostGatewayConfigured=true, dependenciesReady=true, missingDependencies=[] |
| library_import | passed_native | document id=6f80fda1-2af1-4640-8e2f-b174ccdab079, title=tauri-native-smoke-fixture.md, status=uploading |
| parse | passed_real | document status=parsed, pageCount=Number(1) |
| copyable_pdf_parse | passed_real | document status=parsed, pageCount=Some(1), persisted pageCount=Some(1), chunkCount=2, anchorCount=3, parseJobStatus=succeeded |
| embedding | blocked | Invalid input: No enabled document embedding workflow assignment with a stored API key was found |
| card_generation | blocked | Invalid input: Provider config not found |
| knowledge_search | passed_native | resultCount=1, results=[{"chunkIndex":1,"content":"Unique marker: 3a99731b-9376-465b-88cc-e9beaf208c85. Successful parsing should persist docume","documentId":"9660cf4f-4ac0-425b-9a7d-f554445521e2","id":"a1a71187-c9a9-464a-ba70-50c23034628d","pageEnd":1,"pageStart":1,"snippet":"Unique marker: 3a99731b-9376-465b-88cc-e9beaf208c85. Successful parsing should persist docume"}] |
| knowledge_qa | passed_real | run=03f4cca4-ec9d-4513-9dda-156ba3833059, finalRun={"approvalPayload":null,"checkpointRef":null,"costUsd":null,"createdAt":"2026-05-05T10:16:11.033532500+00:00","errorMessage":null,"finishedAt":"2026-05-05T10:16:11.103099500+00:00","id":"03f4cca4-ec9d-4513-9dda-156ba3833059","presetId":null,"startedAt":"2026-05-05T10:16:11.037659100+00:00","status":"completed","threadId":"knowledge-qa:9660cf4f-4ac0-425b-9a7d-f554445521e2","updatedAt":"2026-05-05T10:16:11.104645900+00:00","workflowType":"knowledge_qa"} |

## Classification Rules

- `passed_real`: native command completed through Rust/AppState/orchestration and produced non-fallback persisted output.
- `passed_native`: native command/database/orchestration dispatch path is executable, but the step does not require model output.
- `blocked`: native path is wired, but external provider credentials or model assignments are missing.
- `fallback_detected`: command completed only because a rule-based fallback path ran; this is not accepted as real workflow success.
- `failed`: native infrastructure or command execution failed.
