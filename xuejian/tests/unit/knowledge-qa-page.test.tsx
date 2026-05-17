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

  it('renders stable cite markers as inline rounded citation badges', () => {
    render(
      <KnowledgeQaPage
        {...makeProps({
          turns: [
            {
              id: 'turn-cited',
              question: 'compare the sources',
              answer: 'First claim [[cite:5]]. Second claim [[cite:1,3]].',
              answerMode: 'grounded',
              retrievalStatus: 'ready',
              status: 'answered',
              errorMessage: null,
              citations: [
                {
                  id: 'citation-1',
                  documentId: 'doc-1',
                  documentTitle: 'Document one',
                  passageIndex: 5,
                  pageLabel: 'P.6',
                  snippet: 'Source one excerpt',
                },
                {
                  id: 'citation-2',
                  documentId: 'doc-2',
                  documentTitle: 'Document two',
                  passageIndex: 1,
                  pageLabel: 'P.4',
                  snippet: 'Source two excerpt',
                },
                {
                  id: 'citation-3',
                  documentId: 'doc-3',
                  documentTitle: 'Document three',
                  passageIndex: 3,
                  pageLabel: 'P.9',
                  snippet: 'Source three excerpt',
                },
              ],
            },
          ],
        })}
      />
    )

    expect(screen.queryByText(/\[\[cite:/i)).not.toBeInTheDocument()
    expect(screen.getAllByTestId('knowledge-qa-citation-badge')).toHaveLength(3)
    expect(screen.getByLabelText('引用 1')).toBeInTheDocument()
    expect(screen.getByLabelText('引用 2')).toBeInTheDocument()
    expect(screen.getByLabelText('引用 3')).toBeInTheDocument()
  })

  it('keeps common legacy source labels as a fallback parser', () => {
    render(
      <KnowledgeQaPage
        {...makeProps({
          turns: [
            {
              id: 'turn-mixed-citations',
              question: 'what is fine tuning?',
              answer:
                'Weights (Source 1, 3). Format [Ref: 2]. Safety \u3010\u5F15\u7528 4\u3011. Extra (Passage 1, 6).',
              answerMode: 'grounded',
              retrievalStatus: 'ready',
              status: 'answered',
              errorMessage: null,
              citations: Array.from({ length: 6 }, (_, index) => ({
                id: `citation-${index + 1}`,
                documentId: `doc-${index + 1}`,
                documentTitle: `Document ${index + 1}`,
                passageIndex: index + 1,
                pageLabel: `P.${index + 1}`,
                snippet: `Source excerpt ${index + 1}`,
              })),
            },
          ],
        })}
      />
    )

    expect(screen.queryByText(/passage/i)).not.toBeInTheDocument()
    expect(screen.getAllByTestId('knowledge-qa-citation-badge')).toHaveLength(7)
    expect(screen.getAllByLabelText('引用 1')).toHaveLength(2)
    expect(screen.getByLabelText('引用 2')).toBeInTheDocument()
    expect(screen.getByLabelText('引用 3')).toBeInTheDocument()
    expect(screen.getByLabelText('引用 4')).toBeInTheDocument()
    expect(screen.getByLabelText('引用 6')).toBeInTheDocument()
  })
})
