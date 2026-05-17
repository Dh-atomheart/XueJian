import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  FileText,
  Layers3,
  Lightbulb,
  Play,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgentWorkflowSummary } from '../agentResult'

type ActionState = 'idle' | 'loading' | 'success' | 'failed'

interface ActionButtonGroupProps {
  actions: AgentWorkflowSummary['availableActions']
  onAction: (action: AgentWorkflowSummary['availableActions'][number]) => void
  createdCardIds: string[]
  actionStates?: Record<string, ActionState>
}

export function ActionButtonGroup({ actions, onAction, createdCardIds, actionStates = {} }: ActionButtonGroupProps) {
  const safeActions = actions.filter((a) =>
    ['view_sources', 'view_cards', 'start_review', 'expand_reason', 'continue_task', 'retry'].includes(a)
  )
  const writeActions = actions.filter((a) =>
    ['create_card', 'add_to_study_plan', 'undo_created'].includes(a)
  )
  const dangerActions = actions.filter((a) =>
    ['cancel_task', 'rollback'].includes(a)
  )

  return (
    <div className="space-y-2" data-testid="action-button-group">
      {safeActions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {safeActions.map((action) => (
            <ActionButton
              key={action}
              action={action}
              state={actionStates[action] ?? 'idle'}
              onClick={() => onAction(action)}
            />
          ))}
        </div>
      ) : null}
      {writeActions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {writeActions.map((action) => (
            <ActionButton
              key={action}
              action={action}
              state={actionStates[action] ?? 'idle'}
              disabled={action === 'undo_created' && createdCardIds.length === 0}
              onClick={() => onAction(action)}
            />
          ))}
        </div>
      ) : null}
      {dangerActions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {dangerActions.map((action) => (
            <ActionButton
              key={action}
              action={action}
              state={actionStates[action] ?? 'idle'}
              onClick={() => onAction(action)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ActionButton({
  action,
  state,
  disabled,
  onClick,
}: {
  action: AgentWorkflowSummary['availableActions'][number]
  state: ActionState
  disabled?: boolean
  onClick: () => void
}) {
  const isLoading = state === 'loading'
  const isSuccess = state === 'success'
  const isFailed = state === 'failed'

  const group = actionGroup(action)
  const label = actionLabel(action)
  const icon = actionIcon(action)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      data-testid={`action-${action}`}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition',
        group === 'safe' && 'border-line-soft bg-paper-card text-ink hover:bg-paper-muted',
        group === 'write' && 'border-ink/10 bg-ink text-paper-base hover:bg-ink/88',
        group === 'danger' &&
          'border-themeAccent-danger/25 bg-themeAccent-danger/10 text-themeAccent-danger hover:bg-themeAccent-danger/18',
        (disabled || isLoading) && 'cursor-not-allowed opacity-50',
        isSuccess && 'border-themeAccent-success/30 bg-themeAccent-success/10 text-themeAccent-success',
        isFailed && 'border-themeAccent-danger/30 bg-themeAccent-danger/10 text-themeAccent-danger'
      )}
    >
      {isSuccess ? <CheckCircle2 className="h-3.5 w-3.5" /> : isFailed ? <XCircle className="h-3.5 w-3.5" /> : icon}
      {label}
    </button>
  )
}

function actionGroup(action: AgentWorkflowSummary['availableActions'][number]): 'safe' | 'write' | 'danger' {
  switch (action) {
    case 'create_card':
    case 'add_to_study_plan':
    case 'undo_created':
      return 'write'
    case 'cancel_task':
    case 'rollback':
      return 'danger'
    default:
      return 'safe'
  }
}

function actionLabel(action: AgentWorkflowSummary['availableActions'][number]) {
  switch (action) {
    case 'view_sources':
      return '查看来源'
    case 'view_cards':
      return '查看卡片'
    case 'undo_created':
      return '撤销生成'
    case 'start_review':
      return '开始复习'
    case 'retry':
      return '重试'
    case 'create_card':
      return '生成卡片'
    case 'add_to_study_plan':
      return '加入学习计划'
    case 'expand_reason':
      return '查看理由'
    case 'continue_task':
      return '继续任务'
    case 'cancel_task':
      return '取消任务'
    case 'rollback':
      return '回滚'
    default:
      return action
  }
}

function actionIcon(action: AgentWorkflowSummary['availableActions'][number]) {
  switch (action) {
    case 'view_sources':
      return <FileText className="h-3.5 w-3.5" />
    case 'view_cards':
      return <Layers3 className="h-3.5 w-3.5" />
    case 'undo_created':
      return <Trash2 className="h-3.5 w-3.5" />
    case 'start_review':
      return <BookOpenCheck className="h-3.5 w-3.5" />
    case 'retry':
      return <RotateCcw className="h-3.5 w-3.5" />
    case 'create_card':
      return <Layers3 className="h-3.5 w-3.5" />
    case 'add_to_study_plan':
      return <CheckCircle2 className="h-3.5 w-3.5" />
    case 'expand_reason':
      return <Lightbulb className="h-3.5 w-3.5" />
    case 'continue_task':
      return <Play className="h-3.5 w-3.5" />
    case 'cancel_task':
      return <XCircle className="h-3.5 w-3.5" />
    case 'rollback':
      return <RotateCcw className="h-3.5 w-3.5" />
    default:
      return <ArrowRight className="h-3.5 w-3.5" />
  }
}
