import { useEffect, useMemo, useState } from 'react'
import { ImportDocumentButton } from '@/components/documents'
import { Button, Input } from '@/components/ui'
import { useDocumentsQuery } from '@/queries'
import { useAppUiStore } from '@/store'
import type { Document } from '@/types'

export function LibraryPage() {
  const { data: documents = [], isLoading } = useDocumentsQuery()
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const openReader = useAppUiStore((state) => state.openReader)
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)

  useEffect(() => {
    if (documents.length === 0) {
      setSelectedDocumentId(null)
      return
    }

    if (!selectedDocumentId || !documents.some((document) => document.id === selectedDocumentId)) {
      setSelectedDocumentId(documents[0].id)
    }
  }, [documents, selectedDocumentId])

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return documents
    }

    return documents.filter((document) =>
      [document.title, document.fileType, document.contentHash]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    )
  }, [documents, searchQuery])

  const selectedDocument =
    filteredDocuments.find((document) => document.id === selectedDocumentId) ??
    documents.find((document) => document.id === selectedDocumentId) ??
    null

  if (!isLoading && documents.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-8 text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">DOCUMENT LIBRARY</p>
        <h2 className="mt-2 text-2xl font-medium text-foreground">文档库还是空的</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          上传第一份文档后，系统会自动解析、生成锚点，并把它带入阅读器、卡片工坊和问答链路。
        </p>
        <div className="mt-6 flex justify-center">
          <ImportDocumentButton
            onImported={(document) => setSelectedDocumentId(document.id)}
            showFeedback
            buttonProps={{ className: 'rounded-lg' }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full">
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <SearchGlyph />
          </span>
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索文档..."
            className="h-9 rounded-lg border-border/50 bg-card pl-9 text-sm shadow-none"
          />
        </div>
        <Button variant="outline" size="sm" className="h-9 rounded-lg border-border/50">
          全部状态
        </Button>
        <Button variant="outline" size="sm" className="h-9 rounded-lg border-border/50">
          最近更新
        </Button>
        <ImportDocumentButton
          onImported={(document) => setSelectedDocumentId(document.id)}
          showFeedback
          buttonProps={{ className: 'h-9 rounded-lg' }}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/60 bg-card p-4">
          <div className="space-y-2">
            {isLoading ? (
              <div className="rounded-xl border border-border/50 bg-background/50 p-4 text-sm text-muted-foreground">
                正在读取文档...
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="rounded-xl border border-border/50 bg-background/50 p-4 text-sm text-muted-foreground">
                没有匹配当前搜索的文档。
              </div>
            ) : (
              filteredDocuments.map((document) => (
                <DocumentListItem
                  key={document.id}
                  document={document}
                  isSelected={selectedDocument?.id === document.id}
                  onClick={() => setSelectedDocumentId(document.id)}
                />
              ))
            )}
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">共 {filteredDocuments.length} 个文档</p>
        </section>

        <DocumentDetailPanel
          document={selectedDocument}
          onOpenReader={() => {
            if (!selectedDocument) return
            openReader(selectedDocument.id, selectedDocument.pageCount ?? 1)
          }}
          onOpenCards={() => setActiveNavItem('cards')}
        />
      </div>
    </div>
  )
}

function DocumentListItem({
  document,
  isSelected,
  onClick,
}: {
  document: Document
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        isSelected
          ? 'flex w-full items-center justify-between rounded-xl border border-foreground/20 bg-card p-4 text-left shadow-sm transition-all'
          : 'flex w-full items-center justify-between rounded-xl border border-border/50 bg-card/50 p-4 text-left transition-all hover:border-border hover:bg-card'
      }
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
          <DocumentGlyph />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{document.title}</p>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px]">{document.fileType.toUpperCase()}</span>
            <span>{document.pageCount ?? '--'} 页</span>
            <span>·</span>
            <span>{formatFileSize(document.fileSize)}</span>
          </div>
        </div>
      </div>
      <DocumentStatusPill status={document.status} />
    </button>
  )
}

function DocumentDetailPanel({
  document,
  onOpenReader,
  onOpenCards,
}: {
  document: Document | null
  onOpenReader: () => void
  onOpenCards: () => void
}) {
  if (!document) {
    return (
      <section className="rounded-2xl border border-border/60 bg-card p-6">
        <div className="flex min-h-[420px] items-center justify-center text-center">
          <div>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground">
              <DocumentGlyph />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">选择一份文档查看详情</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground">
            <DocumentGlyph />
          </div>
          <div>
            <h2 className="text-lg font-medium text-foreground">{document.title}</h2>
            <div className="mt-1 flex items-center gap-2">
              <DocumentStatusPill status={document.status} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <span>{document.pageCount ?? '--'} 页</span>
        <span>·</span>
        <span>{formatFileSize(document.fileSize)}</span>
        <span>·</span>
        <span>{formatDate(document.updatedAt)}</span>
      </div>

      <div className="mt-6 grid grid-cols-4 gap-4">
        <DetailMetric label="页数" value={document.pageCount ?? 0} />
        <DetailMetric label="状态" value={document.status === 'ready' ? 'OK' : '--'} />
        <DetailMetric label="类型" value={document.fileType.toUpperCase()} />
        <DetailMetric label="Hash" value={(document.contentHash ?? '--').slice(0, 8)} />
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-foreground">摘要</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {document.title} 已接入当前工作流。你可以从这里继续阅读正文，或者直接进入卡片工坊继续处理。
        </p>
      </div>

      <div className="mt-8 flex gap-3">
        <Button
          variant="outline"
          className="flex-1 rounded-lg"
          data-testid="library-open-reader"
          disabled={document.status !== 'ready'}
          onClick={onOpenReader}
        >
          进入阅读
        </Button>
        <Button
          variant="outline"
          className="flex-1 rounded-lg"
          disabled={document.status !== 'ready'}
          onClick={onOpenCards}
        >
          卡片工坊
        </Button>
      </div>
    </section>
  )
}

function DocumentStatusPill({ status }: { status: Document['status'] }) {
  const className =
    status === 'ready'
      ? 'bg-chart-1/15 text-chart-1'
      : status === 'error'
        ? 'bg-destructive/15 text-destructive'
        : 'bg-chart-5/15 text-chart-5'

  const label = status === 'ready' ? '已就绪' : status === 'error' ? '异常' : '处理中'

  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${className}`}>{label}</span>
}

function DetailMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
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

function DocumentGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}
