import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { convertFileSrc } from '@tauri-apps/api/core'
import { AnimationRenderer } from '@/components/cards/AnimationRenderer'
import { Button } from '@/components/ui'
import {
  useCardAnimationQuery,
  useDeleteCardAnimationMutation,
  useStartCardAnimationMutation,
} from '@/queries'
import { isTauriEnvironment } from '@/services/gateway'
import type { CardAnimation } from '@/types'

interface AnimationPreviewModalProps {
  cardId: string
  cardFront: string
  initialMode?: 'quick_preview' | 'video_render'
  onClose: () => void
}

const LIVE_STATUSES = new Set(['queued', 'generating'])

export function AnimationPreviewModal({
  cardId,
  cardFront,
  initialMode = 'quick_preview',
  onClose,
}: AnimationPreviewModalProps) {
  const [mode, setMode] = useState<'quick_preview' | 'video_render'>(initialMode)
  const startMutation = useStartCardAnimationMutation()
  const deleteMutation = useDeleteCardAnimationMutation()

  const { data: animation, isLoading } = useCardAnimationQuery(cardId, {
    refetchInterval: (query) => {
      const status = (query.state.data as CardAnimation | null | undefined)?.status
      return status && LIVE_STATUSES.has(status) ? 1500 : false
    },
  })

  useEffect(() => {
    if (isLoading) return
    if (animation === null || animation?.mode !== mode) {
      startMutation.mutate({ cardId, mode })
    }
  }, [animation, cardId, isLoading, mode, startMutation])

  const resolvedMode = animation?.mode ?? mode
  const isLive = animation ? LIVE_STATUSES.has(animation.status) : false
  const videoSrc = useMemo(() => resolveMediaSrc(animation?.videoPath ?? null), [animation?.videoPath])
  const fallbackNotice =
    animation?.status === 'ready' && animation.errorCode
      ? animation.errorMessage ?? 'Current preview was produced by a local fallback path.'
      : null

  function handleRegenerate(nextMode = resolvedMode) {
    setMode(nextMode)
    startMutation.mutate({ cardId, mode: nextMode })
  }

  function handleDelete() {
    deleteMutation.mutate(cardId, { onSuccess: onClose })
  }

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      <motion.div
        key="panel"
        className="fixed inset-x-4 bottom-0 z-50 mx-auto max-w-3xl rounded-t-3xl bg-paper-base p-6 pb-8 shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        onClick={(event) => event.stopPropagation()}
        data-testid="card-animation-modal"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
              Animation Studio
            </p>
            <h2 className="mt-1 text-lg font-semibold text-ink">知识演示</h2>
            <p className="mt-2 text-sm text-ink-muted">{cardFront}</p>
          </div>
          <button
            onClick={onClose}
            className="text-ink-soft transition-colors hover:text-ink"
            aria-label="关闭动画面板"
          >
            ×
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2" data-testid="card-animation-mode-switch">
          <ModeButton
            active={resolvedMode === 'quick_preview'}
            label="快速演示"
            onClick={() => handleRegenerate('quick_preview')}
          />
          <ModeButton
            active={resolvedMode === 'video_render'}
            label="生成高质量视频"
            onClick={() => handleRegenerate('video_render')}
          />
        </div>

        <div className="mt-5 rounded-[24px] border border-line-soft bg-paper-card p-5">
          {fallbackNotice ? (
            <div
              className="mb-4 rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
              data-testid="card-animation-fallback-panel"
            >
              <p className="font-medium">Fallback preview in use</p>
              <p className="mt-2">{fallbackNotice}</p>
            </div>
          ) : null}
          {isLoading || isLive || startMutation.isPending ? (
            <GeneratingState
              label={
                resolvedMode === 'video_render'
                  ? '正在渲染视频…'
                  : '正在生成快速演示…'
              }
            />
          ) : animation?.status === 'failed' ? (
            <ErrorState animation={animation} onRetry={() => handleRegenerate(resolvedMode)} />
          ) : resolvedMode === 'video_render' ? (
            <VideoState animation={animation} videoSrc={videoSrc} />
          ) : animation?.status === 'ready' ? (
            <div data-testid="card-animation-preview">
              <AnimationRenderer scriptJson={animation.scriptJson} className="w-full" />
            </div>
          ) : (
            <GeneratingState label="准备中…" />
          )}
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleRegenerate(resolvedMode)}
            disabled={startMutation.isPending}
          >
            重新生成
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            删除记录
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded-full border border-ink/20 bg-ink px-4 py-2 text-sm text-paper-base'
          : 'rounded-full border border-line-soft bg-paper-base px-4 py-2 text-sm text-ink-muted'
      }
    >
      {label}
    </button>
  )
}

function GeneratingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-ink-soft">
      <motion.div
        className="h-9 w-9 rounded-full border-2 border-ink border-t-transparent"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
      <span className="text-sm">{label}</span>
    </div>
  )
}

function ErrorState({
  animation,
  onRetry,
}: {
  animation: CardAnimation
  onRetry: () => void
}) {
  return (
    <div className="space-y-4" data-testid="card-animation-error-panel">
      <div className="rounded-[18px] border border-rose-200 bg-rose-50 p-4">
        <p className="text-sm font-medium text-rose-700">当前渲染未完成</p>
        <p className="mt-2 text-sm text-rose-700/90">
          {animation.errorMessage ?? '渲染失败，请稍后重试。'}
        </p>
        {animation.errorCode ? (
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-rose-500">
            {animation.errorCode}
          </p>
        ) : null}
      </div>
      {animation.renderLogPath ? (
        <div
          className="rounded-[18px] border border-line-soft bg-paper-base p-4 text-sm text-ink-muted"
          data-testid="card-animation-render-log"
        >
          渲染日志路径：{animation.renderLogPath}
        </div>
      ) : null}
      <Button size="sm" onClick={onRetry}>
        重试渲染
      </Button>
    </div>
  )
}

function VideoState({
  animation,
  videoSrc,
}: {
  animation: CardAnimation | null | undefined
  videoSrc: string | null
}) {
  if (animation?.status !== 'ready') {
    return <GeneratingState label="等待视频结果…" />
  }

  return (
    <div className="space-y-4" data-testid="card-animation-video-panel">
      {videoSrc ? (
        <video
          controls
          preload="metadata"
          className="max-h-[420px] w-full rounded-[20px] border border-line-soft bg-black"
          poster={resolveMediaSrc(animation.posterPath) ?? undefined}
          src={videoSrc}
        />
      ) : (
        <div className="flex min-h-[240px] items-center justify-center rounded-[18px] border border-dashed border-line-soft bg-paper-base text-sm text-ink-muted">
          视频已生成，但当前环境没有可直接播放的路径。
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <InfoCard label="视频文件" value={animation.videoPath ?? '未返回'} />
        <InfoCard label="渲染日志" value={animation.renderLogPath ?? '未返回'} />
      </div>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-line-soft bg-paper-base p-4">
      <p className="text-[11px] uppercase tracking-[0.2em] text-ink-soft">{label}</p>
      <p className="mt-2 break-all text-sm text-ink">{value}</p>
    </div>
  )
}

function resolveMediaSrc(path: string | null) {
  if (!path || path.startsWith('mock://')) {
    return null
  }

  return isTauriEnvironment() ? convertFileSrc(path) : path
}
