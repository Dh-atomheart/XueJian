import type { Document } from '@/types'

const statusStyles: Record<Document['status'], string> = {
  uploading: 'border-themeAccent-warning/30 bg-themeAccent-warning/10 text-ink',
  parsed: 'border-themeAccent-info/30 bg-themeAccent-info/10 text-ink',
  embedding: 'border-themeAccent-info/30 bg-themeAccent-info/10 text-ink',
  ready: 'border-themeAccent-success/30 bg-themeAccent-success/10 text-ink',
  embedding_failed: 'border-destructive/30 bg-destructive/10 text-destructive',
  embedding_stale: 'border-themeAccent-warning/30 bg-themeAccent-warning/10 text-ink',
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
}

const statusLabels: Record<Document['status'], string> = {
  uploading: '上传中',
  parsed: '已解析',
  embedding: '向量化中',
  ready: '可用',
  embedding_failed: '向量化失败',
  embedding_stale: '向量已过期',
  error: '异常',
}

interface DocumentStatusBadgeProps {
  status: Document['status']
}

export function DocumentStatusBadge({ status }: DocumentStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  )
}
