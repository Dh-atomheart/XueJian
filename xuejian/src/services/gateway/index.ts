import type { ZodType } from 'zod'

/**
 * Gateway 错误类型
 */
export class GatewayError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: unknown
  ) {
    super(message)
    this.name = 'GatewayError'
  }
}

/**
 * 检查是否在 Tauri 环境中运行
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

/**
 * 调用 Tauri 命令的统一封装
 * 在非 Tauri 环境中返回模拟数据或抛出错误
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriEnvironment()) {
    console.warn(`[Gateway] Tauri not available, command "${cmd}" will return mock data`)
    return getMockResponse<T>(cmd)
  }

  try {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
    return await tauriInvoke<T>(cmd, args)
  } catch (error) {
    throw new GatewayError(`Failed to invoke command: ${cmd}`, 'INVOKE_ERROR', error)
  }
}

/**
 * 调用 Tauri 命令并使用 Zod 在 IPC 边界做运行时校验。
 */
export async function invokeWithSchema<T>(
  cmd: string,
  schema: ZodType<T>,
  args?: Record<string, unknown>
): Promise<T> {
  const result = await invoke<unknown>(cmd, args)
  return schema.parse(result)
}

/**
 * 非 Tauri 环境的模拟响应
 */
function getMockResponse<T>(cmd: string): T {
  const mockResponses: Record<string, unknown> = {
    get_host_gateway_manifest: {
      protocolVersion: 'xuejian-orchestration/v1',
      modelGatewayCommands: [
        'list_api_configs',
        'get_api_config',
        'create_api_config',
        'update_api_config',
        'set_default_api_config',
        'delete_api_config',
        'store_api_key',
        'test_api_connection',
      ],
      toolGatewayCommands: [
        'list_documents',
        'get_document',
        'create_document',
        'update_document_status',
        'delete_document',
        'list_document_anchors',
        'list_document_chunks',
        'list_due_cards',
        'create_card',
        'update_card_review',
        'list_card_candidates',
        'update_card_candidate',
        'bulk_update_card_candidate_statuses',
        'start_card_generation_workflow',
        'resume_card_generation_workflow',
        'finalize_card_generation_workflow',
      ],
    },
    get_orchestration_service_health: {
      status: 'stopped',
      endpoint: null,
      protocolVersion: null,
      serviceVersion: null,
      pid: null,
      startedAt: null,
      checkedAt: new Date().toISOString(),
      protocolCompatible: false,
      errorMessage: null,
    },
    list_workflow_runs: [],
    list_workflow_events: [],
    get_workflow_checkpoint: null,
    get_settings: {
      theme: 'default',
      language: 'zh-CN',
      dailyNewCardLimit: 20,
      reviewTimeLimit: 30,
    },
    list_documents: [],
    list_document_anchors: [],
    list_document_chunks: [],
    list_card_candidates: [],
    start_card_generation_workflow: {
      id: '11111111-1111-4111-8111-111111111111',
      workflowType: 'card_generation',
      presetId: 'm3-card-production-line',
      status: 'queued',
      threadId: 'card-generation:mock',
      checkpointRef: 'queued',
      approvalPayload: null,
      costUsd: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    resume_card_generation_workflow: {
      id: '11111111-1111-4111-8111-111111111111',
      workflowType: 'card_generation',
      presetId: 'm3-card-production-line',
      status: 'queued',
      threadId: 'card-generation:mock',
      checkpointRef: 'queued',
      approvalPayload: null,
      costUsd: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    finalize_card_generation_workflow: {
      createdCount: 0,
      skippedDuplicates: 0,
      rejectedCount: 0,
      run: {
        id: '11111111-1111-4111-8111-111111111111',
        workflowType: 'card_generation',
        presetId: 'm3-card-production-line',
        status: 'completed',
        threadId: 'card-generation:mock',
        checkpointRef: 'completed',
        approvalPayload: null,
        costUsd: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
    pick_and_import_pdf_document: null,
    read_document_binary: [],
    list_cards: [],
    list_api_configs: [],
    get_daily_stats: { newCards: 0, reviewCards: 0, learningTime: 0 },
  }

  return mockResponses[cmd] as T
}
