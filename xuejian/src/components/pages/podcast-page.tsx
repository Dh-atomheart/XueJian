import type { ReactNode } from 'react'
import {
  ChevronDown,
  Clock,
  Download,
  FileText,
  Heart,
  LayoutList,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCcw,
  Search,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
} from '@/components/ui'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

export type PodcastPageMode = 'create' | 'library'

export interface PodcastMetricItem {
  label: string
  value: string | number
  hint?: string
}

export interface PodcastToolbarChip {
  label: string
  tone?: 'neutral' | 'info' | 'success' | 'warning'
}

export interface PodcastEpisodeView {
  id: string
  title: string
  status: 'queued' | 'generating' | 'ready' | 'failed'
  style: string
  duration: string
  language: string
  progress?: number
  tags?: string[]
  createdAt: string
}

// ─── Chip tone helper ────────────────────────────────────────────────────────

const CHIP_TONE_CLASS: Record<NonNullable<PodcastToolbarChip['tone']>, string> = {
  neutral: 'border-border/50 bg-card/70 text-muted-foreground',
  info: 'border-sky-200/70 bg-sky-50 text-sky-700',
  success: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200/70 bg-amber-50 text-amber-700',
}

// ─── Podcast Status Badge ────────────────────────────────────────────────────

export function PodcastStatusBadge({ status, progress }: { status: PodcastEpisodeView['status']; progress?: number }) {
  const config: Record<string, { label: string; className: string }> = {
    ready: { label: '已完成', className: 'bg-chart-1/15 text-chart-1' },
    generating: { label: '生成中', className: 'bg-chart-5/15 text-chart-5' },
    failed: { label: '失败', className: 'bg-destructive/15 text-destructive' },
    queued: { label: '排队中', className: 'bg-muted text-muted-foreground' },
  }
  const { label, className } = config[status] ?? config.queued
  return (
    <Badge variant="secondary" className={cn('rounded-md font-normal', className)}>
      {status === 'generating' && progress ? `生成中 ${progress}%` : label}
    </Badge>
  )
}

// ─── Podcast Episode Card (list item) ────────────────────────────────────────

export function PodcastEpisodeCard({
  episode,
  isPlaying,
  onPlay,
  onDownload,
  onRetry,
  onDelete,
}: {
  episode: PodcastEpisodeView
  isPlaying?: boolean
  onPlay?: (id: string) => void
  onDownload?: (id: string) => void
  onRetry?: (id: string) => void
  onDelete?: (id: string) => void
}) {
  return (
    <Card className="border-border/50 bg-card transition-all hover:border-border hover:shadow-sm">
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Thumbnail */}
          <div className="relative h-20 w-20 shrink-0 rounded-lg bg-muted/50">
            <div className="absolute inset-0 flex items-center justify-center">
              <Mic className="h-8 w-8 text-muted-foreground/50" />
            </div>
            {episode.status === 'ready' ? (
              <button
                onClick={() => onPlay?.(episode.id)}
                className="absolute inset-0 flex items-center justify-center rounded-lg bg-foreground/80 opacity-0 transition-opacity hover:opacity-100"
              >
                {isPlaying ? <Pause className="h-8 w-8 text-background" /> : <Play className="h-8 w-8 text-background" />}
              </button>
            ) : null}
          </div>

          {/* Content */}
          <div className="flex flex-1 flex-col justify-between">
            <div>
              <h4 className="line-clamp-1 text-sm font-medium text-foreground">{episode.title}</h4>
              {episode.tags && episode.tags.length > 0 ? (
                <div className="mt-1 flex items-center gap-2">
                  {episode.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="h-5 rounded-md px-1.5 text-[10px] font-normal">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{episode.style}</span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {episode.duration}
                </span>
              </div>
            </div>
          </div>

          {/* Status & Actions */}
          <div className="flex flex-col items-end justify-between">
            <div className="flex items-center gap-2">
              <PodcastStatusBadge status={episode.status} progress={episode.progress} />
              <span className="text-xs text-muted-foreground">{episode.createdAt}</span>
            </div>
            <div className="flex items-center gap-1">
              {episode.status === 'ready' ? (
                <>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onPlay?.(episode.id)}>
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDownload?.(episode.id)}>
                    <Download className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
              {episode.status === 'generating' ? (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <Pause className="h-4 w-4" />
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onRetry?.(episode.id)}>
                <RefreshCcw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDelete?.(episode.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Progress bar for generating */}
        {episode.status === 'generating' && episode.progress ? (
          <div className="mt-3">
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-chart-5/60 transition-all duration-500"
                style={{ width: `${episode.progress}%` }}
              />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ─── Audio Player Bar ────────────────────────────────────────────────────────

export function AudioPlayerBar({
  title: _title,
  duration,
  currentTime,
  isPlaying,
  onPlayPause,
  onSeek: _onSeek,
  onSkipBack,
  onSkipForward,
  onVolumeChange: _onVolumeChange,
}: {
  title?: string
  duration: string
  currentTime: string
  isPlaying: boolean
  onPlayPause: () => void
  onSeek?: (percent: number) => void
  onSkipBack?: () => void
  onSkipForward?: () => void
  onVolumeChange?: (percent: number) => void
}) {
  return (
    <Card className="fixed bottom-0 left-52 right-0 z-50 rounded-none border-b-0 border-l-0 border-r-0 border-border/50 bg-card/95 backdrop-blur">
      <CardContent className="flex items-center gap-4 p-4">
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
          <Heart className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-9 w-9 rounded-full p-0">
            <span className="text-[10px] tabular-nums">15</span>
          </Button>
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={onSkipBack}>
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button className="h-10 w-10 rounded-full p-0" onClick={onPlayPause}>
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </Button>
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={onSkipForward}>
            <SkipForward className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-9 w-9 rounded-full p-0">
            <span className="text-[10px] tabular-nums">15</span>
          </Button>
        </div>

        <div className="flex flex-1 items-center gap-3">
          <span className="text-xs tabular-nums text-muted-foreground">{currentTime}</span>
          <div className="relative flex-1">
            <div className="h-1 rounded-full bg-muted">
              <div className="h-full w-0 rounded-full bg-foreground" />
            </div>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{duration}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
            <Volume2 className="h-4 w-4" />
          </Button>
          <div className="w-24">
            <div className="h-1 rounded-full bg-muted">
              <div className="h-full w-3/4 rounded-full bg-foreground" />
            </div>
          </div>
        </div>

        <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
          <LayoutList className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Podcast Search Bar ──────────────────────────────────────────────────────

export function PodcastSearchBar() {
  return (
    <div className="mt-4 flex items-center gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="搜索播客标题或主题..." className="h-9 rounded-lg border-border/50 bg-card pl-9 text-sm" />
      </div>
      <Button variant="outline" size="sm" className="h-9 gap-2 rounded-lg border-border/50">
        全部状态 <ChevronDown className="h-3 w-3" />
      </Button>
      <Button variant="outline" size="sm" className="h-9 gap-2 rounded-lg border-border/50">
        全部风格 <ChevronDown className="h-3 w-3" />
      </Button>
      <Button variant="outline" size="sm" className="h-9 gap-2 rounded-lg border-border/50">
        全部时长 <ChevronDown className="h-3 w-3" />
      </Button>
    </div>
  )
}

// ─── Create Podcast Form ─────────────────────────────────────────────────────

export function CreatePodcastForm({
  styleOptions,
  durationOptions,
  languageOptions,
  ttsOptions,
  formatOptions,
  selectedStyle,
  selectedDuration,
  selectedLanguage,
  selectedTts,
  selectedFormat,
  onStyleChange,
  onDurationChange,
  onLanguageChange: _onLanguageChange,
  onTtsChange: _onTtsChange,
  onFormatChange: _onFormatChange,
  onGenerate,
  isBusy,
}: {
  styleOptions: Array<{ value: string; label: string }>
  durationOptions: Array<{ value: string; label: string }>
  languageOptions: Array<{ value: string; label: string }>
  ttsOptions: Array<{ value: string; label: string }>
  formatOptions: Array<{ value: string; label: string }>
  selectedStyle: string
  selectedDuration: string
  selectedLanguage: string
  selectedTts: string
  selectedFormat: string
  onStyleChange: (value: string) => void
  onDurationChange: (value: string) => void
  onLanguageChange: (value: string) => void
  onTtsChange: (value: string) => void
  onFormatChange: (value: string) => void
  onGenerate: () => void
  isBusy?: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Left: Settings */}
      <Card className="border-border/50 bg-card">
        <CardContent className="p-6">
          <h3 className="text-sm font-medium text-foreground">选择文档</h3>
          <div className="mt-3">
            <Button variant="outline" className="w-full justify-between rounded-lg">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                选择一个文档...
              </span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>

          <h3 className="mt-6 text-sm font-medium text-foreground">风格</h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {styleOptions.map((opt) => (
              <Button
                key={opt.value}
                variant="outline"
                size="sm"
                className={cn('rounded-lg', selectedStyle === opt.value && 'border-foreground/30 bg-foreground/5')}
                onClick={() => onStyleChange(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          <h3 className="mt-6 text-sm font-medium text-foreground">时长</h3>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {durationOptions.map((opt) => (
              <Button
                key={opt.value}
                variant="outline"
                size="sm"
                className={cn('rounded-lg', selectedDuration === opt.value && 'border-foreground/30 bg-foreground/5')}
                onClick={() => onDurationChange(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">语言</label>
              <Button variant="outline" size="sm" className="mt-1 w-full justify-between rounded-lg" onClick={() => {}}>
                {languageOptions.find((o) => o.value === selectedLanguage)?.label ?? '中文'} <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">TTS</label>
              <Button variant="outline" size="sm" className="mt-1 w-full justify-between rounded-lg" onClick={() => {}}>
                {ttsOptions.find((o) => o.value === selectedTts)?.label ?? '自动'} <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">格式</label>
              <Button variant="outline" size="sm" className="mt-1 w-full justify-between rounded-lg" onClick={() => {}}>
                {formatOptions.find((o) => o.value === selectedFormat)?.label ?? 'MP3'} <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <Button className="mt-8 w-full gap-2 rounded-lg" onClick={onGenerate} disabled={isBusy}>
            <Mic className="h-4 w-4" />
            生成播客
          </Button>
        </CardContent>
      </Card>

      {/* Right: Preview */}
      <Card className="border-border/50 bg-card">
        <CardContent className="flex h-full min-h-[400px] items-center justify-center p-6">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
              <Mic className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">选择文档并配置参数后开始生成</p>
            <p className="mt-1 text-xs text-muted-foreground">AI 将自动生成深度访谈播客</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Main Layout ─────────────────────────────────────────────────────────────

export function PodcastPageLayout({
  actions,
  toolbarChips,
  toolbarHint,
  metrics,
  mode,
  onModeChange,
  createWorkbench,
  mainStage,
  detailRail,
}: {
  actions?: ReactNode
  toolbarChips?: PodcastToolbarChip[]
  toolbarHint?: ReactNode
  metrics?: PodcastMetricItem[]
  mode: PodcastPageMode
  onModeChange: (mode: PodcastPageMode) => void
  createWorkbench: ReactNode
  mainStage: ReactNode
  detailRail: ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6" data-testid="podcast-page">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            PODCAST WORKSHOP
          </p>
          <h1 className="mt-1 text-2xl font-medium text-foreground" data-testid="app-shell-page-title">
            播客工坊
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            将知识转化为播客，让学习在听的过程中延续。
          </p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>

      <div
        className="flex flex-col gap-4 rounded-[28px] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(250,247,240,0.9))] px-5 py-4 shadow-[0_24px_70px_-40px_rgba(120,101,76,0.4)]"
        data-testid="podcast-toolbar"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-6 border-b border-border/30">
            {[
              { id: 'create' as const, label: '创建播客' },
              { id: 'library' as const, label: '我的播客' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onModeChange(tab.id)}
                className={cn(
                  'relative pb-3 text-sm font-medium transition-colors',
                  mode === tab.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
                {mode === tab.id ? <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" /> : null}
              </button>
            ))}
          </div>
          {toolbarHint ? <div className="text-sm text-muted-foreground">{toolbarHint}</div> : null}
        </div>

        {toolbarChips && toolbarChips.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {toolbarChips.map((chip) => {
              const tone = chip.tone ?? 'neutral'
              return (
                <span
                  key={`${chip.label}-${tone}`}
                  className={cn('inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium', CHIP_TONE_CLASS[tone])}
                >
                  {chip.label}
                </span>
              )
            })}
          </div>
        ) : null}
      </div>

      {metrics && metrics.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-[24px] border border-border/60 bg-card/90 px-5 py-4 shadow-[0_16px_40px_-32px_rgba(48,40,32,0.45)]"
            >
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{metric.value}</p>
              {metric.hint ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.hint}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_310px]">
        <aside className="space-y-5">{createWorkbench}</aside>
        <section data-testid="podcast-main-stage">{mainStage}</section>
        <aside data-testid="podcast-detail-rail" className="space-y-5">
          {detailRail}
        </aside>
      </div>
    </div>
  )
}
