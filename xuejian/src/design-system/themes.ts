import type { AppThemeId } from '@/types'

type ThemeCssVariableName =
  | '--paper-base'
  | '--paper-muted'
  | '--paper-soft'
  | '--paper-card'
  | '--ink'
  | '--ink-muted'
  | '--ink-soft'
  | '--line-soft'
  | '--highlight-yellow'
  | '--highlight-green'
  | '--highlight-blue'
  | '--highlight-pink'
  | '--shadow-paper'
  | '--shadow-sticky'
  | '--shadow-card'
  | '--theme-wash'

export interface AppThemeDefinition {
  id: AppThemeId
  label: string
  description: string
  preview: {
    paper: string
    ink: string
    accent: string
  }
  cssVariables: Record<ThemeCssVariableName, string>
}

export const defaultAppThemeId: AppThemeId = 'default'

export const appThemes: Record<AppThemeId, AppThemeDefinition> = {
  default: {
    id: 'default',
    label: '官方纸感',
    description:
      '对齐重设计稿的单一官方视觉，用更轻的纸面层级和更克制的交互强调长期阅读。',
    preview: {
      paper: '#f7f2ea',
      ink: '#2b2219',
      accent: '#b79263',
    },
    cssVariables: {
      '--paper-base': '247 242 234',
      '--paper-muted': '241 235 226',
      '--paper-soft': '232 224 214',
      '--paper-card': '252 248 242',
      '--ink': '43 34 25',
      '--ink-muted': '106 94 82',
      '--ink-soft': '158 144 129',
      '--line-soft': '223 214 201',
      '--highlight-yellow': '233 212 162',
      '--highlight-green': '203 223 201',
      '--highlight-blue': '204 219 232',
      '--highlight-pink': '232 211 205',
      '--shadow-paper': '0 16px 40px rgba(76, 57, 39, 0.06)',
      '--shadow-sticky': '0 18px 38px rgba(76, 57, 39, 0.08)',
      '--shadow-card': '0 8px 20px rgba(76, 57, 39, 0.05)',
      '--theme-wash': '215 196 165',
    },
  },
}

export const appThemeOptions = Object.values(appThemes)

export const themeVariableNames = Object.keys(appThemes.default.cssVariables) as ThemeCssVariableName[]

export function isAppThemeId(value: string): value is AppThemeId {
  return value === defaultAppThemeId
}

export function resolveAppThemeId(_value?: string | null): AppThemeId {
  return defaultAppThemeId
}

export function resolveAppTheme(_value?: string | null): AppThemeDefinition {
  return appThemes.default
}
