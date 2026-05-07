import { useContext } from 'react'
import type { AppThemeId } from '@/types'
import { ThemeContext } from './ThemeContext'
import { defaultAppThemeId, defaultResolvedAppThemeId, type ResolvedAppThemeId } from './themes'

/**
 * Reads the currently resolved theme id. Falls back to the default
 * theme when used outside a `ThemeProvider` (e.g. in storybook-style
 * previews or unit tests).
 */
export function useAppThemeId(): AppThemeId {
  const context = useContext(ThemeContext)
  return context?.themeId ?? defaultAppThemeId
}

export function useResolvedAppThemeId(): ResolvedAppThemeId {
  const context = useContext(ThemeContext)
  return context?.resolvedThemeId ?? defaultResolvedAppThemeId
}
