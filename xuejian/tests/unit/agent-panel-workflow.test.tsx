import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentPanel } from '@/features/agent'
import { useAppUiStore } from '@/store'

const { startAgentCardGenerationMock, startAgentTaskMock, startKnowledgeQaMock } = vi.hoisted(() => ({
  startAgentCardGenerationMock: vi.fn(),
  startAgentTaskMock: vi.fn(),
  startKnowledgeQaMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('@/services/gateway/agent', () => ({
  agentGateway: {
    startAgentCardGeneration: startAgentCardGenerationMock,
    startAgentTask: startAgentTaskMock,
  },
}))

vi.mock('@/services/gateway/knowledge', () => ({
  startKnowledgeQaWorkflow: startKnowledgeQaMock,
}))

vi.mock('@/queries', () => ({
  useDocumentsQuery: () => ({
    data: [{ id: 'doc-single', title: 'Single source', status: 'ready' }],
    isLoading: false,
  }),
}))

vi.mock('@/queries/orchestration', () => ({
  orchestrationQueryKeys: { all: ['orchestration'] },
  useWorkflowCheckpointQuery: () => ({ data: null }),
  useWorkflowEventsQuery: () => ({ data: [] }),
  useWorkflowRunQuery: () => ({ data: null }),
}))

vi.mock('@/queries/cards', () => ({
  cardsQueryKeys: { all: ['cards'] },
  useDeleteCardMutation: () => ({ mutateAsync: vi.fn() }),
}))

function makeRun(id = 'run-card') {
  return {
    id,
    workflowType: 'agent_card_generation',
    presetId: null,
    status: 'queued',
    threadId: `agent-card:${id}`,
    checkpointRef: null,
    approvalPayload: null,
    costUsd: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date('2026-05-14T00:00:00Z'),
    updatedAt: new Date('2026-05-14T00:00:00Z'),
  }
}

describe('AgentPanel workflow launcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppUiStore.setState((state) => ({
      ...state,
      reader: { ...state.reader, documentId: null },
    }))
    startAgentCardGenerationMock.mockResolvedValue(makeRun())
    startAgentTaskMock.mockResolvedValue(makeRun('run-task'))
    startKnowledgeQaMock.mockResolvedValue(makeRun('run-qa'))
  })

  it('uses the only available document for card generation when no scope is manually selected', async () => {
    render(<AgentPanel />)

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'generate cards from this document' },
    })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    await waitFor(() => {
      expect(startAgentCardGenerationMock).toHaveBeenCalledWith({
        userRequest: 'generate cards from this document',
        documentIds: ['doc-single'],
        cardCountHint: 6,
        difficulty: 'medium',
      })
    })
    expect(startAgentTaskMock).not.toHaveBeenCalled()
    expect(startKnowledgeQaMock).not.toHaveBeenCalled()
  })
})
