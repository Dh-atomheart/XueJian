import { createContext } from 'react'
import type { AppThemeId } from '@/types'
import type { appThemeOptions, ResolvedAppThemeId } from './themes'

export interface ThemeContextValue {
  themeId: AppThemeId
  resolvedThemeId: ResolvedAppThemeId
  availableThemes: typeof appThemeOptions
  setThemeId: (themeId: AppThemeId) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
