import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BasicCardsPage } from '@/features/cards/BasicCardsPage'
import { resetMockGatewayState } from '@/services/gateway/mockData'
import { useAppUiStore } from '@/store'

function renderBasicCardsPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <BasicCardsPage />
    </QueryClientProvider>
  )
}

function resetUiState() {
  useAppUiStore.setState({
    activeNavItem: 'cards',
    activeSettingsSection: 'ai',
    preferredCardStudioDocumentId: null,
    preferredBasicCardsDocumentId: null,
    isContextRailOpen: true,
    feedbackLog: [],
    activeNotices: [],
    isFeedbackPanelOpen: false,
    knowledgeDraft: {
      question: null,
      selectedDocumentIds: [],
      sourceLabel: null,
    },
    reader: {
      documentId: null,
      currentPage: 1,
      totalPages: 0,
      scale: 1.25,
      selectedHighlightId: null,
      hoveredHighlightId: null,
      selectedCardId: null,
      annotationScope: 'page',
      isLinkingMode: false,
      linkingCardId: null,
    },
  })
}

beforeEach(() => {
  resetMockGatewayState()
  resetUiState()
  vi.restoreAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('BasicCardsPage', () => {
  it('creates a group and a card, then filters by search', async () => {
    renderBasicCardsPage()

    await screen.findByTestId('basic-card-30303030-3030-4030-8030-303030303030')

    fireEvent.click(screen.getByRole('button', { name: '新建分组' }))
    fireEvent.change(screen.getByLabelText('分组名称'), { target: { value: '手工摘录' } })
    fireEvent.click(screen.getByRole('button', { name: '创建分组' }))

    await waitFor(() => {
      expect(screen.getAllByText('手工摘录').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByRole('button', { name: '新建卡片' })[0])
    const groupSelect = screen.getByLabelText('卡片分组') as HTMLSelectElement
    const groupOption = Array.from(groupSelect.options).find((option) => option.text.includes('手工摘录'))
    fireEvent.change(groupSelect, { target: { value: groupOption?.value } })
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Basic cards 搜索测试' } })
    fireEvent.change(screen.getByLabelText('正面'), {
      target: { value: '为什么 Basic cards 需要保留手工入口？' },
    })
    fireEvent.change(screen.getByLabelText('背面'), {
      target: { value: '因为 AI 生成之外仍然需要人工沉淀和修订。' },
    })
    fireEvent.change(screen.getAllByLabelText('标签')[1], {
      target: { value: 'm04, manual' },
    })
    fireEvent.click(screen.getByRole('button', { name: '创建卡片' }))

    await screen.findByText('Basic cards 搜索测试')

    fireEvent.change(screen.getByLabelText('搜索卡片'), {
      target: { value: 'Basic cards 搜索测试' },
    })

    await waitFor(() => {
      expect(screen.getByText('Basic cards 搜索测试')).toBeInTheDocument()
      expect(screen.queryByTestId('basic-card-30303030-3030-4030-8030-303030303030')).not.toBeInTheDocument()
    })
  })

  it('edits and deletes a basic card from the list', async () => {
    renderBasicCardsPage()

    const card = await screen.findByTestId('basic-card-30303030-3030-4030-8030-303030303030')
    fireEvent.click(within(card).getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '更新后的稳定锚点' } })
    fireEvent.click(screen.getByRole('button', { name: '保存卡片' }))

    await screen.findByText('更新后的稳定锚点')

    const updatedCard = await screen.findByTestId('basic-card-30303030-3030-4030-8030-303030303030')
    fireEvent.click(within(updatedCard).getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(screen.queryByText('更新后的稳定锚点')).not.toBeInTheDocument()
    })
  })

  it('bulk deletes selected cards from the current result set', async () => {
    renderBasicCardsPage()

    const firstCard = await screen.findByTestId('basic-card-30303030-3030-4030-8030-303030303030')
    const secondCard = await screen.findByTestId('basic-card-40404040-4040-4040-8040-404040404040')

    fireEvent.click(within(firstCard).getByRole('checkbox'))
    fireEvent.click(within(secondCard).getByRole('checkbox'))
    fireEvent.click(screen.getByTestId('basic-cards-bulk-delete'))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(screen.queryByTestId('basic-card-30303030-3030-4030-8030-303030303030')).not.toBeInTheDocument()
      expect(screen.queryByTestId('basic-card-40404040-4040-4040-8040-404040404040')).not.toBeInTheDocument()
    })
  })
})
