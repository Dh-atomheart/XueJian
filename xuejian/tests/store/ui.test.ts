import { useAppUiStore } from '@/store'

// @acceptance:m1-a3
describe('useAppUiStore', () => {
  afterEach(() => {
    useAppUiStore.setState({
      activeNavItem: 'home',
      isContextRailOpen: true,
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
