import { useEffect, useMemo, useState } from 'react'
import {
  DocumentList,
  DocumentPreviewPane,
  ImportDocumentButton,
} from '@/components/documents'
import { Button, Input, Panel } from '@/components/ui'
import { useDocumentsQuery } from '@/queries'
import { useAppUiStore } from '@/store'
import type { Document } from '@/types'
import { ReaderPage } from './ReaderPage'

export function LibraryPage() {
  const readerDocumentId = useAppUiStore((state) => state.reader.documentId)
  const openReader = useAppUiStore((state) => state.openReader)
  const { data: documents = [], isLoading } = useDocumentsQuery()
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return documents
    }

    return documents.filter((document) => {
      const haystack = [document.title, document.fileType, document.contentHash]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [documents, searchQuery])

  useEffect(() => {
    if (selectedDocumentId && documents.some((document) => document.id === selectedDocumentId)) {
      return
    }

    setSelectedDocumentId(documents[0]?.id ?? null)
  }, [documents, selectedDocumentId])

  useEffect(() => {
    if (filteredDocuments.length === 0) {
      return
    }

    if (!selectedDocumentId || !filteredDocuments.some((document) => document.id === selectedDocumentId)) {
      setSelectedDocumentId(filteredDocuments[0].id)
    }
  }, [filteredDocuments, selectedDocumentId])

  const selectedDocument = useMemo<Document | null>(
    () => documents.find((document) => document.id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId]
  )

  const readyCount = documents.filter((document) => document.status === 'ready').length

  if (readerDocumentId) {
    return <ReaderPage documentId={readerDocumentId} />
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6" data-testid="library-page">
      <Panel variant="panel" className="rounded-[32px]">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-ink-soft">Document Library</p>
            <h1 className="mt-3 font-display text-3xl text-ink">文档入口与阅读工作台</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
              这里负责导入 PDF、查看解析状态，并把已就绪文档送入三栏阅读器。阅读、贴笺和 AI 卡片从同一份源文档继续向前走。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
            <LibraryMetric label="文档总数" value={`${documents.length}`} />
            <LibraryMetric label="已就绪" value={`${readyCount}`} />
            <LibraryMetric label="当前筛选" value={`${filteredDocuments.length}`} />
          </div>
        </div>
      </Panel>

      <div className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
        <Panel variant="paperCard" className="flex min-h-0 flex-col rounded-[32px]">
          <div className="flex flex-col gap-4 border-b border-line-soft pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">Ingress</p>
                <h2 className="mt-2 font-ui text-lg text-ink">导入与筛选</h2>
              </div>
              <ImportDocumentButton
                idleLabel="导入 PDF"
                buttonProps={{ variant: 'default', size: 'sm' }}
                onImported={(document) => {
                  setSelectedDocumentId(document.id)
                }}
              />
            </div>

            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索标题、类型或内容哈希..."
              data-testid="library-search-input"
            />
          </div>

          <div className="mt-5 min-h-0 flex-1">
            {isLoading ? (
              <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-ink-soft">
                正在载入文档库...
              </div>
            ) : (
              <DocumentList
                documents={filteredDocuments}
                selectedDocumentId={selectedDocumentId}
                onSelect={(document) => setSelectedDocumentId(document.id)}
              />
            )}
          </div>
        </Panel>

        <div className="flex min-h-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">Preview</p>
              <h2 className="mt-2 font-ui text-lg text-ink">预览与阅读器入口</h2>
            </div>

            <Button
              variant="default"
              data-testid="library-open-reader"
              disabled={!selectedDocument || selectedDocument.status !== 'ready'}
              onClick={() => {
                if (!selectedDocument) {
                  return
                }

                openReader(selectedDocument.id, selectedDocument.pageCount ?? 0)
              }}
            >
              进入阅读器
            </Button>
          </div>

          <div className="min-h-0 flex-1">
            <DocumentPreviewPane document={selectedDocument} />
          </div>
        </div>
      </div>
    </div>
  )
}

function LibraryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-line-soft bg-paper-base/80 px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">{label}</p>
      <p className="mt-2 font-display text-2xl text-ink">{value}</p>
    </div>
  )
}
