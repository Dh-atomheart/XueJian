import { useEffect, useState, type ReactNode } from 'react'
import { useAppSettingsQuery, useUpdateAppSettingsMutation } from '@/queries/settings'
import {
  appThemeOptions,
  defaultAppThemeId,
  defaultResolvedAppThemeId,
  resolveAppTheme,
  resolveAppThemeId,
  resolveResolvedAppThemeId,
  themeVariableNames,
} from './themes'
import { ThemeContext } from './ThemeContext'

function getSystemPrefersDark() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: settings } = useAppSettingsQuery()
  const updateSettings = useUpdateAppSettingsMutation()
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark)
  const themeId = resolveAppThemeId(settings?.theme ?? defaultAppThemeId)
  const resolvedThemeId = resolveResolvedAppThemeId(themeId, systemPrefersDark)
  const resolvedTheme = resolveAppTheme(themeId, systemPrefersDark)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => setSystemPrefersDark(mediaQuery.matches)

    handleChange()
    mediaQuery.addEventListener?.('change', handleChange)

    return () => {
      mediaQuery.removeEventListener?.('change', handleChange)
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement

    root.dataset.theme = resolvedTheme.id
    root.dataset.themePreference = themeId
    root.classList.toggle('dark', resolvedTheme.id === 'dark')
    root.style.colorScheme = resolvedTheme.colorScheme

    for (const variableName of themeVariableNames) {
      root.style.setProperty(variableName, resolvedTheme.cssVariables[variableName])
    }

    return () => {
      for (const variableName of themeVariableNames) {
        root.style.removeProperty(variableName)
      }

      root.removeAttribute('data-theme')
      root.removeAttribute('data-theme-preference')
      root.classList.remove('dark')
      root.style.removeProperty('color-scheme')
    }
  }, [resolvedTheme, themeId])

  return (
    <ThemeContext.Provider
      value={{
        themeId,
        resolvedThemeId: resolvedThemeId ?? defaultResolvedAppThemeId,
        availableThemes: appThemeOptions,
        setThemeId: (nextThemeId) => updateSettings.mutate({ theme: nextThemeId }),
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}
