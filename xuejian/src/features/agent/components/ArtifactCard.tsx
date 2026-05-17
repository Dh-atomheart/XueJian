import { useState } from 'react'
import {
  CheckCircle2,
  FileText,
  Layers3,
  Lightbulb,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkflowArtifact } from '@/types'
import type { AgentWorkflowSummary } from '../agentResult'

type ActionState = 'idle' | 'loading' | 'success' | 'failed'

interface ArtifactCardProps {
  artifact: WorkflowArtifact
  summary: AgentWorkflowSummary
  onAction: (action: AgentWorkflowSummary['availableActions'][number]) => void
}

export function ArtifactCard({ artifact, summary, onAction }: ArtifactCardProps) {
  const [expandedReason, setExpandedReason] = useState(false)
  const quality = artifact.qualityEnvelope as Record<string, unknown> | undefined
  const riskLevel = typeof quality?.riskLevel === 'string' ? quality.riskLevel : undefined
  const sourceCount = artifact.sourceRefs?.length ?? 0

  const hasCreateCard = summary.availableActions.includes('create_card')
  const hasRollback = summary.availableActions.includes('rollback')
  const isRolledBack = artifact.lifecycleStatus === 'rolled_back'

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition',
        isRolledBack
          ? 'border-line-soft/60 bg-paper-muted/60 opacity-70'
          : 'border-line-soft bg-paper-base'
      )}
      data-testid={`artifact-card-${artifact.artifactType}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {artifactIcon(artifact.artifactType)}
          <span className="text-xs font-medium text-ink">{artifactTypeLabel(artifact.artifactType)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {riskLevel ? (
            <span
              className={cn(
                'inline-flex h-5 items-center rounded border px-1.5 text-[10px] font-medium',
                riskLevel === 'high'
                  ? 'border-themeAccent-danger/30 bg-themeAccent-danger/10 text-themeAccent-danger'
                  : riskLevel === 'medium'
                    ? 'border-highlight-yellow/40 bg-highlight-yellow/15 text-ink-muted'
                    : 'border-themeAccent-success/30 bg-themeAccent-success/10 text-themeAccent-success'
              )}
            >
              {riskLevel}
            </span>
          ) : null}
          {sourceCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-ink-muted">
              <FileText className="h-3 w-3" />
              {sourceCount}
            </span>
          ) : null}
          {isRolledBack ? (
            <span className="text-[10px] text-ink-soft">已回滚</span>
          ) : null}
        </div>
      </div>

      <p className="mt-2 line-clamp-3 text-xs leading-5 text-ink-muted">{artifact.summary}</p>

      {expandedReason && summary.recommendationReason ? (
        <div className="mt-2 rounded-md border border-line-soft/60 bg-paper-muted/60 px-2 py-1.5 text-[11px] leading-5 text-ink-soft">
          {summary.recommendationReason}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {hasCreateCard && artifact.artifactType === 'card_candidate' ? (
          <ActionButton
            action="create_card"
            label="生成卡片"
            icon={<Layers3 className="h-3 w-3" />}
            variant="write"
            state="idle"
            onClick={() => onAction('create_card')}
          />
        ) : null}
        {summary.availableActions.includes('expand_reason') && summary.recommendationReason ? (
          <ActionButton
            action="expand_reason"
            label={expandedReason ? '收起理由' : '查看理由'}
            icon={<Lightbulb className="h-3 w-3" />}
            variant="safe"
            state="idle"
            onClick={() => setExpandedReason((v) => !v)}
          />
        ) : null}
        {hasRollback && !isRolledBack ? (
          <ActionButton
            action="rollback"
            label="回滚"
            icon={<RotateCcw className="h-3 w-3" />}
            variant="danger"
            state="idle"
            onClick={() => onAction('rollback')}
          />
        ) : null}
      </div>
    </div>
  )
}

function ActionButton({
  action,
  label,
  icon,
  variant,
  state,
  disabled = false,
  onClick,
}: {
  action: string
  label: string
  icon: React.ReactNode
  variant: 'safe' | 'write' | 'danger'
  state: ActionState
  disabled?: boolean
  onClick: () => void
}) {
  const isLoading = state === 'loading'
  const isSuccess = state === 'success'
  const isFailed = state === 'failed'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      data-testid={`artifact-action-${action}`}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] transition',
        variant === 'safe' && 'border-line-soft bg-paper-card text-ink hover:bg-paper-muted',
        variant === 'write' && 'border-ink/10 bg-ink text-paper-base hover:bg-ink/88',
        variant === 'danger' &&
          'border-themeAccent-danger/25 bg-themeAccent-danger/10 text-themeAccent-danger hover:bg-themeAccent-danger/18',
        (disabled || isLoading) && 'cursor-not-allowed opacity-50',
        isSuccess && 'border-themeAccent-success/30 bg-themeAccent-success/10 text-themeAccent-success',
        isFailed && 'border-themeAccent-danger/30 bg-themeAccent-danger/10 text-themeAccent-danger'
      )}
    >
      {isSuccess ? <CheckCircle2 className="h-3 w-3" /> : isFailed ? <XCircle className="h-3 w-3" /> : icon}
      {label}
      {isLoading ? <Spinner className="h-3 w-3" /> : null}
    </button>
  )
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function artifactIcon(type: WorkflowArtifact['artifactType']) {
  switch (type) {
    case 'answer':
      return <Sparkles className="h-3.5 w-3.5 text-ink-soft" />
    case 'evidence':
      return <FileText className="h-3.5 w-3.5 text-ink-soft" />
    case 'card_candidate':
      return <Layers3 className="h-3.5 w-3.5 text-ink-soft" />
    case 'formal_card_write':
      return <CheckCircle2 className="h-3.5 w-3.5 text-themeAccent-success" />
    case 'learning_advice':
      return <Lightbulb className="h-3.5 w-3.5 text-ink-soft" />
    case 'study_schedule_write':
      return <FileText className="h-3.5 w-3.5 text-ink-soft" />
    case 'trace':
      return <ShieldAlert className="h-3.5 w-3.5 text-ink-soft" />
    default:
      return <FileText className="h-3.5 w-3.5 text-ink-soft" />
  }
}

function artifactTypeLabel(type: WorkflowArtifact['artifactType']) {
  switch (type) {
    case 'answer':
      return '回答'
    case 'evidence':
      return '证据'
    case 'card_candidate':
      return '候选卡片'
    case 'formal_card_write':
      return '正式卡片'
    case 'learning_advice':
      return '学习建议'
    case 'study_schedule_write':
      return '学习计划'
    case 'trace':
      return '运行轨迹'
    default:
      return type
  }
}
