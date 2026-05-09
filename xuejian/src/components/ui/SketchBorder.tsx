/**
 * SketchBorder — decorative rough-line border using roughjs.
 *
 * Renders an SVG rectangle with hand-drawn styling. Intentionally decorative;
 * never used for interactive feedback or accessibility-critical surfaces.
 *
 * roughness is capped at 0.6 per design spec (tokens: sketchStyle.roughness = 0.5)
 */
import { useEffect, useRef } from 'react'
import rough from 'roughjs'
import { cn } from '@/lib/utils'

export type SketchBorderVariant = 'card' | 'divider' | 'empty-state'

interface SketchBorderProps {
  variant?: SketchBorderVariant
  /** Must not exceed 0.6 — design spec roughness cap */
  roughness?: number
  className?: string
  children?: React.ReactNode
}

const VARIANT_OPTS: Record<
  SketchBorderVariant,
  { stroke: string; strokeWidth: number; fill: string; bowing: number }
> = {
  card: {
    stroke: 'currentColor',
    strokeWidth: 1.5,
    fill: 'none',
    bowing: 1,
  },
  divider: {
    stroke: 'currentColor',
    strokeWidth: 1,
    fill: 'none',
    bowing: 0.5,
  },
  'empty-state': {
    stroke: 'currentColor',
    strokeWidth: 1.25,
    fill: 'none',
    bowing: 1.5,
  },
}

export function SketchBorder({
  variant = 'card',
  roughness = 0.5,
  className,
  children,
}: SketchBorderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Clamp roughness to design spec max
  const clampedRoughness = Math.min(roughness, 0.6)
  const opts = VARIANT_OPTS[variant]

  useEffect(() => {
    const container = containerRef.current
    const svg = svgRef.current
    if (!container || !svg) return

    const { width, height } = container.getBoundingClientRect()
    if (width === 0 || height === 0) return

    svg.setAttribute('width', String(width))
    svg.setAttribute('height', String(height))
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)

    // Clear previous render
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    const rc = rough.svg(svg)
    const pad = opts.strokeWidth + 1
    const node = rc.rectangle(pad, pad, width - pad * 2, height - pad * 2, {
      roughness: clampedRoughness,
      stroke: opts.stroke,
      strokeWidth: opts.strokeWidth,
      fill: opts.fill,
      bowing: opts.bowing,
    })
    svg.appendChild(node)
  }, [clampedRoughness, opts])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* SVG sits on top of children as pointer-events:none overlay */}
      <svg
        ref={svgRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible opacity-60"
      />
      {children}
    </div>
  )
}
