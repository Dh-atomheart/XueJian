import { useCallback, useEffect, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import MDEditor from '@uiw/react-md-editor'
import { SketchButton } from '@/components/ui/Sketch'
import { cardsGateway } from '@/services/gateway/cards'
import { cn } from '@/lib/utils'
import type { Card, CardMedia } from '@/types'

export interface CardEditorDraft {
  front: string
  back: string
  tags: string[]
  cardType: Card['cardType']
}

export interface CardEditorModalProps {
  /** If provided, opens in edit mode (pre-fills data). Otherwise create mode. */
  card?: Card | null
  initialDraft?: CardEditorDraft | null
  allowedCardTypes?: Card['cardType'][]
  title?: string
  submitLabel?: string
  onSave: (data: {
    front: string
    back: string
    tags: string[]
    cardType: Card['cardType']
    mediaFilePaths: string[]
  }) => void | Promise<void>
  onClose: () => void
  isSaving?: boolean
}

/**
 * Modal for creating / editing a card.
 * Split-pane Markdown editor with live preview (KaTeX supported via react-md-editor).
 */
export function CardEditorModal({
  card,
  initialDraft,
  allowedCardTypes = ['qa', 'cloze', 'fact', 'choice', 'image_occlusion'],
  title,
  submitLabel,
  onSave,
  onClose,
  isSaving = false,
}: CardEditorModalProps) {
  const seed = initialDraft ?? null
  const [front, setFront] = useState(card?.front ?? seed?.front ?? '')
  const [back, setBack] = useState(card?.back ?? seed?.back ?? '')
  const [tagsInput, setTagsInput] = useState(card?.tags.join(', ') ?? seed?.tags.join(', ') ?? '')
  const [cardType, setCardType] = useState<Card['cardType']>(
    card?.cardType ?? seed?.cardType ?? 'qa'
  )
  const [activeField, setActiveField] = useState<'front' | 'back'>('front')
  const [mediaItems, setMediaItems] = useState<CardMedia[]>([])
  const [queuedMediaPaths, setQueuedMediaPaths] = useState<string[]>([])
  const [isLoadingMedia, setIsLoadingMedia] = useState(false)
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)
  const [mediaError, setMediaError] = useState<string | null>(null)

  const isEdit = Boolean(card)
  const resolvedTitle = title ?? (isEdit ? '编辑卡片' : seed ? '编辑候选' : '新建卡片')
  const resolvedSubmitLabel = submitLabel ?? (isEdit ? '保存修改' : seed ? '保存候选' : '创建卡片')

  useEffect(() => {
    if (!card) {
      setMediaItems([])
      return
    }

    let active = true
    setIsLoadingMedia(true)
    setMediaError(null)

    void cardsGateway
      .listCardMedia(card.id)
      .then((items) => {
        if (active) {
          setMediaItems(items)
        }
      })
      .catch(() => {
        if (active) {
          setMediaError('加载媒体列表失败')
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingMedia(false)
        }
      })

    return () => {
      active = false
    }
  }, [card])

  const handleSave = useCallback(() => {
    const trimmedFront = front.trim()
    const trimmedBack = back.trim()
    if (!trimmedFront || !trimmedBack) return

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    void onSave({
      front: trimmedFront,
      back: trimmedBack,
      tags,
      cardType,
      mediaFilePaths: queuedMediaPaths,
    })
  }, [front, back, tagsInput, cardType, onSave, queuedMediaPaths])

  const handlePickMedia = useCallback(async () => {
    try {
      setMediaError(null)
      const selection = await open({
        directory: false,
        multiple: true,
        filters: [
          {
            name: 'Images',
            extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
          },
        ],
      })

      if (!selection) {
        return
      }

      const filePaths = Array.isArray(selection) ? selection : [selection]
      const normalizedPaths = filePaths.filter(
        (value): value is string => typeof value === 'string'
      )
      if (normalizedPaths.length === 0) {
        return
      }

      if (!card) {
        setQueuedMediaPaths((prev) => Array.from(new Set([...prev, ...normalizedPaths])))
        return
      }

      setIsUploadingMedia(true)
      const uploaded = await Promise.all(
        normalizedPaths.map((filePath) => cardsGateway.uploadCardMedia(card.id, filePath))
      )
      setMediaItems((prev) => [...prev, ...uploaded])
    } catch {
      setMediaError('选择或上传媒体失败')
    } finally {
      setIsUploadingMedia(false)
    }
  }, [card])

  const handleDeleteMedia = useCallback(async (id: string) => {
    try {
      setMediaError(null)
      await cardsGateway.deleteCardMedia(id)
      setMediaItems((prev) => prev.filter((item) => item.id !== id))
    } catch {
      setMediaError('删除媒体失败')
    }
  }, [])

  const handleRemoveQueuedMedia = useCallback((filePath: string) => {
    setQueuedMediaPaths((prev) => prev.filter((value) => value !== filePath))
  }, [])

  const canSave = front.trim().length > 0 && back.trim().length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="card-editor-modal"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] mx-4 flex flex-col bg-paper-base rounded-2xl border border-line-soft shadow-lg overflow-hidden animate-fade-in">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-line-soft/60">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-display font-semibold">{resolvedTitle}</h2>
            <select
              value={cardType}
              onChange={(e) => setCardType(e.target.value as Card['cardType'])}
              data-testid="card-editor-type-select"
              aria-label="选择卡片类型"
              title="选择卡片类型"
              className="px-2.5 py-1.5 text-xs bg-paper-muted/50 border border-line-soft/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-ink/10"
            >
              {allowedCardTypes.includes('qa') ? <option value="qa">问答</option> : null}
              {allowedCardTypes.includes('cloze') ? <option value="cloze">完形填空</option> : null}
              {allowedCardTypes.includes('fact') ? <option value="fact">知识点</option> : null}
              {allowedCardTypes.includes('choice') ? <option value="choice">单选题</option> : null}
              {allowedCardTypes.includes('image_occlusion') ? (
                <option value="image_occlusion">图像遮挡</option>
              ) : null}
            </select>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭卡片编辑器"
            title="关闭卡片编辑器"
            className="p-2 rounded-lg hover:bg-paper-muted/50 transition-colors text-ink-muted"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </header>

        {/* Tab bar */}
        <div className="flex gap-1 px-6 pt-3">
          {(['front', 'back'] as const).map((field) => (
            <button
              key={field}
              onClick={() => setActiveField(field)}
              data-testid={`card-editor-tab-${field}`}
              className={cn(
                'px-4 py-2 text-sm rounded-t-lg transition-colors',
                activeField === field
                  ? 'bg-paper-muted/70 font-medium text-ink'
                  : 'text-ink-muted hover:text-ink hover:bg-paper-muted/30'
              )}
            >
              {field === 'front' ? '问题面 (Front)' : '答案面 (Back)'}
            </button>
          ))}
        </div>

        {/* Editor area */}
        <div className="flex-1 min-h-0 px-6 pb-2 overflow-auto" data-color-mode="light">
          <div
            className={cn(activeField !== 'front' && 'hidden')}
            data-testid="card-editor-front-input"
          >
            <MDEditor
              value={front}
              onChange={(v) => setFront(v ?? '')}
              preview="live"
              height={280}
              textareaProps={{
                placeholder:
                  cardType === 'image_occlusion'
                    ? '输入图像遮挡 JSON，例如 {"image":"...","prompt":"指出被遮挡概念","zones":[...]}'
                    : '输入问题... 支持 Markdown 和 $LaTeX$',
              }}
            />
          </div>
          <div
            className={cn(activeField !== 'back' && 'hidden')}
            data-testid="card-editor-back-input"
          >
            <MDEditor
              value={back}
              onChange={(v) => setBack(v ?? '')}
              preview="live"
              height={280}
              textareaProps={{ placeholder: '输入答案... 支持 Markdown 和 $LaTeX$' }}
            />
          </div>
        </div>

        {cardType === 'image_occlusion' && (
          <div
            className="px-6 pb-3 text-xs text-ink-muted"
            data-testid="card-editor-image-occlusion-help"
          >
            `front` 需要填写 JSON，推荐结构：
            {` {"image":"https://.../image.png","prompt":"指出被遮挡部位","zones":[{"x":0.1,"y":0.2,"width":0.2,"height":0.15,"label":"答案"}]}`}
          </div>
        )}

        {/* Tags */}
        <div className="px-6 py-3 border-t border-line-soft/40">
          <label className="block text-xs text-ink-muted mb-1.5">标签（逗号分隔）</label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="例如：数学, 线性代数, 矩阵"
            data-testid="card-editor-tags-input"
            className="w-full px-3 py-2 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ink/10 transition-all"
          />
        </div>

        <div className="px-6 py-3 border-t border-line-soft/40 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-ink-muted">媒体附件</p>
              <p className="text-[11px] text-ink-muted/80">
                {card ? '可为当前卡片上传图片素材。' : '可先选择图片，保存卡片后会自动上传。'}
              </p>
            </div>
            <SketchButton
              variant="outline"
              onClick={handlePickMedia}
              disabled={isSaving || isUploadingMedia}
            >
              {isUploadingMedia ? '上传中...' : '选择图片'}
            </SketchButton>
          </div>

          {mediaError && <p className="text-xs text-red-600">{mediaError}</p>}

          {card ? (
            <div className="space-y-2" data-testid="card-editor-media-list">
              {isLoadingMedia ? (
                <p className="text-xs text-ink-muted">加载媒体中...</p>
              ) : mediaItems.length > 0 ? (
                mediaItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line-soft/50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{item.fileName}</p>
                      <p className="text-[11px] text-ink-muted">{item.mimeType}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteMedia(item.id)}
                      className="text-xs text-ink-muted transition-colors hover:text-red-600"
                    >
                      删除
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-ink-muted">当前没有已上传媒体。</p>
              )}
            </div>
          ) : queuedMediaPaths.length > 0 ? (
            <div className="space-y-2" data-testid="card-editor-media-queue">
              {queuedMediaPaths.map((filePath) => (
                <div
                  key={filePath}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line-soft/50 px-3 py-2"
                >
                  <p className="truncate text-sm text-ink">
                    {filePath.split(/[/\\]/).pop() ?? filePath}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleRemoveQueuedMedia(filePath)}
                    className="text-xs text-ink-muted transition-colors hover:text-red-600"
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-muted">尚未选择任何媒体文件。</p>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-3 px-6 py-4 border-t border-line-soft/60">
          <SketchButton variant="outline" onClick={onClose}>
            取消
          </SketchButton>
          <SketchButton onClick={handleSave} disabled={!canSave || isSaving || isUploadingMedia}>
            {isSaving ? '保存中...' : resolvedSubmitLabel}
          </SketchButton>
        </footer>
      </div>
    </div>
  )
}
