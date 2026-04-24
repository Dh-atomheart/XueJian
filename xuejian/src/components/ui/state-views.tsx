import type { LucideIcon } from 'lucide-react'
import {
  AlertCircle,
  CloudUpload,
  FileText,
  Inbox,
  Layers,
  Loader2,
  Network,
  RefreshCcw,
  Settings,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

function Shimmer({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted/60', className)} />
}

export function SkeletonDocRow({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4', className)}>
      <Shimmer className="h-10 w-10 shrink-0 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Shimmer className="h-3.5 w-48" />
        <Shimmer className="h-3 w-32" />
      </div>
      <Shimmer className="h-6 w-16 rounded-full" />
    </div>
  )
}

export function LoadingSpinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-muted-foreground', className)} />
}

export function CenteredLoading({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <LoadingSpinner className="h-6 w-6" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  secondaryAction,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: { label: string; onClick: () => void; variant?: 'default' | 'outline' }
  secondaryAction?: { label: string; onClick: () => void }
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-16 text-center', className)}>
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-dashed border-border/60" />
        <Icon className="h-7 w-7 text-muted-foreground/60" strokeWidth={1.5} />
      </div>
      <div className="max-w-sm space-y-1.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? <p className="text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {action || secondaryAction ? (
        <div className="flex items-center gap-3">
          {action ? (
            <Button variant={action.variant ?? 'default'} size="sm" className="rounded-lg" onClick={action.onClick}>
              {action.label}
            </Button>
          ) : null}
          {secondaryAction ? (
            <Button variant="ghost" size="sm" className="rounded-lg text-muted-foreground" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function EmptyDocuments({ onUpload }: { onUpload: () => void }) {
  return (
    <EmptyState
      icon={CloudUpload}
      title="还没有文档"
      description="上传第一份 PDF 后，文档库、阅读、卡片和知识工作流都会接通。"
      action={{ label: '上传文档', onClick: onUpload }}
    />
  )
}

export function EmptyCards({ onGenerate, onCreate }: { onGenerate: () => void; onCreate: () => void }) {
  return (
    <EmptyState
      icon={Layers}
      title="还没有学习卡片"
      description="从文档生成候选卡片，或者先手动创建一张卡片。"
      action={{ label: '从文档生成', onClick: onGenerate }}
      secondaryAction={{ label: '手动创建', onClick: onCreate }}
    />
  )
}

export function EmptyGraph({ onBuild }: { onBuild: () => void }) {
  return (
    <EmptyState
      icon={Network}
      title="知识图谱尚未生成"
      description="选择文档并启动构建后，系统会提取概念和关系。"
      action={{ label: '开始构建', onClick: onBuild }}
    />
  )
}

export function EmptySearchResults({ query }: { query: string }) {
  return (
    <EmptyState
      icon={FileText}
      title={`没有找到“${query}”相关内容`}
      description="换个关键词，或者清除筛选后再试。"
    />
  )
}

export function ErrorState({
  title = '出现了一些问题',
  description = '当前操作未能完成，请稍后重试。',
  onRetry,
  className,
}: {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-16 text-center', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-destructive/20 bg-destructive/5">
        <AlertCircle className="h-6 w-6 text-destructive/70" />
      </div>
      <div className="max-w-xs space-y-1.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" className="gap-2 rounded-lg" onClick={onRetry}>
          <RefreshCcw className="h-3.5 w-3.5" />
          重试
        </Button>
      ) : null}
    </div>
  )
}

export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive/70" />
        <p className="text-sm text-foreground">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={onRetry}>
          <RefreshCcw className="h-3 w-3" />
          重试
        </Button>
      ) : null}
    </div>
  )
}

export function UnconfiguredState({
  feature,
  onConfigure,
  canBrowse,
  onBrowse,
  className,
}: {
  feature: string
  onConfigure: () => void
  canBrowse?: boolean
  onBrowse?: () => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-16 text-center', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-border bg-muted/30">
        <Settings className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.5} />
      </div>
      <div className="max-w-sm space-y-1.5">
        <p className="text-sm font-medium text-foreground">{feature} 需要先配置 AI</p>
        <p className="text-sm leading-relaxed text-muted-foreground">前往设置页接入可用模型后，再继续当前工作流。</p>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" className="gap-2 rounded-lg" onClick={onConfigure}>
          <Sparkles className="h-3.5 w-3.5" />
          去配置
        </Button>
        {canBrowse && onBrowse ? (
          <Button variant="ghost" size="sm" className="rounded-lg text-muted-foreground" onClick={onBrowse}>
            先浏览内容
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function ParsingBanner({
  progress,
  filename,
  onCancel,
}: {
  progress: number
  filename: string
  onCancel?: () => void
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-chart-2/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <LoadingSpinner />
          <div>
            <p className="text-sm font-medium text-foreground">正在处理文档</p>
            <p className="text-xs text-muted-foreground">{filename}</p>
          </div>
        </div>
        {onCancel ? (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={onCancel}>
            取消
          </Button>
        ) : null}
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-chart-2/60 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-2 text-right text-[11px] text-muted-foreground">{Math.round(progress)}%</p>
    </div>
  )
}
