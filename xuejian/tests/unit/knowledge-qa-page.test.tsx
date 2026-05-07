import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  getKnowledgeQaDisplayError,
  KnowledgeQaPage,
  type KnowledgeQaPageProps,
} from '@/components/pages/knowledge-qa-page'

function makeProps(overrides: Partial<KnowledgeQaPageProps> = {}): KnowledgeQaPageProps {
  return {
    question: '什么是间隔重复？',
    documents: [
      {
        id: 'doc-ready',
        title: '已向量化文档',
        status: 'ready',
      },
    ],
    selectedDocumentIds: [],
    conversations: [
      {
        id: 'conversation-1',
        title: '间隔重复讨论',
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
    onRestartService: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  }
}

describe('KnowledgeQaPage M14 polish', () => {
  it('shows conversation history and starts a new conversation', () => {
    const onNewConversation = vi.fn()
    const onSelectConversation = vi.fn()

    render(
      <KnowledgeQaPage
        {...makeProps({
          onNewConversation,
          onSelectConversation,
        })}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '新建对话' }))
    fireEvent.click(screen.getByRole('button', { name: /间隔重复讨论/ }))

    expect(onNewConversation).toHaveBeenCalledTimes(1)
    expect(onSelectConversation).toHaveBeenCalledWith('conversation-1')
  })

  it('allows ready documents to be selected and submitted', async () => {
    const onToggleDocument = vi.fn()
    const onSubmit = vi.fn()

    render(
      <KnowledgeQaPage
        {...makeProps({
          selectedDocumentIds: ['doc-ready'],
          onToggleDocument,
          onSubmit,
        })}
      />
    )

    fireEvent.keyDown(screen.getByRole('button', { name: /范围/ }), { key: 'Enter' })
    expect(await screen.findByTestId('knowledge-qa-scope-menu')).toBeInTheDocument()
    expect(screen.getByText('已向量化')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /已向量化文档/ }))
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }))

    expect(onToggleDocument).toHaveBeenCalledWith('doc-ready')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('shows unavailable document states and blocks submit without disabling editing', async () => {
    const onSubmit = vi.fn()

    render(
      <KnowledgeQaPage
        {...makeProps({
          documents: [
            { id: 'doc-ready', title: '已向量化文档', status: 'ready' },
            { id: 'doc-missing', title: '未向量化文档', status: 'embedding_missing' },
            { id: 'doc-stale', title: '过期文档', status: 'embedding_stale' },
            { id: 'doc-failed', title: '失败文档', status: 'embedding_failed' },
          ],
          selectedDocumentIds: ['doc-stale'],
          submitDisabledReason: '“过期文档”的向量已过期，请重新生成向量后再提问。',
          onSubmit,
        })}
      />
    )

    fireEvent.keyDown(screen.getByRole('button', { name: /范围/ }), { key: 'Enter' })
    expect(await screen.findByTestId('knowledge-qa-scope-menu')).toBeInTheDocument()
    expect(screen.getByText('未向量化')).toBeInTheDocument()
    expect(screen.getByText('向量过期')).toBeInTheDocument()
    expect(screen.getByText('向量失败')).toBeInTheDocument()
    expect(screen.getByText('“过期文档”的向量已过期，请重新生成向量后再提问。')).toBeInTheDocument()

    const input = screen.getByRole('textbox')
    expect(input).not.toBeDisabled()
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows all-documents scope when no document is selected', () => {
    render(<KnowledgeQaPage {...makeProps({ selectedDocumentIds: [] })} />)

    expect(screen.getByRole('button', { name: /范围 全部/ })).toBeInTheDocument()
  })

  it('renders citations as superscript badges with hover details', async () => {
    const onOpenCitation = vi.fn()

    render(
      <KnowledgeQaPage
        {...makeProps({
          turns: [
            {
              id: 'turn-1',
              question: '核心结论是什么？',
              answer: '直接答案。\n\n要点解释：资料给出了明确依据。',
              answerMode: 'grounded',
              retrievalStatus: 'ready',
              status: 'answered',
              errorMessage: null,
              citations: [
                {
                  id: 'citation-1',
                  documentId: 'doc-ready',
                  documentTitle: '已向量化文档',
                  pageLabel: 'P.12',
                  snippet: '相关内容片段',
                },
              ],
            },
          ],
          citations: [
            {
              id: 'citation-1',
              documentId: 'doc-ready',
              documentTitle: '已向量化文档',
              pageLabel: 'P.12',
              snippet: '相关内容片段',
            },
          ],
          onOpenCitation,
        })}
      />
    )

    const citationBadge = screen.getByRole('button', { name: '引用 1' })
    expect(citationBadge).toBeInTheDocument()
    const citationCard = await screen.findByTestId('knowledge-qa-citation-card')
    expect(citationCard).toHaveClass('whitespace-normal')
    expect(citationCard).toHaveClass('break-words')
    expect(citationCard.parentElement).toHaveClass('max-h-80')
    expect(citationCard.parentElement).toHaveClass('overflow-y-auto')
    expect(await screen.findByText('P.12')).toBeInTheDocument()
    expect(screen.getByText('相关内容片段')).toBeInTheDocument()
    expect(screen.queryByText(/打开文档|在文档中查看|打开/)).not.toBeInTheDocument()
    expect(onOpenCitation).not.toHaveBeenCalled()
  })

  it('renders a compact turn index and scrolls to indexed messages', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    render(
      <KnowledgeQaPage
        {...makeProps({
          turns: [
            {
              id: 'turn-indexed',
              question: '核心结论是什么？',
              answer: '直接答案。',
              answerMode: 'grounded',
              retrievalStatus: 'ready',
              status: 'answered',
              errorMessage: null,
              citations: [],
            },
          ],
        })}
      />
    )

    const userIndex = screen.getByRole('button', { name: '我：核心结论是' })
    const assistantIndex = screen.getByRole('button', { name: 'AI：直接答案。' })

    const indexRail = screen.getByTestId('knowledge-qa-turn-index')
    expect(indexRail).toHaveClass('w-8')
    expect(indexRail.firstElementChild).toHaveClass('justify-center')
    expect(userIndex).toHaveClass('h-[3px]')
    expect(userIndex).toHaveClass('w-4')
    fireEvent.focus(userIndex)
    expect((await screen.findAllByText('我：核心结论是')).length).toBeGreaterThan(0)
    fireEvent.click(assistantIndex)

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' })
  })

  it('renders cancelled turns as neutral stopped state', () => {
    render(
      <KnowledgeQaPage
        {...makeProps({
          turns: [
            {
              id: 'turn-cancelled',
              question: '这个问题先停一下',
              answer: 'Answer stopped.',
              answerMode: null,
              retrievalStatus: null,
              status: 'cancelled',
              errorMessage: 'Cancelled by user',
              citations: [],
            },
          ],
        })}
      />
    )

    expect(screen.getByText('回答已停止，历史已保留。')).toBeInTheDocument()
    expect(screen.queryByText('正在检索资料并生成回答')).not.toBeInTheDocument()
    expect(screen.queryByText('重试')).not.toBeInTheDocument()
  })

  it('does not show fake sources for no relevant content answers', () => {
    render(
      <KnowledgeQaPage
        {...makeProps({
          turns: [
            {
              id: 'turn-no-evidence',
              question: '资料里有这个开放域事实吗？',
              answer: '当前资料中没有足够证据回答这个问题。',
              answerMode: 'no_relevant_content',
              retrievalStatus: 'no_hits',
              status: 'answered',
              errorMessage: null,
              citations: [],
            },
          ],
          citations: [],
        })}
      />
    )

    expect(screen.getByText('当前资料中没有足够证据回答这个问题。')).toBeInTheDocument()
    expect(screen.getByText('当前资料不足以回答')).toBeInTheDocument()
    expect(screen.queryByText(/引用来源/)).not.toBeInTheDocument()
  })

  it('maps provider and JSON errors to readable Chinese messages', () => {
    expect(getKnowledgeQaDisplayError('provider_timeout: Knowledge Q&A request exceeded 120 seconds')).toBe(
      '模型响应超时，请稍后重试。'
    )
    expect(getKnowledgeQaDisplayError('invalid_json')).toBe(
      '模型返回格式无效，请重试；如果持续出现，请更换模型或降低问题复杂度。'
    )

    render(
      <KnowledgeQaPage
        {...makeProps({
          turns: [
            {
              id: 'turn-error',
              question: '为什么失败？',
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

    expect(screen.getByText('模型响应超时，请稍后重试。')).toBeInTheDocument()
  })
})
