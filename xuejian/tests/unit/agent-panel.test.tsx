import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AgentPanelView, normalizeAgentWorkflowSummary, sanitizeAgentPayload } from '@/features/agent'
import type { WorkflowCheckpoint, WorkflowRun } from '@/types'

const baseRun: WorkflowRun = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  workflowType: 'agent_task',
  presetId: null,
  status: 'completed',
  threadId: 'agent-task:test',
  checkpointRef: 'final',
  approvalPayload: null,
  costUsd: null,
  errorMessage: null,
  startedAt: null,
  finishedAt: new Date('2026-05-14T00:00:00Z'),
  createdAt: new Date('2026-05-14T00:00:00Z'),
  updatedAt: new Date('2026-05-14T00:00:01Z'),
}

const checkpoint: WorkflowCheckpoint = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  runId: baseRun.id,
  checkpointRef: 'final',
  stepKey: 'agent-result',
  payload: {
    status: 'partial',
    summary: '完成了检索和学习诊断，制卡被质量门槛阻断。',
    artifactRefs: {
      evidence: ['knowledge-qa://runs/r/evidence/1'],
      learning_advice: ['study-graph://runs/r/learning_advice'],
    },
    qualityEnvelope: {
      auditStatus: 'failed',
      confidence: 0.42,
      riskLevel: 'high',
      reviewRequired: true,
      blockingReasons: ['quality_gate_failed'],
    },
    errorCategory: 'quality_gate_failed',
    prompt: 'hidden prompt',
    chain_of_thought: 'hidden reasoning',
    api_key: 'secret',
  },
  createdAt: new Date('2026-05-14T00:00:01Z'),
  updatedAt: new Date('2026-05-14T00:00:01Z'),
}

function makeViewProps(overrides: Partial<Parameters<typeof AgentPanelView>[0]> = {}) {
  return {
    isOpen: true,
    input: '解释当前资料',
    documents: [{ id: 'doc-1', title: '资料一', status: 'ready' }],
    selectedDocumentIds: ['doc-1'],
    messages: [],
    routeDecision: { route: 'qa', confidence: 'high', reason: 'knowledge_qa_intent' },
    activeSummary: null,
    isSubmitting: false,
    needsConfirmation: false,
    actionNotice: null,
    onToggleOpen: vi.fn(),
    onInputChange: vi.fn(),
    onToggleDocument: vi.fn(),
    onSubmit: vi.fn(),
    onAction: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof AgentPanelView>[0]
}

describe('AgentPanel', () => {
  it('renders status, artifact refs, quality blockers, and safe summary fields', () => {
    const summary = normalizeAgentWorkflowSummary(baseRun, checkpoint, [])

    render(<AgentPanelView {...makeViewProps({ activeSummary: summary })} />)

    expect(screen.getByTestId('agent-panel-summary')).toHaveTextContent('partial')
    expect(screen.getAllByText('quality_gate_failed').length).toBeGreaterThan(0)
    expect(screen.getByTestId('agent-panel-artifact-refs')).toHaveTextContent('evidence')
    expect(screen.queryByText('hidden prompt')).not.toBeInTheDocument()
    expect(screen.queryByText('hidden reasoning')).not.toBeInTheDocument()
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })

  it('shows confirmation chips for ambiguous prompts instead of auto-running', () => {
    const onSubmit = vi.fn()

    render(
      <AgentPanelView
        {...makeViewProps({
          input: '继续',
          routeDecision: { route: 'ambiguous', confidence: 'low', reason: 'no_clear_workflow_intent' },
          needsConfirmation: true,
          onSubmit,
        })}
      />
    )

    expect(screen.getByTestId('agent-panel-confirmation')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '制卡' }))
    expect(onSubmit).toHaveBeenCalledWith('card')
  })

  it('disables undo when there are no created cards and enables it when ids exist', () => {
    const withoutCards = normalizeAgentWorkflowSummary(baseRun, checkpoint, [])
    const withCards = {
      ...withoutCards,
      createdCardIds: ['card-1'],
      availableActions: ['undo_created' as const],
    }

    const { rerender } = render(<AgentPanelView {...makeViewProps({ activeSummary: withoutCards })} />)
    expect(screen.queryByRole('button', { name: /撤销创建/ })).not.toBeInTheDocument()

    rerender(<AgentPanelView {...makeViewProps({ activeSummary: withCards })} />)
    expect(screen.getByRole('button', { name: /撤销创建/ })).toBeEnabled()
  })

  it('removes sensitive payload keys and truncates long strings', () => {
    const sanitized = sanitizeAgentPayload({
      prompt: 'do not show',
      apiKey: 'secret',
      summary: 'x'.repeat(300),
    }) as Record<string, unknown>

    expect(sanitized.prompt).toBeUndefined()
    expect(sanitized.apiKey).toBeUndefined()
    expect(String(sanitized.summary)).toHaveLength(240)
  })

  it('normalizes workflow timeout failures into a clear panel summary', () => {
    const failedRun: WorkflowRun = {
      ...baseRun,
      status: 'failed',
      errorMessage: 'Orchestration returned 500: timed out',
    }

    const summary = normalizeAgentWorkflowSummary(failedRun, null, [])

    expect(summary.status).toBe('failed')
    expect(summary.errorCategory).toBe('provider_timeout')
    expect(summary.summary).toContain('Model request timed out')
  })

  it('prefers stable error category text for failed workflow payloads', () => {
    const failedCheckpoint: WorkflowCheckpoint = {
      ...checkpoint,
      payload: {
        status: 'failed',
        summary: 'CardGraph failed before cards could be created: provider_validation_failed.',
        errorCategory: 'provider_validation_failed',
        qualityEnvelope: {
          auditStatus: 'failed',
          confidence: 0,
          riskLevel: 'high',
          reviewRequired: true,
          blockingReasons: ['provider_validation_failed'],
        },
      },
    }

    const summary = normalizeAgentWorkflowSummary(baseRun, failedCheckpoint, [])

    expect(summary.status).toBe('failed')
    expect(summary.summary).toContain('workflow contract')
    expect(summary.qualityEnvelope?.blockingReasons).toEqual(['provider_validation_failed'])
  })
})
