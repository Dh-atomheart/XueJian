import { CheckCircle2, Clock, Loader2, PauseCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkflowEvent } from '@/types'

interface TaskProgressTimelineProps {
  events: WorkflowEvent[]
}

export function TaskProgressTimeline({ events }: TaskProgressTimelineProps) {
  if (events.length === 0) return null

  const visibleEvents = events.slice(-8)

  return (
    <div className="space-y-2" data-testid="task-progress-timeline">
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-soft">任务进度</div>
      <div className="space-y-1.5">
        {visibleEvents.map((event, index) => (
          <TimelineItem
            key={`${event.runId}-${event.eventType}-${index}`}
            event={event}
            isLast={index === visibleEvents.length - 1}
          />
        ))}
      </div>
    </div>
  )
}

function TimelineItem({ event, isLast }: { event: WorkflowEvent; isLast: boolean }) {
  const Icon = eventTypeIcon(event.eventType)
  const colorClass = eventTypeColor(event.eventType)

  return (
    <div className="flex items-start gap-2">
      <div className="flex flex-col items-center gap-0.5 pt-0.5">
        <div className={cn('flex h-5 w-5 items-center justify-center rounded-full', colorClass)}>
          <Icon className="h-3 w-3" />
        </div>
        {!isLast ? <div className="h-full w-px bg-line-soft" /> : null}
      </div>
      <div className="min-w-0 flex-1 pb-2">
        <div className="flex items-center gap-2">
          <span className={cn('text-[11px] font-medium', eventTypeTextColor(event.eventType))}>
            {eventTypeLabel(event.eventType)}
          </span>
          {typeof event.progress === 'number' ? (
            <span className="text-[10px] text-ink-soft">{Math.round(event.progress * 100)}%</span>
          ) : null}
        </div>
        {event.message ? (
          <p className="mt-0.5 text-[11px] leading-4 text-ink-muted line-clamp-2">{event.message}</p>
        ) : null}
      </div>
    </div>
  )
}

function eventTypeIcon(type: WorkflowEvent['eventType']) {
  switch (type) {
    case 'queued':
      return Clock
    case 'started':
      return Loader2
    case 'progress':
      return Loader2
    case 'waiting_confirmation':
      return PauseCircle
    case 'completed':
      return CheckCircle2
    case 'failed':
      return XCircle
    case 'fallback':
      return Clock
    default:
      return Clock
  }
}

function eventTypeLabel(type: WorkflowEvent['eventType']) {
  switch (type) {
    case 'queued':
      return '已排队'
    case 'started':
      return '已开始'
    case 'progress':
      return '执行中'
    case 'waiting_confirmation':
      return '等待确认'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    case 'fallback':
      return '已降级'
    default:
      return type
  }
}

function eventTypeColor(type: WorkflowEvent['eventType']) {
  switch (type) {
    case 'completed':
      return 'bg-themeAccent-success/15 text-themeAccent-success'
    case 'failed':
      return 'bg-themeAccent-danger/15 text-themeAccent-danger'
    case 'waiting_confirmation':
      return 'bg-highlight-yellow/15 text-ink-muted'
    case 'progress':
      return 'bg-paper-muted text-ink-muted animate-pulse'
    default:
      return 'bg-paper-muted text-ink-soft'
  }
}

function eventTypeTextColor(type: WorkflowEvent['eventType']) {
  switch (type) {
    case 'completed':
      return 'text-themeAccent-success'
    case 'failed':
      return 'text-themeAccent-danger'
    case 'waiting_confirmation':
      return 'text-ink-muted'
    default:
      return 'text-ink-soft'
  }
}
