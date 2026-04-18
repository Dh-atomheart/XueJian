import { createContext } from 'react'
import type { AppThemeId } from '@/types'
import type { appThemeOptions } from './themes'

export interface ThemeContextValue {
  themeId: AppThemeId
  availableThemes: typeof appThemeOptions
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
