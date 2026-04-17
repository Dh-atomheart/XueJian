import { create } from 'zustand'

export type NavItemId = 'home' | 'library' | 'learning' | 'settings'

interface AppUiState {
  activeNavItem: NavItemId
  isContextRailOpen: boolean
  setActiveNavItem: (item: NavItemId) => void
  setContextRailOpen: (open: boolean) => void
}

export const useAppUiStore = create<AppUiState>((set) => ({
  activeNavItem: 'home',
  isContextRailOpen: true,
  setActiveNavItem: (activeNavItem) => set({ activeNavItem }),
  setContextRailOpen: (isContextRailOpen) => set({ isContextRailOpen }),
}))
