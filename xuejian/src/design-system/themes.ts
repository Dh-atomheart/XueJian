import type { AppThemeId } from '@/types'

export type ResolvedAppThemeId = Exclude<AppThemeId, 'system'>

type ThemeCssVariableName =
  | '--surface-app'
  | '--surface-muted'
  | '--surface-card'
  | '--surface-elevated'
  | '--surface-reader'
  | '--surface-reader-page'
  | '--text-primary'
  | '--text-secondary'
  | '--text-tertiary'
  | '--text-inverse'
  | '--border-default'
  | '--border-subtle'
  | '--accent-primary'
  | '--success'
  | '--warning'
  | '--danger'
  | '--info'
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
  | '--highlight-orange'
  | '--shadow-paper'
  | '--shadow-sticky'
  | '--shadow-card'
  | '--theme-wash'
  | '--body-spot-opacity'
  | '--body-wash-opacity'
  | '--paper-texture-sheen'
  | '--paper-texture-grain'
  | '--scrollbar-track'
  | '--scrollbar-thumb'
  | '--scrollbar-thumb-hover'
  | '--selection-bg'
  | '--selection-fg'
  | '--reader-highlight-fill'
  | '--reader-highlight-stroke'
  | '--overlay-backdrop'
  | '--background'
  | '--foreground'
  | '--card'
  | '--card-foreground'
  | '--popover'
  | '--popover-foreground'
  | '--primary'
  | '--primary-foreground'
  | '--secondary'
  | '--secondary-foreground'
  | '--muted'
  | '--muted-foreground'
  | '--accent'
  | '--accent-foreground'
  | '--destructive'
  | '--destructive-foreground'
  | '--border'
  | '--input'
  | '--ring'
  | '--chart-1'
  | '--chart-2'
  | '--chart-3'
  | '--chart-4'
  | '--chart-5'
  | '--sidebar-bg'
  | '--sidebar-fg'
  | '--sidebar-primary'
  | '--sidebar-primary-foreground'
  | '--sidebar-accent'
  | '--sidebar-accent-foreground'
  | '--sidebar-border'
  | '--sidebar-ring'

export interface AppThemeDefinition {
  id: ResolvedAppThemeId
  label: string
  description: string
  colorScheme: 'light' | 'dark'
  preview: {
    paper: string
    ink: string
    accent: string
  }
  cssVariables: Record<ThemeCssVariableName, string>
}

export interface AppThemeOption {
  id: AppThemeId
  label: string
  description: string
}

export const defaultAppThemeId: AppThemeId = 'light'
export const defaultResolvedAppThemeId: ResolvedAppThemeId = 'light'

export const appThemes: Record<ResolvedAppThemeId, AppThemeDefinition> = {
  light: {
    id: 'light',
    label: 'Light',
    description: '暖纸张、低对比边界、长时间阅读友好的默认主题。',
    colorScheme: 'light',
    preview: {
      paper: '#f7f2ea',
      ink: '#2b2219',
      accent: '#7f6041',
    },
    cssVariables: {
      '--surface-app': '247 242 234',
      '--surface-muted': '241 235 226',
      '--surface-card': '252 248 242',
      '--surface-elevated': '255 252 247',
      '--surface-reader': '238 233 221',
      '--surface-reader-page': '255 255 252',
      '--text-primary': '43 34 25',
      '--text-secondary': '106 94 82',
      '--text-tertiary': '142 128 113',
      '--text-inverse': '252 248 242',
      '--border-default': '213 203 190',
      '--border-subtle': '226 217 205',
      '--accent-primary': '127 96 65',
      '--success': '81 130 86',
      '--warning': '161 118 45',
      '--danger': '184 69 73',
      '--info': '79 120 158',
      '--paper-base': '247 242 234',
      '--paper-muted': '241 235 226',
      '--paper-soft': '232 224 214',
      '--paper-card': '252 248 242',
      '--ink': '43 34 25',
      '--ink-muted': '106 94 82',
      '--ink-soft': '142 128 113',
      '--line-soft': '223 214 201',
      '--highlight-yellow': '233 212 162',
      '--highlight-green': '203 223 201',
      '--highlight-blue': '204 219 232',
      '--highlight-pink': '232 211 205',
      '--highlight-orange': '236 195 148',
      '--shadow-paper': '0 16px 40px rgba(76, 57, 39, 0.06)',
      '--shadow-sticky': '0 18px 38px rgba(76, 57, 39, 0.08)',
      '--shadow-card': '0 8px 20px rgba(76, 57, 39, 0.05)',
      '--theme-wash': '215 196 165',
      '--body-spot-opacity': '0.7',
      '--body-wash-opacity': '0.42',
      '--paper-texture-sheen': '255 255 255 / 0.26',
      '--paper-texture-grain': '58 49 38 / 0.015',
      '--scrollbar-track': '241 235 226',
      '--scrollbar-thumb': '223 214 201',
      '--scrollbar-thumb-hover': '142 128 113',
      '--selection-bg': '43 34 25 / 0.12',
      '--selection-fg': '43 34 25',
      '--reader-highlight-fill': '233 212 162 / 0.22',
      '--reader-highlight-stroke': '43 34 25 / 0.32',
      '--overlay-backdrop': '24 22 20 / 0.42',
      '--background': '247 242 234',
      '--foreground': '43 34 25',
      '--card': '252 248 242',
      '--card-foreground': '43 34 25',
      '--popover': '255 252 247',
      '--popover-foreground': '43 34 25',
      '--primary': '43 34 25',
      '--primary-foreground': '252 248 242',
      '--secondary': '241 235 226',
      '--secondary-foreground': '43 34 25',
      '--muted': '241 235 226',
      '--muted-foreground': '106 94 82',
      '--accent': '232 224 214',
      '--accent-foreground': '43 34 25',
      '--destructive': '184 69 73',
      '--destructive-foreground': '255 255 255',
      '--border': '223 214 201',
      '--input': '223 214 201',
      '--ring': '127 96 65',
      '--chart-1': '81 130 86',
      '--chart-2': '161 118 45',
      '--chart-3': '79 120 158',
      '--chart-4': '178 93 111',
      '--chart-5': '184 109 64',
      '--sidebar-bg': '241 235 226',
      '--sidebar-fg': '43 34 25',
      '--sidebar-primary': '43 34 25',
      '--sidebar-primary-foreground': '252 248 242',
      '--sidebar-accent': '252 248 242',
      '--sidebar-accent-foreground': '43 34 25',
      '--sidebar-border': '223 214 201',
      '--sidebar-ring': '127 96 65',
    },
  },
  dark: {
    id: 'dark',
    label: 'Dark',
    description: '深色管理区、克制边界、Reader 低眩光，不做简单反色。',
    colorScheme: 'dark',
    preview: {
      paper: '#191714',
      ink: '#eee4d6',
      accent: '#d4a96d',
    },
    cssVariables: {
      '--surface-app': '21 21 19',
      '--surface-muted': '29 28 25',
      '--surface-card': '35 33 29',
      '--surface-elevated': '42 39 34',
      '--surface-reader': '26 24 21',
      '--surface-reader-page': '223 214 199',
      '--text-primary': '239 231 218',
      '--text-secondary': '194 181 164',
      '--text-tertiary': '142 130 114',
      '--text-inverse': '24 22 20',
      '--border-default': '68 62 53',
      '--border-subtle': '52 48 42',
      '--accent-primary': '212 169 109',
      '--success': '135 178 126',
      '--warning': '220 176 91',
      '--danger': '223 111 116',
      '--info': '129 170 209',
      '--paper-base': '21 21 19',
      '--paper-muted': '29 28 25',
      '--paper-soft': '45 41 35',
      '--paper-card': '35 33 29',
      '--ink': '239 231 218',
      '--ink-muted': '194 181 164',
      '--ink-soft': '142 130 114',
      '--line-soft': '68 62 53',
      '--highlight-yellow': '156 126 55',
      '--highlight-green': '83 118 82',
      '--highlight-blue': '75 106 136',
      '--highlight-pink': '133 81 93',
      '--highlight-orange': '151 97 57',
      '--shadow-paper': '0 18px 48px rgba(0, 0, 0, 0.26)',
      '--shadow-sticky': '0 20px 58px rgba(0, 0, 0, 0.28)',
      '--shadow-card': '0 10px 28px rgba(0, 0, 0, 0.22)',
      '--theme-wash': '91 76 56',
      '--body-spot-opacity': '0.28',
      '--body-wash-opacity': '0.2',
      '--paper-texture-sheen': '255 246 224 / 0.035',
      '--paper-texture-grain': '0 0 0 / 0.12',
      '--scrollbar-track': '29 28 25',
      '--scrollbar-thumb': '68 62 53',
      '--scrollbar-thumb-hover': '142 130 114',
      '--selection-bg': '212 169 109 / 0.28',
      '--selection-fg': '239 231 218',
      '--reader-highlight-fill': '220 176 91 / 0.24',
      '--reader-highlight-stroke': '239 231 218 / 0.28',
      '--overlay-backdrop': '0 0 0 / 0.64',
      '--background': '21 21 19',
      '--foreground': '239 231 218',
      '--card': '35 33 29',
      '--card-foreground': '239 231 218',
      '--popover': '42 39 34',
      '--popover-foreground': '239 231 218',
      '--primary': '239 231 218',
      '--primary-foreground': '24 22 20',
      '--secondary': '45 41 35',
      '--secondary-foreground': '239 231 218',
      '--muted': '45 41 35',
      '--muted-foreground': '194 181 164',
      '--accent': '56 50 42',
      '--accent-foreground': '239 231 218',
      '--destructive': '223 111 116',
      '--destructive-foreground': '24 22 20',
      '--border': '68 62 53',
      '--input': '68 62 53',
      '--ring': '212 169 109',
      '--chart-1': '135 178 126',
      '--chart-2': '220 176 91',
      '--chart-3': '129 170 209',
      '--chart-4': '210 133 151',
      '--chart-5': '213 145 89',
      '--sidebar-bg': '29 28 25',
      '--sidebar-fg': '239 231 218',
      '--sidebar-primary': '239 231 218',
      '--sidebar-primary-foreground': '24 22 20',
      '--sidebar-accent': '35 33 29',
      '--sidebar-accent-foreground': '239 231 218',
      '--sidebar-border': '68 62 53',
      '--sidebar-ring': '212 169 109',
    },
  },
}

export const appThemeOptions: AppThemeOption[] = [
  {
    id: 'light',
    label: 'Light',
    description: '默认暖纸张主题。',
  },
  {
    id: 'dark',
    label: 'Dark',
    description: '深色低眩光主题。',
  },
  {
    id: 'system',
    label: 'System',
    description: '跟随系统外观偏好。',
  },
]

export const themeVariableNames = Object.keys(
  appThemes.light.cssVariables
) as ThemeCssVariableName[]

export function isAppThemeId(value: string): value is AppThemeId {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function resolveAppThemeId(value?: string | null): AppThemeId {
  const normalized = value?.trim()
  if (normalized === 'default') {
    return defaultAppThemeId
  }
  return normalized && isAppThemeId(normalized) ? normalized : defaultAppThemeId
}

export function resolveSystemThemeId(prefersDark: boolean): ResolvedAppThemeId {
  return prefersDark ? 'dark' : 'light'
}

export function resolveResolvedAppThemeId(
  value?: string | null,
  prefersDark = false
): ResolvedAppThemeId {
  const themeId = resolveAppThemeId(value)
  return themeId === 'system' ? resolveSystemThemeId(prefersDark) : themeId
}

export function resolveAppTheme(value?: string | null, prefersDark = false): AppThemeDefinition {
  return appThemes[resolveResolvedAppThemeId(value, prefersDark)]
}
