import type { WorkflowCheckpoint, WorkflowEvent, WorkflowRun } from '@/types'

export interface QualityEnvelope {
  groundingStatus?: string
  auditStatus?: string
  confidence?: number
  riskLevel?: string
  reviewRequired?: boolean
  blockingReasons?: string[]
}

export interface AgentWorkflowSummary {
  status: WorkflowRun['status'] | 'partial'
  summary: string
  artifactRefs: Record<string, string[]>
  qualityEnvelope: QualityEnvelope | null
  errorCategory: string | null
  createdCardIds: string[]
  recommendationReason: string | null
  rollbackAvailable: boolean
  availableActions: Array<
    | 'view_sources'
    | 'view_cards'
    | 'undo_created'
    | 'retry'
    | 'start_review'
    | 'create_card'
    | 'add_to_study_plan'
    | 'expand_reason'
    | 'continue_task'
    | 'cancel_task'
    | 'rollback'
  >
}

const SENSITIVE_KEYS = new Set([
  'prompt',
  'messages',
  'chain_of_thought',
  'chainOfThought',
  'api_key',
  'apiKey',
  'authorization',
])

const ERROR_MESSAGES: Record<string, string> = {
  provider_timeout: 'Model request timed out. Try a smaller document scope, fewer cards, or a more reliable provider.',
  provider_invalid_json: 'The model returned invalid JSON. Retry or switch models.',
  provider_validation_failed: 'The model response did not match the workflow contract. Retry or switch models.',
  schema_validation_failed: 'The workflow response did not match the expected schema. Retry or switch models.',
  host_timeout: 'Host Gateway timed out. Retry after the local service is responsive.',
  host_gateway_error: 'Host Gateway call failed. Check the local desktop service status.',
  host_write_failed: 'Card write failed in Host Gateway. Retry after checking the local service.',
  evidence_not_trusted: 'The evidence was not trusted enough for automatic formal card creation.',
  source_quote_invalid: 'Card source quote audit failed, so no formal card was created.',
  quality_gate_failed: 'Card quality gates failed, so no formal card was created.',
  dedupe_required: 'Duplicate cards were detected or dedupe review is required.',
  idempotency_key_missing: 'Card creation was blocked because the idempotency key was missing.',
  workflow_exception: 'Workflow failed with an internal exception.',
  card_graph_exception: 'CardGraph failed with an internal exception.',
  study_graph_exception: 'StudyGraph failed with an internal exception.',
  supervisor_graph_exception: 'Supervisor failed with an internal exception.',
}

export function sanitizeAgentText(value: unknown, maxLength = 240): string {
  if (typeof value !== 'string') return ''
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value
}

export function sanitizeAgentPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(sanitizeAgentPayload)
  }
  if (typeof value === 'object' && value !== null) {
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key)) continue
      output[key] = sanitizeAgentPayload(item)
    }
    return output
  }
  if (typeof value === 'string') {
    return sanitizeAgentText(value)
  }
  return value
}

export function normalizeAgentWorkflowSummary(
  run: WorkflowRun | null | undefined,
  checkpoint: WorkflowCheckpoint | null | undefined,
  events: WorkflowEvent[] = []
): AgentWorkflowSummary {
  const payload = extractResultPayload(checkpoint, events)
  const artifactRefs = {
    ...normalizeArtifactRefs(payload?.['cardArtifactRefs']),
    ...normalizeArtifactRefs(payload?.['artifactRefs']),
  }
  const qualityEnvelope = normalizeQualityEnvelope(payload?.['qualityEnvelope'])
  const createdCardIds = normalizeStringArray(payload?.['createdCardIds'])
  const statusFromPayload = asStatus(payload?.['status'])
  const status = statusFromPayload ?? run?.status ?? 'queued'
  const errorCategory = asString(payload?.['errorCategory']) ?? errorCategoryFromRun(run)
  const payloadSummary = sanitizeAgentText(payload?.['summary'])
  const failureSummary = errorSummary(errorCategory, run?.errorMessage)
  const summary =
    status === 'failed'
      ? failureSummary || payloadSummary || eventSummary(events) || run?.errorMessage || 'Workflow failed.'
      : payloadSummary || failureSummary || eventSummary(events) || 'Workflow is waiting for results.'
  const recommendationReason = sanitizeAgentText(payload?.['recommendationReason']) ?? null
  const rollbackAvailable = Boolean(payload?.['rollbackAvailable']) || createdCardIds.length > 0

  return {
    status,
    summary,
    artifactRefs,
    qualityEnvelope,
    errorCategory,
    createdCardIds,
    recommendationReason,
    rollbackAvailable,
    availableActions: buildAvailableActions(artifactRefs, createdCardIds, status, rollbackAvailable),
  }
}

function extractResultPayload(
  checkpoint: WorkflowCheckpoint | null | undefined,
  events: WorkflowEvent[]
): Record<string, unknown> | null {
  if (checkpoint?.payload) {
    return sanitizeAgentPayload(checkpoint.payload) as Record<string, unknown>
  }
  const completed = events.find((event) => event.eventType === 'completed' && event.payload)
  if (completed?.payload) {
    const payload = sanitizeAgentPayload(completed.payload) as Record<string, unknown>
    const nestedAnswer = payload['answer']
    if (typeof nestedAnswer === 'object' && nestedAnswer !== null) {
      return {
        status: 'completed',
        summary: (nestedAnswer as Record<string, unknown>)['answer'],
        artifactRefs: payload['artifactRefs'],
        qualityEnvelope: payload['qualityEnvelope'],
        errorCategory: payload['errorCategory'],
      }
    }
    return payload
  }
  const failed = events.find((event) => event.eventType === 'failed' && event.payload)
  if (failed?.payload) {
    return sanitizeAgentPayload(failed.payload) as Record<string, unknown>
  }
  return null
}

function normalizeArtifactRefs(value: unknown): Record<string, string[]> {
  if (typeof value !== 'object' || value === null) return {}
  const refs: Record<string, string[]> = {}
  for (const [key, item] of Object.entries(value)) {
    if (Array.isArray(item)) {
      refs[key] = item.filter((ref): ref is string => typeof ref === 'string')
    } else if (typeof item === 'string') {
      refs[key] = [item]
    }
  }
  return refs
}

function normalizeQualityEnvelope(value: unknown): QualityEnvelope | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  return {
    groundingStatus: asString(record['groundingStatus']) ?? undefined,
    auditStatus: asString(record['auditStatus']) ?? undefined,
    confidence: typeof record['confidence'] === 'number' ? record['confidence'] : undefined,
    riskLevel: asString(record['riskLevel']) ?? undefined,
    reviewRequired: typeof record['reviewRequired'] === 'boolean' ? record['reviewRequired'] : undefined,
    blockingReasons: normalizeStringArray(record['blockingReasons']),
  }
}

function buildAvailableActions(
  artifactRefs: Record<string, string[]>,
  createdCardIds: string[],
  status: AgentWorkflowSummary['status'],
  rollbackAvailable: boolean
): AgentWorkflowSummary['availableActions'] {
  const actions: AgentWorkflowSummary['availableActions'] = ['retry']
  if ((artifactRefs.evidence?.length ?? 0) > 0) actions.unshift('view_sources')
  if ((artifactRefs.card_candidate?.length ?? 0) > 0 || createdCardIds.length > 0) actions.push('view_cards')
  if (createdCardIds.length > 0) actions.push('undo_created')
  if ((artifactRefs.learning_advice?.length ?? 0) > 0) actions.push('start_review')
  if ((artifactRefs.card_candidate?.length ?? 0) > 0) actions.push('create_card')
  if ((artifactRefs.study_schedule_write?.length ?? 0) > 0) actions.push('add_to_study_plan')
  if ((artifactRefs.answer?.length ?? 0) > 0 || (artifactRefs.learning_advice?.length ?? 0) > 0) actions.push('expand_reason')
  if (status === 'waiting_confirmation' || status === 'paused' || status === 'partial') actions.push('continue_task')
  if (status === 'running' || status === 'waiting_confirmation' || status === 'paused' || status === 'partial') {
    actions.push('cancel_task')
  }
  if (rollbackAvailable) actions.push('rollback')
  return Array.from(new Set(actions))
}

function eventSummary(events: WorkflowEvent[]) {
  return sanitizeAgentText(events.find((event) => event.message)?.message)
}

function errorCategoryFromRun(run: WorkflowRun | null | undefined): string | null {
  const message = run?.errorMessage?.toLowerCase() ?? ''
  if (!message) return null
  if (message.includes('timed out') || message.includes('timeout')) return 'provider_timeout'
  if (message.includes('validation') || message.includes('field required') || message.includes('extra inputs')) {
    return 'provider_validation_failed'
  }
  if (message.includes('json')) return 'provider_invalid_json'
  return run?.errorMessage ?? null
}

function errorSummary(errorCategory: string | null, rawMessage: string | null | undefined): string {
  if (!errorCategory) return ''
  return ERROR_MESSAGES[errorCategory] ?? sanitizeAgentText(rawMessage) ?? `Workflow failed: ${errorCategory}`
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function asStatus(value: unknown): AgentWorkflowSummary['status'] | null {
  return value === 'queued' ||
    value === 'running' ||
    value === 'paused' ||
    value === 'waiting_confirmation' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled' ||
    value === 'partial'
    ? value
    : null
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
