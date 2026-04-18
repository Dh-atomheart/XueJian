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
    label: '默认纸感',
    description: '保留当前纸面阅读基线，适合长时间学习与批注。',
    preview: {
      paper: '#fbfbf9',
      ink: '#1a1a1a',
      accent: '#f8e16c',
    },
    cssVariables: {
      '--paper-base': '251 251 249',
      '--paper-muted': '245 245 240',
      '--paper-soft': '234 234 229',
      '--paper-card': '255 255 255',
      '--ink': '26 26 26',
      '--ink-muted': '102 102 102',
      '--ink-soft': '160 160 160',
      '--line-soft': '229 229 224',
      '--highlight-yellow': '248 225 108',
      '--highlight-green': '200 230 201',
      '--highlight-blue': '187 222 251',
      '--highlight-pink': '248 187 217',
      '--shadow-paper': '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
      '--shadow-sticky': '0 2px 8px rgba(0,0,0,0.06)',
      '--shadow-card': '0 1px 4px rgba(0,0,0,0.05)',
      '--theme-wash': '248 225 108',
    },
  },
  'comic-sketch': {
    id: 'comic-sketch',
    label: '手绘漫画',
    description: '更暖的纸色、压边墨线和便笺感高光，适合卡片生产与摘录整理。',
    preview: {
      paper: '#f6eedf',
      ink: '#2d1d12',
      accent: '#d9804f',
    },
    cssVariables: {
      '--paper-base': '246 238 223',
      '--paper-muted': '238 228 207',
      '--paper-soft': '224 210 187',
      '--paper-card': '252 246 235',
      '--ink': '45 29 18',
      '--ink-muted': '103 79 62',
      '--ink-soft': '158 136 118',
      '--line-soft': '198 178 153',
      '--highlight-yellow': '246 205 94',
      '--highlight-green': '191 210 156',
      '--highlight-blue': '157 197 219',
      '--highlight-pink': '225 174 173',
      '--shadow-paper': '0 2px 0 rgba(83,55,33,0.08), 0 10px 24px rgba(64,41,23,0.10)',
      '--shadow-sticky': '0 6px 18px rgba(81,50,24,0.14)',
      '--shadow-card': '0 4px 14px rgba(81,50,24,0.10)',
      '--theme-wash': '217 128 79',
    },
  },
  'contrast-paper': {
    id: 'contrast-paper',
    label: '高对比回退',
    description: '提高文字与边界对比度，优先保证阅读器、学习页和设置页的可读性。',
    preview: {
      paper: '#ffffff',
      ink: '#111111',
      accent: '#111111',
    },
    cssVariables: {
      '--paper-base': '255 255 255',
      '--paper-muted': '244 244 244',
      '--paper-soft': '221 221 221',
      '--paper-card': '255 255 255',
      '--ink': '17 17 17',
      '--ink-muted': '51 51 51',
      '--ink-soft': '102 102 102',
      '--line-soft': '86 86 86',
      '--highlight-yellow': '255 227 75',
      '--highlight-green': '171 217 157',
      '--highlight-blue': '145 196 255',
      '--highlight-pink': '255 173 205',
      '--shadow-paper': '0 0 0 1px rgba(17,17,17,0.06)',
      '--shadow-sticky': '0 0 0 1px rgba(17,17,17,0.12)',
      '--shadow-card': '0 8px 22px rgba(17,17,17,0.08)',
      '--theme-wash': '17 17 17',
    },
  },
}

export const appThemeOptions = Object.values(appThemes)

export const themeVariableNames = Object.keys(appThemes.default.cssVariables) as ThemeCssVariableName[]

export function isAppThemeId(value: string): value is AppThemeId {
  return value in appThemes
}

export function resolveAppThemeId(value: string | null | undefined): AppThemeId {
  if (!value) {
    return defaultAppThemeId
  }

  return isAppThemeId(value) ? value : defaultAppThemeId
}

export function resolveAppTheme(value: string | null | undefined): AppThemeDefinition {
  return appThemes[resolveAppThemeId(value)]
}