/**
 * SketchDivider — hand-drawn horizontal line divider using roughjs.
 *
 * A subtler alternative to the standard Divider for sections where
 * a hand-drawn feel adds warmth without competing for attention.
 * Roughness capped at 0.6 per design spec.
 */
import { memo, useEffect, useRef, useState } from 'react'
import rough from 'roughjs'
import { cn } from '@/lib/utils'

interface SketchDividerProps {
  color?: string
  strokeWidth?: number
  roughness?: number
  className?: string
}

export const SketchDivider = memo(function SketchDivider({
  color = 'currentColor',
  strokeWidth = 0.8,
  roughness = 0.4,
  className,
}: SketchDividerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(0)
  const clampedRoughness = Math.min(roughness, 0.6)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg?.parentElement) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setWidth(entry.contentRect.width)
        }
      }
    })
    observer.observe(svg.parentElement)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || width === 0) return

    const h = 6
    svg.setAttribute('width', String(width))
    svg.setAttribute('height', String(h))
    svg.setAttribute('viewBox', `0 0 ${width} ${h}`)

    while (svg.firstChild) svg.removeChild(svg.firstChild)

    const rc = rough.svg(svg)
    const node = rc.line(0, h / 2, width, h / 2, {
      roughness: clampedRoughness,
      stroke: color,
      strokeWidth,
      bowing: 0.6,
    })
    svg.appendChild(node)
  }, [width, color, strokeWidth, clampedRoughness])

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      className={cn('pointer-events-none block h-1.5 w-full opacity-30', className)}
    />
  )
})

SketchDivider.displayName = 'SketchDivider'
