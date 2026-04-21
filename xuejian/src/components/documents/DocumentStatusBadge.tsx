import type { Document } from '@/types'

const statusStyles: Record<Document['status'], string> = {
  uploading: 'border-amber-200 bg-amber-50 text-amber-700',
  parsed: 'border-sky-200 bg-sky-50 text-sky-700',
  embedding: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  embedding_failed: 'border-rose-200 bg-rose-50 text-rose-700',
  embedding_stale: 'border-orange-200 bg-orange-50 text-orange-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
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
