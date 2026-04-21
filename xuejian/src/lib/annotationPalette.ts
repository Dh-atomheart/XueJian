export const ANNOTATION_PALETTE = [
  { name: '黄', hex: '#F8E16C', cssVar: '--highlight-yellow' },
  { name: '蓝', hex: '#BBDEFB', cssVar: '--highlight-blue' },
  { name: '绿', hex: '#C8E6C9', cssVar: '--highlight-green' },
  { name: '粉', hex: '#F8BBD9', cssVar: '--highlight-pink' },
] as const

export type AnnotationPaletteEntry = (typeof ANNOTATION_PALETTE)[number]

export function getAnnotationColor(pageCardIndex: number) {
  return ANNOTATION_PALETTE[((pageCardIndex % ANNOTATION_PALETTE.length) + ANNOTATION_PALETTE.length) % ANNOTATION_PALETTE.length].hex
}

export function getAnnotationPaletteEntry(color: string) {
  return ANNOTATION_PALETTE.find((entry) => entry.hex.toLowerCase() === color.toLowerCase())
}

export function getAnnotationSwatchClass(color: string) {
  const entry = getAnnotationPaletteEntry(color)

  switch (entry?.cssVar) {
    case '--highlight-blue':
      return 'bg-highlight-blue'
    case '--highlight-green':
      return 'bg-highlight-green'
    case '--highlight-pink':
      return 'bg-highlight-pink'
    case '--highlight-yellow':
    default:
      return 'bg-highlight-yellow'
  }
}