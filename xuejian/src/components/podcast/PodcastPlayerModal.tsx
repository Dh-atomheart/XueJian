import { useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { convertFileSrc } from '@tauri-apps/api/core'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { usePodcastAudioSegmentsQuery, usePodcastEpisodeQuery } from '@/queries'
import { isTauriEnvironment } from '@/services/gateway'
import {
  PodcastScriptSchema,
  type PodcastEpisode,
  type PodcastScript,
  type PodcastStatus,
} from '@/types'

const LIVE_STATUSES = new Set<PodcastStatus>([
  'queued',
  'retrieving',
  'generating_outline',
  'generating_script',
  'evaluating',
  'awaiting_review',
  'generating_audio',
  'stitching',
])

interface PodcastPlayerModalProps {
  open: boolean
  episodeId: string | null
  onClose: () => void
}

export function PodcastPlayerModal({ open, episodeId, onClose }: PodcastPlayerModalProps) {
  const { data: episode, isLoading } = usePodcastEpisodeQuery(episodeId, {
    enabled: open && Boolean(episodeId),
    refetchInterval: (query) => {
      const value = query.state.data as PodcastEpisode | null | undefined
      return value && LIVE_STATUSES.has(value.status) ? 1600 : false
    },
  })

  const { data: audioSegments = [] } = usePodcastAudioSegmentsQuery(episodeId, {
    enabled: open && Boolean(episodeId),
    refetchInterval: episode && LIVE_STATUSES.has(episode.status) ? 1600 : false,
  })

  const script = useMemo(() => parseScript(episode?.scriptJson ?? null), [episode?.scriptJson])
  const audioSrc = useMemo(() => resolveAudioSrc(episode?.audioPath ?? null), [episode?.audioPath])

  useEffect(() => {
    if (!open) {
      return
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [onClose, open])

  if (!open) {
    return null
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      <motion.div
        className="fixed inset-x-4 top-[6%] z-50 mx-auto max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-[30px] border border-line-soft bg-paper-base shadow-2xl"
        initial={{ opacity: 0, y: 28, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 240, damping: 28 }}
      >
        <div className="flex items-center justify-between border-b border-line-soft/80 bg-paper-muted/65 px-6 py-4">
          <div>
            <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
              Podcast Player
            </p>
            <h3 className="mt-1 font-display text-2xl text-ink">
              {episode?.title ?? '播客播放器'}
            </h3>
          </div>

          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>

        <div className="grid max-h-[calc(88vh-88px)] gap-0 overflow-y-auto lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <aside className="border-b border-line-soft/80 bg-paper-muted/35 p-6 lg:border-b-0 lg:border-r">
            {isLoading ? (
              <LoadingBlock label="正在读取 episode..." />
            ) : episode ? (
              <div className="space-y-5">
                <div className="rounded-[22px] border border-line-soft/70 bg-paper-base px-4 py-4">
                  <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                    状态
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <StatusBadge status={episode.status} />
                    <span className="font-latin text-xs tracking-wide text-ink-soft">
                      Stage {episode.currentStage}/6
                    </span>
                  </div>
                  {episode.errorMessage ? (
                    <p className="mt-3 text-sm leading-6 text-rose-700">{episode.errorMessage}</p>
                  ) : null}
                </div>

                <div className="rounded-[22px] border border-line-soft/70 bg-paper-base px-4 py-4">
                  <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                    最终音频
                  </p>
                  {audioSrc ? (
                    <audio
                      key={audioSrc}
                      controls
                      className="mt-4 w-full"
                      src={audioSrc}
                      autoPlay
                    />
                  ) : (
                    <p className="mt-3 text-sm leading-6 text-ink-muted">
                      {episode.status === 'ready'
                        ? '当前环境无法直接解析本地音频路径，但音频文件已经生成。'
                        : '音频仍在生成或尚未落盘。'}
                    </p>
                  )}
                </div>

                <div className="rounded-[22px] border border-line-soft/70 bg-paper-base px-4 py-4">
                  <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                    片段元数据
                  </p>
                  <div className="mt-3 space-y-3">
                    {audioSegments.length === 0 ? (
                      <p className="text-sm leading-6 text-ink-muted">还没有可展示的音频片段。</p>
                    ) : (
                      audioSegments.map((segment) => (
                        <div
                          key={segment.id}
                          className="rounded-[18px] border border-line-soft/60 bg-paper-muted/45 px-3 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-ink">{segment.speaker}</p>
                            <span className="font-latin text-[11px] tracking-wide text-ink-soft">
                              {formatDuration(segment.durationMs)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-ink-muted">
                            {segment.ttsProvider} · {segment.voiceId}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <LoadingBlock label="没有可展示的 episode。" />
            )}
          </aside>

          <section className="p-6">
            {script ? (
              <div className="space-y-4">
                <div>
                  <p className="font-ui text-[11px] uppercase tracking-[0.22em] text-ink-soft">
                    Transcript
                  </p>
                  <h4 className="mt-2 font-display text-2xl text-ink">逐条对白</h4>
                  <p className="mt-1 text-sm leading-6 text-ink-muted">{script.description}</p>
                </div>

                <div className="grid gap-3">
                  {script.segments.map((segment, index) => (
                    <div
                      key={segment.id}
                      className={cn(
                        'rounded-[24px] border border-line-soft/70 bg-paper-card px-4 py-4 transition-colors',
                        index % 2 === 0 ? 'rotate-[-0.25deg]' : 'rotate-[0.25deg]'
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="font-latin text-[11px] tracking-[0.18em] text-ink-soft">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <p className="text-sm font-medium text-ink">{segment.speaker}</p>
                        </div>
                        <span className="rounded-full border border-line-soft bg-paper-muted/55 px-3 py-1 font-latin text-[11px] tracking-wide text-ink-soft">
                          {formatDuration(segment.durationMs)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-ink-muted">{segment.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <LoadingBlock label="脚本尚未可用。" />
            )}
          </section>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex min-h-[240px] items-center justify-center text-sm text-ink-muted">
      {label}
    </div>
  )
}

function StatusBadge({ status }: { status: PodcastStatus }) {
  const tone = STATUS_TONE[status]
  return (
    <span
      className={cn('rounded-full border px-3 py-1 text-[11px] font-medium tracking-wide', tone)}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

function parseScript(rawJson: string | null): PodcastScript | null {
  if (!rawJson) return null
  try {
    const payload = JSON.parse(rawJson)
    const result = PodcastScriptSchema.safeParse(payload)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function resolveAudioSrc(audioPath: string | null) {
  if (!audioPath || audioPath.startsWith('mock://')) {
    return null
  }

  return isTauriEnvironment() ? convertFileSrc(audioPath) : audioPath
}

function formatDuration(durationMs: number) {
  const seconds = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

const STATUS_LABEL: Record<PodcastStatus, string> = {
  queued: '已排队',
  retrieving: '检索资料',
  generating_outline: '构建大纲',
  generating_script: '撰写脚本',
  evaluating: '评估脚本',
  awaiting_review: '等待审阅',
  generating_audio: '生成语音',
  stitching: '拼接音频',
  ready: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

const STATUS_TONE: Record<PodcastStatus, string> = {
  queued: 'border-stone-300 bg-stone-100 text-stone-700',
  retrieving: 'border-sky-200 bg-sky-50 text-sky-700',
  generating_outline: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  generating_script: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  evaluating: 'border-violet-200 bg-violet-50 text-violet-700',
  awaiting_review: 'border-amber-200 bg-amber-50 text-amber-800',
  generating_audio: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  stitching: 'border-teal-200 bg-teal-50 text-teal-700',
  ready: 'border-green-200 bg-green-50 text-green-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
  cancelled: 'border-zinc-200 bg-zinc-100 text-zinc-700',
}
