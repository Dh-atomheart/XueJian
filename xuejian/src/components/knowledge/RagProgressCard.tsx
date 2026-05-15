import { Check, Circle, Loader2, Search, SkipForward, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RagProgressStep, RagProgressStepKey, RagProgressStepStatus } from '@/types'

type RagProgressCardProps = {
  steps: RagProgressStep[]
  className?: string
}

const STEP_ORDER: RagProgressStepKey[] = [
  'query_embedding',
  'rewrite',
  'retrieve',
  'rerank',
  'gate',
  'second_retrieval',
  'pack',
  'generate',
  'audit',
]

const STEP_LABELS: Record<RagProgressStepKey, { title: string; detail: string }> = {
  query_embedding: { title: '理解问题', detail: '生成检索向量' },
  rewrite: { title: '改写查询', detail: '结合上下文补全检索词' },
  retrieve: { title: '检索文档', detail: '查找相关片段' },
  rerank: { title: '重排证据', detail: '筛选更相关的片段' },
  gate: { title: '相关性判断', detail: '决定是否需要二次检索' },
  second_retrieval: { title: '二次检索', detail: '扩大召回范围' },
  pack: { title: '整理上下文', detail: '合并并压缩证据' },
  generate: { title: '生成回答', detail: '基于证据组织答案' },
  audit: { title: '核对引用', detail: '检查引用是否可追溯' },
}

const FALLBACK_STEP: RagProgressStep = {
  id: 'fallback-started',
  stepKey: 'query_embedding',
  status: 'running',
  title: '准备检索',
  detail: '正在启动知识问答流程',
  progress: 0.08,
  metrics: {},
  createdAt: new Date(0),
}

export function RagProgressCard({ steps, className }: RagProgressCardProps) {
  const displaySteps = normalizeProgressSteps(steps)
  const activeStep =
    displaySteps.find((step) => step.status === 'running') ??
    [...displaySteps].reverse().find((step) => step.status === 'completed') ??
    displaySteps[0]
  const progress = Math.max(
    0.08,
    Math.min(
      0.98,
      activeStep?.progress ??
        (activeStep ? (STEP_ORDER.indexOf(activeStep.stepKey) + 1) / (STEP_ORDER.length + 1) : 0.08)
    )
  )

  return (
    <div
      className={cn('rounded-xl border border-border/55 bg-muted/[0.18] p-3', className)}
      data-testid="knowledge-qa-rag-progress"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground">
            <Search className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">检索过程</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {activeStep?.title ?? '准备检索'}
              {activeStep?.detail ? ` · ${activeStep.detail}` : ''}
            </p>
          </div>
        </div>
        <span className="shrink-0 font-latin text-[11px] text-muted-foreground">
          {Math.round(progress * 100)}%
        </span>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background/80">
        <div
          className="h-full rounded-full bg-foreground/70 transition-[width] duration-300"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      <ol className="mt-3 space-y-2">
        {displaySteps.map((step) => (
          <li key={step.id} className="flex items-start gap-2 text-xs">
            <StatusIcon status={step.status} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium text-foreground">{step.title}</span>
                <span className="text-[11px] text-muted-foreground">{statusLabel(step.status)}</span>
              </div>
              {step.detail ? (
                <p className="mt-0.5 break-words text-[11px] leading-4 text-muted-foreground">
                  {step.detail}
                </p>
              ) : null}
              {step.metrics && Object.keys(step.metrics).length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {Object.entries(step.metrics).map(([key, value]) => (
                    <span
                      key={key}
                      className="rounded-md border border-border/45 bg-card/70 px-1.5 py-0.5 font-latin text-[10px] text-muted-foreground"
                    >
                      {key}: {String(value)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function normalizeProgressSteps(steps: RagProgressStep[]): RagProgressStep[] {
  const latestByStep = new Map<RagProgressStepKey, RagProgressStep>()
  for (const step of steps) {
    const previous = latestByStep.get(step.stepKey)
    if (!previous || previous.createdAt.getTime() <= step.createdAt.getTime()) {
      latestByStep.set(step.stepKey, {
        ...step,
        title: step.title || STEP_LABELS[step.stepKey].title,
        detail: step.detail || STEP_LABELS[step.stepKey].detail,
      })
    }
  }

  const normalized = STEP_ORDER.flatMap((stepKey) => {
    const step = latestByStep.get(stepKey)
    return step ? [step] : []
  })

  return normalized.length > 0 ? normalized : [FALLBACK_STEP]
}

function StatusIcon({ status }: { status: RagProgressStepStatus }) {
  const className = 'mt-0.5 h-3.5 w-3.5 shrink-0'
  switch (status) {
    case 'running':
      return <Loader2 className={cn(className, 'animate-spin text-foreground')} />
    case 'completed':
      return <Check className={cn(className, 'text-emerald-700')} />
    case 'skipped':
      return <SkipForward className={cn(className, 'text-muted-foreground')} />
    case 'failed':
      return <X className={cn(className, 'text-destructive')} />
    default:
      return <Circle className={cn(className, 'text-muted-foreground/70')} />
  }
}

function statusLabel(status: RagProgressStepStatus) {
  switch (status) {
    case 'running':
      return '进行中'
    case 'completed':
      return '完成'
    case 'skipped':
      return '跳过'
    case 'failed':
      return '失败'
    default:
      return '等待'
  }
}
