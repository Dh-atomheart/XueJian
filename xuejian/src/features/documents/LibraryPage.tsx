import { useMemo } from 'react'
import { LibraryPage as LibraryPageView } from '@/components/pages/library-page'
import { useDocumentsQuery } from '@/queries'
import { useAppUiStore } from '@/store'
import type { Document } from '@/types'

export function LibraryPage() {
  const { data: documents = [], isLoading } = useDocumentsQuery()
  const openReader = useAppUiStore((state) => state.openReader)
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)

  const viewDocuments = useMemo(() => documents.map(mapDocumentToView), [documents])

  return (
    <LibraryPageView
      documents={viewDocuments}
      isLoading={isLoading}
      onUpload={() => setActiveNavItem('library')}
      onOpenReader={(documentId) => {
        const document = documents.find((item) => item.id === documentId)
        if (!document) return
        openReader(document.id, document.pageCount ?? 1)
      }}
      onOpenCards={() => setActiveNavItem('cards')}
    />
  )
}

function mapDocumentToView(document: Document) {
  return {
    id: document.id,
    title: document.title,
    fileType: document.fileType,
    pageCount: document.pageCount,
    fileSizeLabel: formatFileSize(document.fileSize),
    uploadedAtLabel: formatDate(document.updatedAt),
    status: document.status,
    description: '当前文档已经接入真实业务数据源，可直接进入阅读或卡片工坊。',
    tags: [document.fileType.toUpperCase(), document.status],
  }
}

function formatFileSize(size: number | null) {
  if (!size) return '--'
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
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
