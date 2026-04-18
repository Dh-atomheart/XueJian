import { useEffect, useRef, useState } from 'react'
import type { Document } from '@/types'
import { useDocumentAnchorsQuery, useDocumentChunksQuery } from '@/queries'
import { documentCache } from '@/lib/cache/documentCache'
import { documentGateway } from '@/services/gateway/documents'
import { renderPdfPageToCanvas } from '@/services/renderer/pdf'
import { Button, Panel } from '@/components/ui'
import { DocumentStatusBadge } from './DocumentStatusBadge'

interface DocumentPreviewPaneProps {
  document: Document | null
}

export function DocumentPreviewPane({ document }: DocumentPreviewPaneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [previewPage, setPreviewPage] = useState(1)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [isLoadingBinary, setIsLoadingBinary] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const { data: anchors = [] } = useDocumentAnchorsQuery(document?.id ?? null)
  const { data: chunks = [] } = useDocumentChunksQuery(document?.id ?? null)

  useEffect(() => {
    setPreviewPage(1)
  }, [document?.id])

  useEffect(() => {
    let cancelled = false

    if (!document) {
      setBytes(null)
      setRenderError(null)
      return () => {
        cancelled = true
      }
    }

    setIsLoadingBinary(true)
    setRenderError(null)

    void documentGateway
      .readBinary(document.id)
      .then((nextBytes) => {
        if (!cancelled) {
          setBytes(nextBytes)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setBytes(null)
          setRenderError(error instanceof Error ? error.message : '读取文档失败')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingBinary(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [document])

  useEffect(() => {
    let cancelled = false

    async function render() {
      if (!document || !bytes || !canvasRef.current) {
        return
      }

      setIsRendering(true)
      setRenderError(null)
      const canvas = canvasRef.current

      try {
        const cachedThumbnail = await documentCache.getThumbnail(document.id, previewPage)
        if (cancelled) {
          return
        }

        if (cachedThumbnail) {
          await drawCachedThumbnail(canvas, cachedThumbnail.dataUrl)
          return
        }

        await renderPdfPageToCanvas(bytes, previewPage, canvas)
        if (cancelled) {
          return
        }

        await documentCache.setThumbnail(document.id, previewPage, canvas.toDataURL('image/png'))
      } catch (error) {
        if (!cancelled) {
          setRenderError(error instanceof Error ? error.message : '渲染 PDF 预览失败')
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false)
        }
      }
    }

    void render()

    return () => {
      cancelled = true
    }
  }, [bytes, document, previewPage])

  if (!document) {
    return (
      <Panel variant="paperCard" className="h-full rounded-[28px]">
        <div className="flex h-full min-h-[680px] items-center justify-center text-center">
          <div className="max-w-xs space-y-3">
            <p className="font-ui text-base text-ink">选择一份文档</p>
            <p className="text-sm text-ink-soft">
              右侧会展示 PDF 预览、解析状态、锚点数量和首批分块内容。
            </p>
          </div>
        </div>
      </Panel>
    )
  }

  const maxPage = Math.max(1, document.pageCount ?? previewPage)
  const canPreview = document.status !== 'error'
  const previewWarnings = getPreviewWarnings(document)

  return (
    <Panel variant="paperCard" className="h-full rounded-[28px]">
      <div className="flex h-full flex-col gap-5">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.28em] text-ink-soft">Document Deck</p>
              <h3 className="mt-2 truncate font-display text-2xl text-ink">{document.title}</h3>
            </div>
            <DocumentStatusBadge status={document.status} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MetaTile label="页数" value={`${document.pageCount ?? '--'}`} />
            <MetaTile label="锚点" value={`${anchors.length}`} />
            <MetaTile label="分块" value={`${chunks.length}`} />
          </div>
        </div>

        {previewWarnings.length > 0 ? (
          <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {previewWarnings[0]}
          </div>
        ) : null}

        <div className="rounded-[24px] border border-line-soft bg-paper-base px-4 py-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-ui text-sm text-ink">PDF 预览</p>
              <p className="text-xs text-ink-soft">M2 仅提供分页预览和基础缓存</p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={previewPage <= 1}
                onClick={() => setPreviewPage((value) => Math.max(1, value - 1))}
              >
                上一页
              </Button>
              <span className="min-w-16 text-center text-xs text-ink-soft">
                {previewPage} / {maxPage}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={previewPage >= maxPage}
                onClick={() => setPreviewPage((value) => Math.min(maxPage, value + 1))}
              >
                下一页
              </Button>
            </div>
          </div>

          <div className="relative flex min-h-[420px] items-center justify-center overflow-auto rounded-[18px] border border-line-soft bg-white">
            {canPreview ? (
              <canvas
                ref={canvasRef}
                className={`max-w-full transition-opacity ${
                  isLoadingBinary || isRendering || renderError ? 'opacity-0' : 'opacity-100'
                }`}
              />
            ) : null}

            {!canPreview ? (
              <p className="px-6 text-center text-sm text-rose-600">
                文档解析失败，当前无法提供预览。
              </p>
            ) : isLoadingBinary || isRendering ? (
              <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-ink-soft">
                正在生成第 {previewPage} 页预览...
              </p>
            ) : renderError ? (
              <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-rose-600">
                {renderError}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Panel variant="panel" className="rounded-[22px]">
            <p className="mb-3 font-ui text-sm text-ink">首批分块</p>
            {chunks.length === 0 ? (
              <p className="text-sm text-ink-soft">解析完成后，这里会显示可供 M3 复用的内容块。</p>
            ) : (
              <div className="space-y-3">
                {chunks.slice(0, 3).map((chunk) => (
                  <div
                    key={chunk.id}
                    className="rounded-[18px] border border-line-soft bg-white/80 px-3 py-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-ink-soft">
                      <span>Chunk #{chunk.chunkIndex + 1}</span>
                      <span>
                        {chunk.pageStart ?? '--'} - {chunk.pageEnd ?? '--'} 页
                      </span>
                    </div>
                    <p className="max-h-24 overflow-hidden text-sm leading-6 text-ink">
                      {chunk.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel variant="panel" className="rounded-[22px]">
            <p className="mb-3 font-ui text-sm text-ink">锚点样本</p>
            {anchors.length === 0 ? (
              <p className="text-sm text-ink-soft">当前还没有锚点数据。</p>
            ) : (
              <div className="space-y-3">
                {anchors.slice(0, 3).map((anchor) => (
                  <div
                    key={anchor.id}
                    className="rounded-[18px] border border-line-soft bg-white/80 px-3 py-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-ink-soft">
                      <span>
                        第 {anchor.page} 页 · 段落 {anchor.paragraph ?? '--'}
                      </span>
                      <span>{anchor.hash.slice(0, 8)}</span>
                    </div>
                    <p className="max-h-20 overflow-hidden text-sm leading-6 text-ink">
                      {anchor.textQuote}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </Panel>
  )
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-line-soft bg-paper-muted/70 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.22em] text-ink-soft">{label}</p>
      <p className="mt-2 font-display text-xl text-ink">{value}</p>
    </div>
  )
}

async function drawCachedThumbnail(canvas: HTMLCanvasElement, dataUrl: string) {
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas 2D context is not available')
  }

  await new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      canvas.width = image.width
      canvas.height = image.height
      canvas.style.width = `${image.width}px`
      canvas.style.height = `${image.height}px`
      context.clearRect(0, 0, image.width, image.height)
      context.drawImage(image, 0, 0)
      resolve()
    }
    image.onerror = () => reject(new Error('Failed to load cached thumbnail'))
    image.src = dataUrl
  })
}

function getPreviewWarnings(document: Document) {
  const warnings: string[] = []

  if (document.fileSize && document.fileSize > 15 * 1024 * 1024) {
    warnings.push('该 PDF 超过 15MB，预览将优先命中本地缓存。')
  }

  if (document.pageCount && document.pageCount > 200) {
    warnings.push('该 PDF 页数较多，当前界面只提供基础分页预览。')
  }

  return warnings
}
