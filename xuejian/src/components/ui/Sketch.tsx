import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// 手绘风格边框组件
export function SketchBorder({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect()
      setDimensions({ width, height })
    }
  }, [])

  const generateSketchyPath = (w: number, h: number) => {
    const roughness = 1.5
    const points: string[] = []

    points.push(`M ${2 + Math.random() * roughness} ${2 + Math.random() * roughness}`)
    for (let x = 10; x < w - 10; x += 20) {
      points.push(`L ${x + Math.random() * roughness} ${2 + Math.random() * roughness}`)
    }
    points.push(`L ${w - 2 + Math.random() * roughness} ${2 + Math.random() * roughness}`)

    for (let y = 10; y < h - 10; y += 20) {
      points.push(`L ${w - 2 + Math.random() * roughness} ${y + Math.random() * roughness}`)
    }
    points.push(`L ${w - 2 + Math.random() * roughness} ${h - 2 + Math.random() * roughness}`)

    for (let x = w - 10; x > 10; x -= 20) {
      points.push(`L ${x + Math.random() * roughness} ${h - 2 + Math.random() * roughness}`)
    }
    points.push(`L ${2 + Math.random() * roughness} ${h - 2 + Math.random() * roughness}`)

    for (let y = h - 10; y > 10; y -= 20) {
      points.push(`L ${2 + Math.random() * roughness} ${y + Math.random() * roughness}`)
    }
    points.push('Z')

    return points.join(' ')
  }

  return (
    <div ref={containerRef} className={cn('relative', className)} {...props}>
      {dimensions.width > 0 && (
        <svg
          className="pointer-events-none absolute inset-0"
          width={dimensions.width}
          height={dimensions.height}
          style={{ overflow: 'visible' }}
        >
          <path
            d={generateSketchyPath(dimensions.width, dimensions.height)}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.6"
          />
        </svg>
      )}
      {children}
    </div>
  )
}

// 手绘风格圆圈组件
export function SketchCircle({
  children,
  className,
  size = 80,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { size?: number }) {
  const generateCirclePath = (r: number) => {
    const cx = r
    const cy = r
    const roughness = 2
    const points: string[] = []

    for (let i = 0; i <= 360; i += 15) {
      const angle = (i * Math.PI) / 180
      const rx = r - 4 + Math.random() * roughness
      const ry = r - 4 + Math.random() * roughness
      const x = cx + rx * Math.cos(angle)
      const y = cy + ry * Math.sin(angle)

      if (i === 0) {
        points.push(`M ${x} ${y}`)
      } else {
        points.push(`L ${x} ${y}`)
      }
    }
    points.push('Z')

    return points.join(' ')
  }

  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      style={{ width: size, height: size }}
      {...props}
    >
      <svg
        className="pointer-events-none absolute inset-0"
        width={size}
        height={size}
        style={{ overflow: 'visible' }}
      >
        <path
          d={generateCirclePath(size / 2)}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.7"
        />
      </svg>
      {children}
    </div>
  )
}

// 手绘风格按钮
export function SketchButton({
  children,
  className,
  variant = 'default',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost'
}) {
  return (
    <button
      className={cn(
        'relative px-6 py-3 font-medium transition-all duration-200',
        'hover:scale-[1.02] active:scale-[0.98]',
        variant === 'default' && 'bg-ink text-paper-base',
        variant === 'outline' && 'border-2 border-ink/60 text-ink',
        variant === 'ghost' && 'text-ink hover:bg-paper-muted',
        className
      )}
      style={{
        borderRadius: '2px',
        transform: `rotate(${Math.random() * 0.5 - 0.25}deg)`,
      }}
      {...props}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
      {variant === 'outline' && (
        <div
          className="absolute inset-0 border border-ink/20"
          style={{
            borderRadius: '3px',
            transform: `rotate(${Math.random() * 1 - 0.5}deg) translate(1px, 1px)`,
          }}
        />
      )}
    </button>
  )
}

// 手绘风格分隔线
export function SketchDivider({ className }: { className?: string }) {
  const generateLinePath = () => {
    const points: string[] = ['M 0 2']
    for (let x = 20; x <= 100; x += 10) {
      points.push(`L ${x} ${2 + Math.random() * 2 - 1}`)
    }
    return points.join(' ')
  }

  return (
    <svg
      className={cn('h-1 w-full text-ink/30', className)}
      viewBox="0 0 100 4"
      preserveAspectRatio="none"
    >
      <path
        d={generateLinePath()}
        fill="none"
        stroke="currentColor"
        strokeWidth="0.8"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

// 手绘风格卡片
export function SketchCard({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('relative border border-line-soft/60 bg-paper-card p-6 shadow-sm', className)}
      style={{
        borderRadius: '3px',
      }}
      {...props}
    >
      {children}
    </div>
  )
}

// 进度条组件
export function SketchProgress({
  value,
  className,
  label,
}: {
  value: number
  className?: string
  label?: string
}) {
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm text-ink-muted">{label}</span>
          <span className="text-sm font-medium">{value}%</span>
        </div>
      )}
      <div className="relative h-3 overflow-hidden rounded-sm bg-paper-muted">
        <div
          className="absolute inset-y-0 left-0 bg-ink/70 transition-all duration-500"
          style={{ width: `${value}%`, borderRadius: '2px' }}
        />
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
        >
          <line
            x1="0"
            y1="50%"
            x2="100%"
            y2="50%"
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.2"
            strokeDasharray="4 4"
          />
        </svg>
      </div>
    </div>
  )
}
