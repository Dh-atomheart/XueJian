/**
 * RoughCircleNumber — hand-drawn circle highlight around a number or short text.
 *
 * Used for today's study count, streak numbers, and key statistics.
 * Renders a rough ellipse around the content for emphasis.
 * Roughness capped at 0.6 per design spec.
 */
import { memo, useEffect, useRef, useState } from 'react'
import rough from 'roughjs'
import { cn } from '@/lib/utils'

interface RoughCircleNumberProps {
  children: React.ReactNode
  /** Stroke color for the circle */
  color?: string
  strokeWidth?: number
  roughness?: number
  /** Padding around content before drawing the ellipse */
  padding?: number
  className?: string
}

export const RoughCircleNumber = memo(function RoughCircleNumber({
  children,
  color = 'currentColor',
  strokeWidth = 1.5,
  roughness = 0.5,
  padding = 8,
  className,
}: RoughCircleNumberProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 })
  const clampedRoughness = Math.min(roughness, 0.6)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          setDimensions({ w: width, h: height })
        }
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || dimensions.w === 0) return

    const w = dimensions.w + padding * 2
    const h = dimensions.h + padding * 2

    svg.setAttribute('width', String(w))
    svg.setAttribute('height', String(h))
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)

    while (svg.firstChild) svg.removeChild(svg.firstChild)

    const rc = rough.svg(svg)
    const node = rc.ellipse(w / 2, h / 2, w - 4, h - 4, {
      roughness: clampedRoughness,
      stroke: color,
      strokeWidth,
      fill: 'none',
      bowing: 1.2,
    })
    svg.appendChild(node)
  }, [dimensions, color, strokeWidth, clampedRoughness, padding])

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg
        ref={svgRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -m-2 overflow-visible opacity-50"
      />
      <div ref={containerRef}>{children}</div>
    </div>
  )
})

RoughCircleNumber.displayName = 'RoughCircleNumber'
