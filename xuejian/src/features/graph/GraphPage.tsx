import { useState, useEffect, useRef, useCallback } from 'react'
import { SketchCard } from '@/components/ui/Sketch'
import { useAppStore } from '@/lib/store'

interface GNode {
  id: string
  label: string
  type: 'document' | 'concept' | 'card'
  x: number
  y: number
  vx: number
  vy: number
  color: string
  radius: number
}

interface GLink {
  source: string
  target: string
}

export function GraphPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodesRef = useRef<GNode[]>([])
  const linksRef = useRef<GLink[]>([])
  const animRef = useRef<number | null>(null)
  const [selectedNode, setSelectedNode] = useState<GNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const { documents, flashcards, groups } = useAppStore()

  useEffect(() => {
    const cx = 400,
      cy = 300
    const nodes: GNode[] = []
    const links: GLink[] = []

    documents.forEach((doc, i) => {
      const angle = (i / Math.max(documents.length, 1)) * Math.PI * 2
      nodes.push({
        id: 'doc-' + doc.id,
        label: doc.name.replace('.pdf', ''),
        type: 'document',
        x: cx + Math.cos(angle) * 150 + (Math.random() - 0.5) * 40,
        y: cy + Math.sin(angle) * 150 + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
        color: '#6b7280',
        radius: 20,
      })
    })

    groups.forEach((group, i) => {
      const angle = (i / Math.max(groups.length, 1)) * Math.PI * 2 + Math.PI / 4
      nodes.push({
        id: 'grp-' + group.id,
        label: group.name,
        type: 'concept',
        x: cx + Math.cos(angle) * 100 + (Math.random() - 0.5) * 30,
        y: cy + Math.sin(angle) * 100 + (Math.random() - 0.5) * 30,
        vx: 0,
        vy: 0,
        color:
          group.color === 'yellow' ? '#eab308' : group.color === 'blue' ? '#3b82f6' : '#22c55e',
        radius: 16,
      })
    })

    flashcards.slice(0, 12).forEach((card, i) => {
      const angle = (i / 12) * Math.PI * 2
      nodes.push({
        id: 'card-' + card.id,
        label: card.front.slice(0, 12),
        type: 'card',
        x: cx + Math.cos(angle) * 220 + (Math.random() - 0.5) * 40,
        y: cy + Math.sin(angle) * 220 + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
        color: '#a3a3a3',
        radius: 10,
      })
      links.push({ source: 'card-' + card.id, target: 'doc-' + card.sourceDocId })
      links.push({ source: 'card-' + card.id, target: 'grp-' + card.groupId })
    })

    nodesRef.current = nodes
    linksRef.current = links
  }, [documents, flashcards, groups])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width,
      h = canvas.height
    ctx.clearRect(0, 0, w, h)

    const nodes = nodesRef.current
    const links = linksRef.current

    // Force simulation step
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x
        const dy = nodes[j].y - nodes[i].y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = 300 / (dist * dist)
        nodes[i].vx -= (dx / dist) * force
        nodes[i].vy -= (dy / dist) * force
        nodes[j].vx += (dx / dist) * force
        nodes[j].vy += (dy / dist) * force
      }
    }

    links.forEach((link) => {
      const s = nodes.find((n) => n.id === link.source)
      const t = nodes.find((n) => n.id === link.target)
      if (s && t) {
        const dx = t.x - s.x,
          dy = t.y - s.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = (dist - 120) * 0.005
        s.vx += (dx / dist) * force
        s.vy += (dy / dist) * force
        t.vx -= (dx / dist) * force
        t.vy -= (dy / dist) * force
      }
    })

    // Center gravity
    nodes.forEach((n) => {
      n.vx += (w / 2 - n.x) * 0.001
      n.vy += (h / 2 - n.y) * 0.001
      n.vx *= 0.9
      n.vy *= 0.9
      n.x += n.vx
      n.y += n.vy
      n.x = Math.max(n.radius, Math.min(w - n.radius, n.x))
      n.y = Math.max(n.radius, Math.min(h - n.radius, n.y))
    })

    // Draw links
    ctx.strokeStyle = '#d4d4d4'
    ctx.lineWidth = 1
    links.forEach((link) => {
      const s = nodes.find((n) => n.id === link.source)
      const t = nodes.find((n) => n.id === link.target)
      if (s && t) {
        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(t.x, t.y)
        ctx.stroke()
      }
    })

    // Draw nodes
    nodes.forEach((n) => {
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
      ctx.fillStyle = hoveredNode === n.id ? '#f59e0b' : n.color
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.fillStyle = '#374151'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(n.label, n.x, n.y + n.radius + 14)
    })

    animRef.current = requestAnimationFrame(draw)
  }, [hoveredNode])

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw)
    return () => {
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current)
      }
    }
  }, [draw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || 800
      canvas.height = canvas.parentElement?.clientHeight || 600
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left,
      y = e.clientY - rect.top
    const clicked = nodesRef.current.find(
      (n) => Math.sqrt((n.x - x) ** 2 + (n.y - y) ** 2) < n.radius + 4
    )
    setSelectedNode(clicked || null)
  }

  const handleCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left,
      y = e.clientY - rect.top
    const hovered = nodesRef.current.find(
      (n) => Math.sqrt((n.x - x) ** 2 + (n.y - y) ** 2) < n.radius + 4
    )
    setHoveredNode(hovered?.id || null)
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="px-6 py-4 border-b border-line-soft">
        <p className="text-xs tracking-[0.3em] text-ink-muted uppercase mb-1 font-ui">
          Knowledge Graph
        </p>
        <h1 className="text-xl font-display font-semibold">知识图谱</h1>
      </div>

      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMove}
          className="w-full h-full cursor-crosshair"
        />

        {/* Legend */}
        <div className="absolute bottom-4 left-4 flex gap-4 text-xs text-ink-muted bg-paper-base/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-line-soft/60">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-gray-500 inline-block" /> 文档
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> 概念
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-gray-400 inline-block" /> 卡片
          </span>
        </div>

        {/* Selected node info */}
        {selectedNode && (
          <div className="absolute top-4 right-4 w-56">
            <SketchCard className="text-sm">
              <p className="font-medium mb-1">{selectedNode.label}</p>
              <p className="text-xs text-ink-muted capitalize">
                {selectedNode.type === 'document'
                  ? '文档'
                  : selectedNode.type === 'concept'
                    ? '概念'
                    : '卡片'}
              </p>
            </SketchCard>
          </div>
        )}
      </div>
    </div>
  )
}
