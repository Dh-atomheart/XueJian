import { useState, useMemo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui'
import {
  usePodcastEpisodeQuery,
  useStartPodcastMutation,
  useCancelPodcastMutation,
  useDeletePodcastMutation,
} from '@/queries'
import type { PodcastEpisode, PodcastScript, DialogueSegment } from '@/types'

interface PodcastPlayerModalProps {
  episodeId: string | null
  documentId?: string | null
  onClose: () => void
}

const LIVE_STATUSES = new Set(['queued', 'generating'])

export function PodcastPlayerModal({ episodeId, documentId, onClose }: PodcastPlayerModalProps) {
  const startMutation = useStartPodcastMutation()
  const cancelMutation = useCancelPodcastMutation()
  const deleteMutation = useDeletePodcastMutation()
  const [currentSegment, setCurrentSegment] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: episode, isLoading } = usePodcastEpisodeQuery(episodeId ?? '', {
    refetchInterval: (query) => {
      const status = (query.state.data as PodcastEpisode | null | undefined)?.status
      return status && LIVE_STATUSES.has(status) ? 2000 : false
    },
  })

  const script: PodcastScript | null = useMemo(() => {
    if (!episode?.scriptJson) return null
    try {
      return JSON.parse(episode.scriptJson) as PodcastScript
    } catch {
      return null
    }
  }, [episode?.scriptJson])

  const segments = script?.segments ?? []

  // Auto-advance through segments during playback
  useEffect(() => {
    if (!isPlaying || segments.length === 0) return
    if (currentSegment >= segments.length) {
      setIsPlaying(false)
      return
    }
    const seg = segments[currentSegment]
    timerRef.current = setTimeout(() => {
      setCurrentSegment((prev) => prev + 1)
    }, seg.durationMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [isPlaying, currentSegment, segments])

  // Auto-start generation if no episode exists
  useEffect(() => {
    if (!isLoading && !episode && !episodeId) {
      startMutation.mutate({ documentId })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading])

  const isLive = episode ? LIVE_STATUSES.has(episode.status) : false

  function handlePlay() {
    if (currentSegment >= segments.length) setCurrentSegment(0)
    setIsPlaying(true)
  }

  function handlePause() {
    setIsPlaying(false)
  }

  function handleRestart() {
    setCurrentSegment(0)
    setIsPlaying(true)
  }

  function handleCancel() {
    if (episodeId) cancelMutation.mutate(episodeId)
  }

  function handleDelete() {
    if (episodeId) deleteMutation.mutate(episodeId, { onSuccess: onClose })
  }

  function formatMs(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
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

      {/* Modal */}
      <motion.div
        key="podcast-modal"
        className="fixed inset-x-4 top-[10%] z-50 mx-auto max-w-xl rounded-2xl bg-white shadow-2xl dark:bg-zinc-900"
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-700">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            🎙️ {episode?.title ?? 'AI 播客'}
          </h3>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[55vh] overflow-y-auto p-4">
          {(isLoading || isLive) && (
            <div className="flex items-center justify-center gap-2 py-8 text-zinc-500">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="h-5 w-5 rounded-full border-2 border-zinc-300 border-t-zinc-600"
              />
              <span>{isLive ? '正在生成播客脚本…' : '加载中…'}</span>
            </div>
          )}

          {episode?.status === 'failed' && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
              生成失败：{episode.errorMessage ?? '未知错误'}
            </div>
          )}

          {episode?.status === 'cancelled' && (
            <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
              已取消
            </div>
          )}

          {episode?.status === 'ready' && script && (
            <>
              <p className="mb-3 text-sm text-zinc-500">{script.description}</p>
              <div className="mb-2 text-xs text-zinc-400">
                时长：{formatMs(episode.durationMs)} · {segments.length} 个片段
              </div>

              {/* Segment list */}
              <div className="space-y-2">
                {segments.map((seg: DialogueSegment, i: number) => (
                  <motion.div
                    key={seg.id}
                    className={`rounded-lg px-3 py-2 text-sm transition ${
                      i === currentSegment && isPlaying
                        ? 'bg-blue-50 ring-2 ring-blue-400 dark:bg-blue-900/30'
                        : i < currentSegment
                          ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800'
                          : 'bg-zinc-50 dark:bg-zinc-800/50'
                    }`}
                    initial={false}
                    animate={
                      i === currentSegment && isPlaying ? { scale: 1.01 } : { scale: 1 }
                    }
                  >
                    <span className="mr-2 font-medium text-zinc-600 dark:text-zinc-300">
                      {seg.speaker}:
                    </span>
                    <span className="text-zinc-800 dark:text-zinc-200">{seg.text}</span>
                    <span className="ml-2 text-xs text-zinc-400">
                      ({formatMs(seg.durationMs)})
                    </span>
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between border-t border-zinc-200 p-4 dark:border-zinc-700">
          <div className="flex gap-2">
            {episode?.status === 'ready' && (
              <>
                {!isPlaying ? (
                  <Button onClick={handlePlay}>▶ 播放</Button>
                ) : (
                  <Button onClick={handlePause}>⏸ 暂停</Button>
                )}
                <Button onClick={handleRestart}>⏮ 重播</Button>
              </>
            )}
            {isLive && <Button onClick={handleCancel}>取消</Button>}
          </div>
          <div className="flex gap-2">
            {episode && !isLive && (
              <Button onClick={handleDelete}>删除</Button>
            )}
            <Button onClick={onClose}>关闭</Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
