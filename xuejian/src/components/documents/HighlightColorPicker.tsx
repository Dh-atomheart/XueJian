import { cn } from '@/lib/utils'

const HIGHLIGHT_COLORS = [
  { name: '黄色', value: '#F8E16C', cssVar: 'highlight-yellow' },
  { name: '绿色', value: '#C8E6C9', cssVar: 'highlight-green' },
  { name: '蓝色', value: '#BBDEFB', cssVar: 'highlight-blue' },
  { name: '粉色', value: '#F8BBD9', cssVar: 'highlight-pink' },
] as const

export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]['value']

interface HighlightColorPickerProps {
  value: HighlightColor
  onChange: (color: HighlightColor) => void
  className?: string
}

export function HighlightColorPicker({ value, onChange, className }: HighlightColorPickerProps) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color.value}
          type="button"
          title={color.name}
          aria-label={`高亮颜色：${color.name}`}
          className={cn(
            'h-5 w-5 rounded-full border-2 transition-all',
            value === color.value
              ? 'border-ink/40 scale-110 shadow-sm'
              : 'border-transparent hover:border-ink/20 hover:scale-105'
          )}
          style={{ backgroundColor: color.value }}
          onClick={() => onChange(color.value)}
        />
      ))}
    </div>
  )
}

export { HIGHLIGHT_COLORS }
