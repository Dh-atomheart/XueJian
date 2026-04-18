import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Document } from '@/types'
import { DocumentStatusBadge } from './DocumentStatusBadge'

interface DocumentListProps {
  documents: Document[]
  selectedDocumentId: string | null
  onSelect: (document: Document) => void
}

export function DocumentList({ documents, selectedDocumentId, onSelect }: DocumentListProps) {
  const scrollElementRef = useRef<HTMLDivElement | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: documents.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => 118,
    overscan: 4,
  })

  const totalSize = rowVirtualizer.getTotalSize()
  const virtualRows = rowVirtualizer.getVirtualItems()
  const statistics = {
    total: documents.length,
    ready: documents.filter((document) => document.status === 'ready').length,
    error: documents.filter((document) => document.status === 'error').length,
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-line-soft bg-white/80 px-6 py-10 text-center">
        <p className="font-ui text-sm text-ink">还没有文档</p>
        <p className="mt-2 text-sm text-ink-soft">
          从左侧导入第一份 PDF，系统会自动完成解析、分块和锚点生成。
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <StatTile label="文档总数" value={statistics.total} />
        <StatTile label="已就绪" value={statistics.ready} />
        <StatTile label="异常" value={statistics.error} />
      </div>

      <div
        ref={scrollElementRef}
        className="h-[560px] overflow-auto rounded-[28px] border border-line-soft bg-white/80"
      >
        <div
          className="relative"
          style={{
            height: `${totalSize}px`,
          }}
        >
          {virtualRows.map((row) => {
            const document = documents[row.index]
            const isSelected = document.id === selectedDocumentId

            return (
              <button
                key={document.id}
                type="button"
                onClick={() => onSelect(document)}
                className={`absolute left-0 top-0 w-full px-4 py-3 text-left transition ${
                  isSelected ? 'bg-paper-muted/80' : 'hover:bg-paper-muted/50'
                }`}
                style={{
                  height: `${row.size}px`,
                  transform: `translateY(${row.start}px)`,
                }}
              >
                <div
                  className={`rounded-[22px] border px-4 py-4 ${
                    isSelected
                      ? 'border-ink/20 bg-paper-base shadow-card'
                      : 'border-line-soft bg-white/90'
                  }`}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-ui text-sm text-ink">{document.title}</p>
                      <p className="mt-1 text-xs text-ink-soft">
                        {document.fileType.toUpperCase()} · {formatFileSize(document.fileSize)} ·{' '}
                        {document.pageCount ?? '--'} 页
                      </p>
                    </div>
                    <DocumentStatusBadge status={document.status} />
                  </div>

                  <div className="flex items-center justify-between gap-3 text-[11px] text-ink-soft">
                    <span>{document.contentHash?.slice(0, 12) ?? 'pending-hash'}</span>
                    <span>{formatDate(document.updatedAt)}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[24px] border border-line-soft bg-white/80 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.24em] text-ink-soft">{label}</p>
      <p className="mt-3 font-display text-2xl text-ink">{value}</p>
    </div>
  )
}

function formatFileSize(size: number | null) {
  if (!size) {
    return '--'
  }

  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
