export type AiCardDensity = 'low' | 'medium' | 'high'

export interface AiCardGenerationEstimateInput {
  density: AiCardDensity
  pageCount?: number | null
  pageStart?: number | null
  pageEnd?: number | null
}

export interface AiCardGenerationEstimate {
  pageCount: number
  cardCount: number
}

export function effectiveAiCardPageCount(
  pageCount?: number | null,
  pageStart?: number | null,
  pageEnd?: number | null
): number {
  if (
    Number.isInteger(pageStart) &&
    Number.isInteger(pageEnd) &&
    pageStart != null &&
    pageEnd != null &&
    pageStart > 0 &&
    pageEnd >= pageStart
  ) {
    return pageEnd - pageStart + 1
  }

  return pageCount && pageCount > 0 ? pageCount : 1
}

export function estimateAiCardCount(density: AiCardDensity, pageCount: number): number {
  const pages = Math.max(1, pageCount)
  if (density === 'low') return Math.min(40, Math.max(6, Math.ceil(pages * 0.5)))
  if (density === 'high') return Math.min(120, Math.max(20, Math.ceil(pages * 1.5)))
  return Math.min(80, Math.max(12, Math.ceil(pages * 1.0)))
}

export function estimateAiCardGeneration({
  density,
  pageCount,
  pageStart,
  pageEnd,
}: AiCardGenerationEstimateInput): AiCardGenerationEstimate {
  const effectivePageCount = effectiveAiCardPageCount(pageCount, pageStart, pageEnd)
  return {
    pageCount: effectivePageCount,
    cardCount: estimateAiCardCount(density, effectivePageCount),
  }
}
