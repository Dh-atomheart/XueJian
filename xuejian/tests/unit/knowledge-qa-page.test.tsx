import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  getKnowledgeQaDisplayError,
  KnowledgeQaPage,
  type KnowledgeQaPageProps,
} from '@/components/pages/knowledge-qa-page'

function makeProps(overrides: Partial<KnowledgeQaPageProps> = {}): KnowledgeQaPageProps {
  return {
    question: 'What is spaced repetition?',
    documents: [{ id: 'doc-ready', title: 'Ready document', status: 'ready' }],
    selectedDocumentIds: [],
    conversations: [
      {
        id: 'conversation-1',
        title: 'Study conversation',
        documentIds: ['doc-ready'],
        createdAt: new Date('2026-05-01T08:00:00Z'),
        updatedAt: new Date('2026-05-02T08:00:00Z'),
      },
    ],
    activeConversationId: 'conversation-1',
    turns: [],
    citations: [],
    searchResults: [],
    isSubmitting: false,
    hasConfiguration: true,
    submitDisabledReason: null,
    serviceWarningTitle: null,
    serviceWarningMessage: null,
    isRestartingService: false,
    onQuestionChange: vi.fn(),
    onSubmit: vi.fn(),
    onRetryQuestion: vi.fn(),
    onCancelQuestion: vi.fn(),
    onToggleDocument: vi.fn(),
    onClearDocuments: vi.fn(),
    onUsePrompt: vi.fn(),
    onOpenCitation: vi.fn(),
    onSelectConversation: vi.fn(),
    onNewConversation: vi.fn(),
    onDeleteConversation: vi.fn(),
    onDeleteTurn: vi.fn(),
    onRestartService: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  }
}

describe('KnowledgeQaPage error handling', () => {
  it('renders the page shell', () => {
    render(<KnowledgeQaPage {...makeProps()} />)

    expect(screen.getByTestId('knowledge-qa-page')).toBeInTheDocument()
  })

  it('maps provider and JSON errors to readable action messages', () => {
    expect(getKnowledgeQaDisplayError('provider_timeout: Knowledge Q&A request exceeded 120 seconds')).toBe(
      'Model request timed out. Try a smaller document scope or a more reliable provider.'
    )
    expect(getKnowledgeQaDisplayError('invalid_json')).toBe(
      'Model returned invalid JSON. Retry; if it repeats, switch models or simplify the question.'
    )
    expect(getKnowledgeQaDisplayError('provider_validation_failed: Field required; Extra inputs are not permitted')).toBe(
      'Model response failed workflow schema validation. Retry or switch to a model that follows structured JSON better.'
    )
  })

  it('shows normalized workflow failure text in error turns', () => {
    render(
      <KnowledgeQaPage
        {...makeProps({
          turns: [
            {
              id: 'turn-error',
              question: 'why did it fail?',
              answer: null,
              answerMode: null,
              retrievalStatus: null,
              status: 'error',
              errorMessage: 'provider_timeout: Knowledge Q&A request exceeded 120 seconds',
              citations: [],
            },
          ],
        })}
      />
    )

    expect(
      screen.getByText('Model request timed out. Try a smaller document scope or a more reliable provider.')
    ).toBeInTheDocument()
  })
})