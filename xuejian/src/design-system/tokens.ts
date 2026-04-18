/**
 * 默认设计Token - 极简学术感 + 中度手绘漫画风格
 * 基于 spec.md §2.2.1 定义
 */

export const themeTokens = {
  colors: {
    paperBase: '#fbfbf9',
    paperMuted: '#f5f5f0',
    paperSoft: '#eaeae5',
    paperCard: '#ffffff',
    ink: '#1a1a1a',
    inkMuted: '#666666',
    inkSoft: '#a0a0a0',
    lineSoft: '#e5e5e0',
    highlight: {
      yellow: '#F8E16C',
      green: '#C8E6C9',
      blue: '#BBDEFB',
      pink: '#F8BBD9',
    },
  },
  typography: {
    fontDisplay: 'Kose, Xiaolai, serif',
    fontUi: 'Yozai, sans-serif',
    fontBody: 'LXGW WenKai, serif',
    fontLatinMeta: 'Inter, sans-serif',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
  },
  borders: {
    hairline: '0.5px solid',
    thin: '1px solid',
    sketch: '2px',
  },
  shadows: {
    paper: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
    sticky: '0 2px 8px rgba(0,0,0,0.06)',
    card: '0 1px 4px rgba(0,0,0,0.05)',
  },
  textures: {
    paperGrain: '/textures/paper-grain.png',
    scribbleOverlay: '/textures/scribble-overlay.png',
  },
  iconStyle: 'hand-drawn-monoline' as const,
}

export type ThemeTokens = typeof themeTokens

export const sketchStyle = {
  lineWeight: ['hairline', 'thin', 'medium'] as const,
  roughness: 0.5,
  underlineStyle: ['pencil', 'marker'] as const,
  scribbleOpacity: 0.1,
}

export type SketchStyle = typeof sketchStyle

export type SurfaceVariant = 'canvas' | 'panel' | 'paperCard' | 'stickyNote' | 'toolbar' | 'modal'

export type PageShellVariant = 'dashboard' | 'library' | 'reader' | 'review' | 'settings'

/**
 * Surface样式配置
 */
export const surfaceStyles: Record<SurfaceVariant, {
  bg: string
  border?: string
  shadow?: string
  padding?: string
}> = {
  canvas: {
    bg: 'bg-paper-base',
    padding: 'p-4',
  },
  panel: {
    bg: 'bg-paper-muted',
    border: 'border border-line-soft',
    shadow: 'shadow-paper',
    padding: 'p-4',
  },
  paperCard: {
    bg: 'bg-paper-card',
    border: 'border border-line-soft',
    shadow: 'shadow-card',
    padding: 'p-4',
  },
  stickyNote: {
    bg: 'bg-highlight-yellow/30',
    border: 'border border-ink-soft/20',
    shadow: 'shadow-sticky',
    padding: 'p-3',
  },
  toolbar: {
    bg: 'bg-paper-muted',
    border: 'border-b border-line-soft',
    padding: 'px-4 py-2',
  },
  modal: {
    bg: 'bg-paper-card',
    border: 'border border-line-soft',
    shadow: 'shadow-lg',
    padding: 'p-6',
  },
}
