import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AnimationRenderer } from '@/components/cards/AnimationRenderer'
import { Button } from '@/components/ui'
import {
  useCardAnimationQuery,
  useStartCardAnimationMutation,
  useDeleteCardAnimationMutation,
} from '@/queries'
import type { CardAnimation } from '@/types'

interface AnimationPreviewModalProps {
  cardId: string
  cardFront: string
  onClose: () => void
}

const LIVE_STATUSES = new Set(['queued', 'generating'])

export function AnimationPreviewModal({ cardId, onClose }: AnimationPreviewModalProps) {
  const startMutation = useStartCardAnimationMutation()
  const deleteMutation = useDeleteCardAnimationMutation()

  // Poll while generating
  const { data: animation, isLoading } = useCardAnimationQuery(cardId, {
    refetchInterval: (query) => {
      const status = (query.state.data as CardAnimation | null | undefined)?.status
      return status && LIVE_STATUSES.has(status) ? 1500 : false
    },
  })

  // Auto-start on first open if no animation exists yet
  useEffect(() => {
    if (!isLoading && animation === null) {
      startMutation.mutate({ cardId })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading])

  const isLive = animation ? LIVE_STATUSES.has(animation.status) : false

  function handleRegenerate() {
    startMutation.mutate({ cardId })
  }

  function handleDelete() {
    deleteMutation.mutate(cardId, { onSuccess: onClose })
  }

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        key="panel"
        className="fixed inset-x-4 bottom-0 z-50 mx-auto max-w-lg rounded-t-2xl bg-[#fbfbf9] shadow-2xl p-6 pb-8"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#2c2c2c]">知识动画预览</h2>
          <button
            onClick={onClose}
            className="text-[#6b7280] hover:text-[#2c2c2c] transition-colors text-lg leading-none"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="min-h-[180px] flex items-center justify-center">
          {isLoading || isLive || startMutation.isPending ? (
            <GeneratingState label={isLive ? '正在生成动画…' : '启动中…'} />
          ) : animation?.status === 'failed' ? (
            <ErrorState message={animation.errorMessage ?? '生成失败'} onRetry={handleRegenerate} />
          ) : animation?.status === 'ready' ? (
            <AnimationRenderer scriptJson={animation.scriptJson} className="w-full" />
          ) : (
            <GeneratingState label="准备中…" />
          )}
        </div>

        {/* Actions */}
        {animation?.status === 'ready' && (
          <div className="flex gap-2 mt-4 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRegenerate}
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
              删除
            </Button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

function GeneratingState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-[#6b7280]">
      <motion.div
        className="w-8 h-8 rounded-full border-2 border-[#4a7c59] border-t-transparent"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
      <span className="text-sm">{label}</span>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-red-500">{message}</p>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        重试
      </Button>
    </div>
  )
}
