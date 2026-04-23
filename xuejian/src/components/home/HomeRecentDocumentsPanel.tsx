import { DocumentStatusBadge } from '@/components/documents'
import { Button, Panel, RoughUnderline } from '@/components/ui'
import type { Document } from '@/types'

interface HomeRecentDocumentsPanelProps {
  documents: Document[]
  isLoading: boolean
  onViewAll: () => void
  onOpenDocument: (document: Document) => void
}

export function HomeRecentDocumentsPanel({
  documents,
  isLoading,
  onViewAll,
  onOpenDocument,
}: HomeRecentDocumentsPanelProps) {
  return (
    <Panel
      variant="paperCard"
      className="space-y-5 p-6 md:p-7"
      data-testid="home-recent-documents-panel"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">
            Continue Session
          </p>
          <h2 className="mt-2 font-ui text-xl text-ink">最近文档</h2>
          <RoughUnderline width={88} color="rgb(var(--ink-soft))" strokeWidth={1} className="mt-1" />
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            从最近一次阅读与导入继续。桌面版会优先把可继续操作的文档放在首页主区，而不是只显示一个手机列表。
          </p>
        </div>

        <Button variant="ghost" size="sm" className="rounded-full" onClick={onViewAll}>
          查看全部
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="flex animate-pulse items-center gap-3 rounded-[22px] border border-line-soft/70 bg-paper-base/70 px-4 py-4"
            >
              <div className="h-10 w-10 rounded-[16px] bg-paper-muted" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-40 rounded-full bg-paper-muted" />
                <div className="h-3 w-24 rounded-full bg-paper-muted" />
              </div>
              <div className="h-6 w-16 rounded-full bg-paper-muted" />
            </div>
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-line-soft bg-paper-base/60 px-5 py-8 text-center text-sm leading-7 text-ink-muted">
          还没有可继续的文档。导入第一份 PDF 后，首页会自动把它放到这里。
        </div>
      ) : (
        <ul className="space-y-3">
          {documents.map((document) => (
            <li key={document.id}>
              <button
                type="button"
                className="group flex w-full items-center gap-4 rounded-[24px] border border-line-soft/75 bg-paper-base/82 px-4 py-4 text-left shadow-paper transition hover:-translate-y-[1px] hover:border-ink/16 hover:bg-paper-card"
                onClick={() => onOpenDocument(document)}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-line-soft bg-paper-card text-ink-muted">
                  <DocumentIcon className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-ui text-sm text-ink">{document.title}</p>
                    <DocumentStatusBadge status={document.status} />
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    {document.fileType.toUpperCase()} · {document.pageCount ?? '--'} 页 ·{' '}
                    {document.status === 'ready' ? '可直接继续阅读' : '仍在处理中'}
                  </p>
                </div>

                <div className="shrink-0 text-xs text-ink-muted transition-transform group-hover:translate-x-0.5">
                  {document.status === 'ready' ? '继续 →' : '查看 →'}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  )
}
