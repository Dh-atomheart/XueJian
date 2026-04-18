import { createContext, useEffect, type ReactNode } from 'react'
import { useAppSettingsQuery } from '@/queries'
import { type AppThemeId } from '@/types'
import {
  appThemeOptions,
  defaultAppThemeId,
  resolveAppTheme,
  resolveAppThemeId,
  themeVariableNames,
} from './themes'

interface ThemeContextValue {
  themeId: AppThemeId
  availableThemes: typeof appThemeOptions
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: settings } = useAppSettingsQuery()
  const resolvedTheme = resolveAppTheme(settings?.theme)

  useEffect(() => {
    const root = document.documentElement

    root.dataset.theme = resolvedTheme.id

    for (const variableName of themeVariableNames) {
      root.style.setProperty(variableName, resolvedTheme.cssVariables[variableName])
    }

    return () => {
      for (const variableName of themeVariableNames) {
        root.style.removeProperty(variableName)
      }

      root.removeAttribute('data-theme')
    }
  }, [resolvedTheme])

  return (
    <ThemeContext.Provider
      value={{
        themeId: resolveAppThemeId(settings?.theme ?? defaultAppThemeId),
        availableThemes: appThemeOptions,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}