import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ArtifactCard, ActionButtonGroup } from '@/features/agent'
import type { WorkflowArtifact } from '@/types'

function makeArtifact(overrides: Partial<WorkflowArtifact> = {}): WorkflowArtifact {
  return {
    artifactId: 'art-001',
    runId: 'run-001',
    artifactType: 'card_candidate',
    schemaVersion: 1,
    summary: '这是一个候选卡片产物摘要。',
    sourceRefs: ['doc-1', 'doc-2'],
    qualityEnvelope: { riskLevel: 'medium' },
    errorCategory: null,
    createdBy: 'agent',
    lifecycleStatus: 'created',
    payload: {},
    createdAt: new Date('2026-05-14T00:00:00Z'),
    updatedAt: new Date('2026-05-14T00:00:00Z'),
    ...overrides,
  }
}

const baseSummary = {
  status: 'completed' as const,
  summary: 'Workflow completed.',
  artifactRefs: { card_candidate: ['art-001'] },
  qualityEnvelope: null,
  errorCategory: null,
  createdCardIds: [],
  recommendationReason: '这条建议来自检索证据。',
  rollbackAvailable: true,
  availableActions: ['create_card', 'expand_reason', 'rollback'] as const,
}

describe('ArtifactCard', () => {
  it('renders artifact type, summary, source count, and quality badge', () => {
    render(
      <ArtifactCard
        artifact={makeArtifact()}
        summary={baseSummary}
        onAction={vi.fn()}
      />
    )

    expect(screen.getByTestId('artifact-card-card_candidate')).toBeInTheDocument()
    expect(screen.getByText('候选卡片')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('medium')).toBeInTheDocument()
  })

  it('shows rolled-back state when lifecycleStatus is rolled_back', () => {
    render(
      <ArtifactCard
        artifact={makeArtifact({ lifecycleStatus: 'rolled_back' })}
        summary={baseSummary}
        onAction={vi.fn()}
      />
    )

    expect(screen.getByText('已回滚')).toBeInTheDocument()
  })

  it('enables rollback when a rollback action is available', () => {
    render(
      <ArtifactCard
        artifact={makeArtifact()}
        summary={baseSummary}
        onAction={vi.fn()}
      />
    )

    const rollbackButton = screen.getByTestId('artifact-action-rollback')
    expect(rollbackButton).toBeEnabled()
  })
})

describe('ActionButtonGroup', () => {
  it('groups safe, write, and danger actions separately', () => {
    render(
      <ActionButtonGroup
        actions={[
          'view_sources',
          'expand_reason',
          'create_card',
          'undo_created',
          'cancel_task',
          'rollback',
        ]}
        onAction={vi.fn()}
        createdCardIds={[]}
      />
    )

    expect(screen.getByTestId('action-view_sources')).toBeInTheDocument()
    expect(screen.getByTestId('action-expand_reason')).toBeInTheDocument()
    expect(screen.getByTestId('action-create_card')).toBeInTheDocument()
    expect(screen.getByTestId('action-undo_created')).toBeInTheDocument()
    expect(screen.getByTestId('action-cancel_task')).toBeInTheDocument()
    expect(screen.getByTestId('action-rollback')).toBeInTheDocument()
  })

  it('disables undo_created when there are no created cards', () => {
    render(
      <ActionButtonGroup
        actions={['undo_created']}
        onAction={vi.fn()}
        createdCardIds={[]}
      />
    )

    expect(screen.getByTestId('action-undo_created')).toBeDisabled()
  })
})
