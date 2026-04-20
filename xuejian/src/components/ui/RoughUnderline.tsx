/**
 * RoughUnderline — hand-drawn underline decoration using roughjs.
 *
 * Used sparingly under section headings and key labels for "画龙点睛" effect.
 * Roughness capped at 0.6 per design spec (sketchStyle.maxRoughness).
 */
import { memo, useEffect, useRef } from 'react'
import rough from 'roughjs'
import { cn } from '@/lib/utils'

interface RoughUnderlineProps {
  /** Width of the underline. Defaults to 100% of parent. */
  width?: number
  /** Color of the underline stroke */
  color?: string
  /** Line weight */
  strokeWidth?: number
  roughness?: number
  className?: string
}

export const RoughUnderline = memo(function RoughUnderline({
  width,
  color = 'currentColor',
  strokeWidth = 1.5,
  roughness = 0.5,
  className,
}: RoughUnderlineProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const clampedRoughness = Math.min(roughness, 0.6)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const w = width ?? svg.parentElement?.offsetWidth ?? 120
    const h = 8

    svg.setAttribute('width', String(w))
    svg.setAttribute('height', String(h))
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)

    while (svg.firstChild) svg.removeChild(svg.firstChild)

    const rc = rough.svg(svg)
    const node = rc.line(0, h / 2, w, h / 2, {
      roughness: clampedRoughness,
      stroke: color,
      strokeWidth,
      bowing: 0.8,
    })
    svg.appendChild(node)
  }, [width, color, strokeWidth, clampedRoughness])

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      className={cn('pointer-events-none block opacity-50', className)}
    />
  )
})

RoughUnderline.displayName = 'RoughUnderline'
