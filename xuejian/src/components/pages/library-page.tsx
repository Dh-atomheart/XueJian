import { useMemo, useState, type ChangeEvent } from 'react'
import { AlertCircle, BookOpen, CheckCircle, ChevronDown, FileText, LayoutList, Layers, MoreHorizontal, RefreshCcw, Search, Tag, Upload, X } from 'lucide-react'
import { Badge, Button, Card, CardContent, EmptyDocuments, EmptySearchResults, InlineError, Input, ParsingBanner, SkeletonDocRow } from '@/components/ui'
import { cn } from '@/lib/utils'

export interface LibraryPageDocument {
  id: string
  title: string
  fileType: string
  pageCount: number | null
  fileSizeLabel: string
  uploadedAtLabel: string
  status: 'uploading' | 'parsed' | 'embedding' | 'ready' | 'embedding_failed' | 'embedding_stale' | 'error'
  description?: string
  tags?: string[]
}

export interface LibraryPageProps {
  documents: LibraryPageDocument[]
  isLoading?: boolean
  onUpload: () => void
  onOpenReader: (documentId: string) => void
  onOpenCards: (documentId: string) => void
}

function PageHeader() {
  return (
    <div className="mb-5">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">DOCUMENT LIBRARY</p>
      <h1 className="mt-1 text-2xl font-medium text-foreground" data-testid="app-shell-page-title">
        文档库
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">按参考编码重建的双栏文档库：列表、状态视图、上传区和详情面板。</p>
    </div>
  )
}

function UploadDropzone({ onClose, onUpload }: { onClose: () => void; onUpload: () => void }) {
  const [dragOver, setDragOver] = useState(false)
  return (
    <div
      className={cn(
        'mb-4 rounded-xl border-2 border-dashed p-6 text-center transition-all',
        dragOver ? 'border-foreground/30 bg-muted/50' : 'border-border/50 bg-card/30'
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={() => setDragOver(false)}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-border/60 bg-muted/40">
          <Upload className="h-5 w-5 text-muted-foreground/60" />
        </div>
        <p className="text-sm font-medium text-foreground">拖拽 PDF 到这里上传</p>
        <p className="text-xs text-muted-foreground">或</p>
        <Button variant="outline" size="sm" className="gap-2 rounded-lg border-border/50" onClick={onUpload}>
          <Upload className="h-3.5 w-3.5" />
          选择文件
        </Button>
      </div>
      <button className="absolute right-3 top-3 rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={onClose}>
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function DocumentStatusBadge({ status }: { status: LibraryPageDocument['status'] }) {
  const config = {
    ready: { label: '已就绪', className: 'bg-chart-1/12 text-chart-1 border-chart-1/20', icon: CheckCircle },
    parsed: { label: '已解析', className: 'bg-chart-1/12 text-chart-1 border-chart-1/20', icon: CheckCircle },
    embedding: { label: '处理中', className: 'bg-chart-5/12 text-chart-5 border-chart-5/20', icon: RefreshCcw },
    uploading: { label: '上传中', className: 'bg-chart-5/12 text-chart-5 border-chart-5/20', icon: RefreshCcw },
    embedding_stale: { label: '待更新', className: 'bg-chart-5/12 text-chart-5 border-chart-5/20', icon: RefreshCcw },
    embedding_failed: { label: '嵌入失败', className: 'bg-destructive/10 text-destructive border-destructive/20', icon: AlertCircle },
    error: { label: '处理失败', className: 'bg-destructive/10 text-destructive border-destructive/20', icon: AlertCircle },
  } as const

  const entry = config[status] ?? config.error
  const Icon = entry.icon
  return (
    <Badge variant="outline" className={cn('gap-1 rounded-md border font-normal text-xs', entry.className)}>
      <Icon className={cn('h-3 w-3', (status === 'embedding' || status === 'uploading') && 'animate-spin')} />
      {entry.label}
    </Badge>
  )
}

function DocumentListItem({
  document,
  isSelected,
  onClick,
}: {
  document: LibraryPageDocument
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3.5 transition-all',
        isSelected ? 'border-foreground/20 bg-card shadow-sm' : 'border-border/40 bg-card/50 hover:border-border/60 hover:bg-card'
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{document.title}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="secondary" className="h-4 rounded px-1 text-[10px] font-normal">
            {document.fileType.toUpperCase()}
          </Badge>
          <span>{document.pageCount ?? '--'} 页</span>
          <span>·</span>
          <span>{document.fileSizeLabel}</span>
        </div>
      </div>
      <DocumentStatusBadge status={document.status} />
    </div>
  )
}

function DocumentList({
  documents,
  isLoading,
  searchQuery,
  selectedId,
  onSelect,
  onUpload,
}: {
  documents: LibraryPageDocument[]
  isLoading: boolean
  searchQuery: string
  selectedId: string | null
  onSelect: (id: string) => void
  onUpload: () => void
}) {
  const processingDoc = useMemo(
    () => documents.find((doc) => doc.status === 'embedding' || doc.status === 'uploading'),
    [documents]
  )

  return (
    <Card className="border-border/40 bg-card/20">
      <CardContent className="p-4">
        {processingDoc ? (
          <div className="mb-3">
            <ParsingBanner filename={processingDoc.title} progress={38} />
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonDocRow key={i} />
            ))}
          </div>
        ) : documents.length === 0 && searchQuery.trim() === '' ? (
          <EmptyDocuments onUpload={onUpload} />
        ) : documents.length === 0 ? (
          <EmptySearchResults query={searchQuery} />
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <DocumentListItem key={doc.id} document={doc} isSelected={selectedId === doc.id} onClick={() => onSelect(doc.id)} />
            ))}
          </div>
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground">共 {documents.length} 个文档</p>
      </CardContent>
    </Card>
  )
}

function DocumentDetailPanel({
  document,
  onOpenReader,
  onOpenCards,
}: {
  document: LibraryPageDocument | null
  onOpenReader: (documentId: string) => void
  onOpenCards: (documentId: string) => void
}) {
  if (!document) {
    return (
      <Card className="border-border/40 bg-card">
        <CardContent className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-border/50">
            <FileText className="h-6 w-6 text-muted-foreground/40" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-muted-foreground">从左侧选择文档查看详情</p>
        </CardContent>
      </Card>
    )
  }

  if (document.status === 'error' || document.status === 'embedding_failed') {
    return (
      <Card className="border-border/40 bg-card">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted/50">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground">{document.title}</h3>
              <div className="mt-2">
                <DocumentStatusBadge status={document.status} />
              </div>
            </div>
          </div>
          <div className="mt-6 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
            <div className="mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive/70 shrink-0" />
              <p className="text-sm font-medium text-foreground">文档处理失败</p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">请检查原文件是否损坏，或者重新导入后再试。</p>
          </div>
          <div className="mt-4">
            <InlineError message="当前文档尚未接通阅读与卡片流程。" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/40 bg-card">
      <CardContent className="p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted/50">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-medium leading-tight text-foreground">{document.title}</h3>
            <div className="mt-1.5 flex items-center gap-2">
              <DocumentStatusBadge status={document.status} />
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {document.pageCount ?? '--'} 页 · {document.fileSizeLabel} · 更新于 {document.uploadedAtLabel}
        </p>
        {document.description ? (
          <div className="mt-5">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">简介</p>
            <p className="text-sm leading-relaxed text-foreground/75">{document.description}</p>
          </div>
        ) : null}
        {document.tags?.length ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {document.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1 rounded-md text-xs font-normal">
                <Tag className="h-3 w-3" />
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="mt-6 flex gap-3">
          <Button className="flex-1 gap-2 rounded-lg" data-testid="library-open-reader" onClick={() => onOpenReader(document.id)} disabled={document.status !== 'ready'}>
            <BookOpen className="h-4 w-4" />
            进入阅读
          </Button>
          <Button variant="outline" className="flex-1 gap-2 rounded-lg" onClick={() => onOpenCards(document.id)} disabled={document.status !== 'ready'}>
            <Layers className="h-4 w-4" />
            卡片工坊
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function LibraryPage(props: LibraryPageProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(props.documents[0]?.id ?? null)

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return props.documents
    return props.documents.filter((doc) => `${doc.title} ${doc.fileType}`.toLowerCase().includes(query))
  }, [props.documents, searchQuery])

  const selectedDocument = filtered.find((doc) => doc.id === selectedId) ?? props.documents.find((doc) => doc.id === selectedId) ?? null

  return (
    <div className="h-full overflow-y-auto p-6">
      <PageHeader />
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={searchQuery} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchQuery(event.target.value)} placeholder="搜索文档标题或类型" className="h-9 rounded-lg border-border/50 bg-card pl-9 text-sm" />
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-2 rounded-lg border-border/50 text-sm">
          全部状态 <ChevronDown className="h-3 w-3" />
        </Button>
        <Button variant="outline" size="sm" className="h-9 gap-1 rounded-lg border-border/50">
          <LayoutList className="h-4 w-4" />
          <span className="text-sm">{filtered.length}</span>
        </Button>
        <Button size="sm" className="h-9 gap-2 rounded-lg" onClick={() => setShowUpload((value) => !value)}>
          <Upload className="h-4 w-4" />
          上传文档
        </Button>
      </div>

      {showUpload ? (
        <div className="relative mb-4">
          <UploadDropzone onClose={() => setShowUpload(false)} onUpload={props.onUpload} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <DocumentList
          documents={filtered}
          isLoading={Boolean(props.isLoading)}
          searchQuery={searchQuery}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onUpload={() => {
            setShowUpload(true)
            props.onUpload()
          }}
        />
        <DocumentDetailPanel document={selectedDocument} onOpenReader={props.onOpenReader} onOpenCards={props.onOpenCards} />
      </div>
    </div>
  )
}
