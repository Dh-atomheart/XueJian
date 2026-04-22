import { useMemo } from 'react'
import { CardContentRenderer } from './CardContentRenderer'
import { cn } from '@/lib/utils'

interface ImageOcclusionZone {
  id?: string
  x: number
  y: number
  width: number
  height: number
  label?: string
}

interface ImageOcclusionPayload {
  image: string
  alt?: string
  prompt?: string
  zones: ImageOcclusionZone[]
}

export interface ImageOcclusionCardContentProps {
  content: string
  revealed?: boolean
  className?: string
  compact?: boolean
}

function normalizeCoordinate(value: number) {
  if (!Number.isFinite(value)) return 0
  if (value > 1) return value / 100
  if (value < 0) return 0
  return value
}

function parseImageOcclusionPayload(content: string): ImageOcclusionPayload | null {
  try {
    const parsed = JSON.parse(content) as Partial<ImageOcclusionPayload>
    if (!parsed || typeof parsed.image !== 'string' || !Array.isArray(parsed.zones)) {
      return null
    }

    const zones: ImageOcclusionZone[] = []

    parsed.zones.forEach((zone, index) => {
      if (!zone || typeof zone !== 'object') {
        return
      }

      const candidate = zone as Partial<ImageOcclusionZone>
      if (
        typeof candidate.x !== 'number' ||
        typeof candidate.y !== 'number' ||
        typeof candidate.width !== 'number' ||
        typeof candidate.height !== 'number'
      ) {
        return
      }

      zones.push({
        id: candidate.id ?? `zone-${index + 1}`,
        x: normalizeCoordinate(candidate.x),
        y: normalizeCoordinate(candidate.y),
        width: normalizeCoordinate(candidate.width),
        height: normalizeCoordinate(candidate.height),
        label: typeof candidate.label === 'string' ? candidate.label : undefined,
      })
    })

    if (zones.length === 0) {
      return null
    }

    return {
      image: parsed.image,
      alt: typeof parsed.alt === 'string' ? parsed.alt : undefined,
      prompt: typeof parsed.prompt === 'string' ? parsed.prompt : undefined,
      zones,
    }
  } catch {
    return null
  }
}

export function ImageOcclusionCardContent({
  content,
  revealed = false,
  className,
  compact = false,
}: ImageOcclusionCardContentProps) {
  const payload = useMemo(() => parseImageOcclusionPayload(content), [content])

  if (!payload) {
    return <CardContentRenderer content={content} className={className} compact={compact} />
  }

  return (
    <div className={cn('space-y-3', className)} data-testid="image-occlusion-card">
      {payload.prompt ? <CardContentRenderer content={payload.prompt} compact={compact} /> : null}
      <div className="relative overflow-hidden rounded-xl border border-line-soft/60 bg-paper-muted/30">
        <div className={cn('relative aspect-[4/3] w-full', compact && 'aspect-[16/11]')}>
          <img
            src={payload.image}
            alt={payload.alt ?? 'Image occlusion card'}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0">
            {payload.zones.map((zone, index) => (
              <div
                key={zone.id ?? index}
                className={cn(
                  'absolute transition-all',
                  revealed
                    ? 'border-2 border-green-500/80 bg-green-500/15'
                    : 'border border-ink/20 bg-paper-base/85 backdrop-blur-[1px]'
                )}
                style={{
                  left: `${zone.x * 100}%`,
                  top: `${zone.y * 100}%`,
                  width: `${zone.width * 100}%`,
                  height: `${zone.height * 100}%`,
                }}
              >
                {revealed && zone.label ? (
                  <span className="absolute left-1 top-1 rounded bg-paper-base/90 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                    {zone.label}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-ink-muted" data-testid="image-occlusion-hint">
        {revealed ? '已显示遮挡区域答案。' : '翻面后显示遮挡区域答案。'}
      </p>
    </div>
  )
}
