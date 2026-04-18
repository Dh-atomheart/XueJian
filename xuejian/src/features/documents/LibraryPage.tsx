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

  return (
    <div className="flex flex-col gap-6">
      <Panel variant="panel" className="overflow-hidden rounded-[30px] p-0">
        <div className="grid gap-6 bg-[linear-gradient(135deg,rgba(255,255,255,0.86),rgba(251,251,249,0.92))] px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="space-y-4">
            <div className="inline-flex w-fit items-center rounded-full border border-ink/10 bg-white/70 px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-ink-soft">
              M2 Document Intake
            </div>
            <div className="max-w-2xl space-y-3">
              <h1 className="font-display text-4xl leading-tight text-ink">
                把 PDF 送进本地文档库，然后稳定地产出 chunk 与 anchor。
              </h1>
              <p className="max-w-xl text-sm leading-6 text-ink-muted">
                这里是 M2 的工作台。导入动作会完成文件复制、内容 hash、PDF
                解析、段落锚点生成和分块落库， 后续 M3 与 M4 直接复用这些产物。
              </p>
            </div>
          </div>

          <div className="relative rounded-[26px] border border-ink/10 bg-white/80 px-5 py-5 shadow-card">
            <div className="absolute right-5 top-5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-amber-800">
              PDF only
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-ink-soft">Import Rail</p>
                <p className="mt-2 font-ui text-lg text-ink">文档导入与解析</p>
              </div>

              <ImportDocumentButton
                onImported={(document) => {
                  setSelectedDocumentId(document.id)
                }}
                showFeedback
                buttonProps={{
                  variant: 'sketch',
                  className: 'w-full justify-center',
                }}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <InfoPill label="状态流" value="uploading → parsed → ready" />
                <InfoPill label="命名策略" value="hash 前缀 + 原始标题" />
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)]">
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-ink-soft">Library Shelf</p>
              <h2 className="mt-2 font-ui text-xl text-ink">文档清单</h2>
            </div>
            <p className="text-sm text-ink-soft">{documents.length} 份文档</p>
          </div>

          {isLoading ? (
            <Panel variant="paperCard" className="rounded-[28px] py-16 text-center text-ink-soft">
              正在读取文档列表...
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
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-ink-soft">Inspection Desk</p>
              <h2 className="mt-2 font-ui text-xl text-ink">解析详情</h2>
            </div>
            <Button
              variant="sketch"
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

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-line-soft bg-paper-muted/70 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">{label}</p>
      <p className="mt-2 text-sm text-ink">{value}</p>
    </div>
  )
}
