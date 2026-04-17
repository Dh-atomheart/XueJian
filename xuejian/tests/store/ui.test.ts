import { useAppUiStore } from '@/store'

describe('useAppUiStore', () => {
  afterEach(() => {
    useAppUiStore.setState({
      activeNavItem: 'home',
      isContextRailOpen: true,
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
})
