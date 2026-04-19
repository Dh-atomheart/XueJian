import { useAppUiStore } from '@/store'

// @acceptance:m1-a3
describe('useAppUiStore', () => {
  afterEach(() => {
    useAppUiStore.setState({
      activeNavItem: 'home',
      isContextRailOpen: true,
      feedbackLog: [],
      activeNotices: [],
      isFeedbackPanelOpen: false,
      reader: {
        documentId: null,
        currentPage: 1,
        totalPages: 0,
        scale: 1.25,
        selectedHighlightId: null,
        selectedCardId: null,
      },
    })
  })

  it('tracks navigation state separately from async query state', () => {
    useAppUiStore.getState().setActiveNavItem('library')

    expect(useAppUiStore.getState().activeNavItem).toBe('library')
  })

  it('stores feedback logs and notices centrally', () => {
    useAppUiStore.getState().reportFeedback({
      scope: '测试',
      title: '出现了一个错误',
      detail: '这里是详细信息',
      level: 'error',
    })

    expect(useAppUiStore.getState().feedbackLog).toHaveLength(1)
    expect(useAppUiStore.getState().activeNotices).toHaveLength(1)
  })

  it('toggles context rail state', () => {
    useAppUiStore.getState().setContextRailOpen(false)

    expect(useAppUiStore.getState().isContextRailOpen).toBe(false)
  })

  // @acceptance:v4-4-a3
  it('clears the active reader session when global navigation changes', () => {
    useAppUiStore.getState().openReader('doc-1', 12)

    useAppUiStore.getState().setActiveNavItem('knowledge')

    expect(useAppUiStore.getState().activeNavItem).toBe('knowledge')
    expect(useAppUiStore.getState().reader.documentId).toBeNull()
  })
})
