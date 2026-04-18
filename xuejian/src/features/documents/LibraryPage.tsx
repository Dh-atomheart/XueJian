import { useEffect, useState } from 'react'
import type { Document } from '@/types'
import { useDocumentsQuery } from '@/queries'
import { DocumentList, DocumentPreviewPane, ImportDocumentButton } from '@/components/documents'
import { Button, Panel } from '@/components/ui'
import { useAppUiStore } from '@/store'

export function LibraryPage() {
  const { data: documents = [], isLoading } = useDocumentsQuery()
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const openReader = useAppUiStore((state) => state.openReader)

  useEffect(() => {
    if (documents.length === 0) {
      setSelectedDocumentId(null)
      return
    }

    const selectedDocumentStillExists = documents.some(
      (document) => document.id === selectedDocumentId
    )

    if (!selectedDocumentStillExists) {
      setSelectedDocumentId(documents[0].id)
    }
  }, [documents, selectedDocumentId])

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? null

  // Empty state
  if (!isLoading && documents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Panel variant="paperCard" className="max-w-md rounded-[24px] p-8 text-center">
          <div className="mb-4 text-4xl">📄</div>
          <h2 className="mb-2 font-display text-xl text-ink">文档库是空的</h2>
          <p className="mb-6 text-sm leading-relaxed text-ink-muted">
            上传第一份 PDF 文档，系统会自动解析内容、生成段落锚点和学习卡片。
          </p>
          <ImportDocumentButton
            onImported={(document) => {
              setSelectedDocumentId(document.id)
            }}
            showFeedback
            buttonProps={{
              variant: 'default',
              className: 'mx-auto',
            }}
          />
          <p className="mt-4 text-xs text-ink-soft">目前支持 PDF 格式</p>
        </Panel>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* 顶部：标题 + 上传 + 搜索区 */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-ui text-xl text-ink">文档库</h1>
          <p className="mt-0.5 text-sm text-ink-muted">{documents.length} 份文档</p>
        </div>
        <ImportDocumentButton
          onImported={(document) => {
            setSelectedDocumentId(document.id)
          }}
          showFeedback
          buttonProps={{
            variant: 'default',
          }}
        />
      </div>

      {/* 文档列表 + 预览 */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <section>
          {isLoading ? (
            <Panel variant="paperCard" className="rounded-[24px] py-16 text-center text-ink-soft">
              正在读取文档列表…
            </Panel>
          ) : (
            <DocumentList
              documents={documents}
              selectedDocumentId={selectedDocumentId}
              onSelect={(document: Document) => {
                setSelectedDocumentId(document.id)
              }}
            />
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-ui text-base text-ink">文档详情</h2>
            <Button
              variant="sketch"
              size="sm"
              disabled={!selectedDocument || selectedDocument.status !== 'ready'}
              onClick={() => {
                if (!selectedDocument) {
                  return
                }

                openReader(selectedDocument.id, selectedDocument.pageCount ?? 1)
              }}
            >
              进入阅读
            </Button>
          </div>

          <DocumentPreviewPane document={selectedDocument} />
        </section>
      </div>
    </div>
  )
}
