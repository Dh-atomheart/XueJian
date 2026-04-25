import { useMemo, useState } from 'react'
import { Button, Panel } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { CardCandidate } from '@/types'

export interface CardCandidatePanelProps {
  candidates: CardCandidate[]
  /** Optional bulk action busy flag from upstream mutations. */
  busy?: boolean
  onAccept?: (candidate: CardCandidate) => void
  onReject?: (candidate: CardCandidate) => void
  onEdit?: (candidate: CardCandidate) => void
  onBulkAccept?: (candidates: CardCandidate[]) => void
  onBulkReject?: (candidates: CardCandidate[]) => void
  emptyHint?: string
  className?: string
}

const STATUS_LABELS: Record<CardCandidate['status'], string> = {
  pending: '待确认',
  accepted: '已接受',
  rejected: '已丢弃',
}

const STATUS_TONES: Record<CardCandidate['status'], string> = {
  pending: 'border-line-soft bg-paper-card',
  accepted: 'border-highlight-green/55 bg-highlight-green/15',
  rejected: 'border-line-soft/60 bg-paper-muted/50 opacity-70',
}

/**
 * Reusable LLM-candidate review panel. Presentational by design: caller
 * passes candidates and accept/edit/reject handlers. Designed to be
 * embedded in `CardStudio`, the Reader's inline suggestion flyout, or
 * any future place that needs the same review UX.
 */
export function CardCandidatePanel({
  candidates,
  busy,
  onAccept,
  onReject,
  onEdit,
  onBulkAccept,
  onBulkReject,
  emptyHint = '当前没有可确认的卡片候选',
  className,
}: CardCandidatePanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const pending = useMemo(
    () => candidates.filter((candidate) => candidate.status === 'pending'),
    [candidates]
  )
  const acceptedCount = candidates.filter((c) => c.status === 'accepted').length
  const rejectedCount = candidates.filter((c) => c.status === 'rejected').length

  const allPendingSelected =
    pending.length > 0 && pending.every((candidate) => selectedIds.has(candidate.id))

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const togglePending = () => {
    if (allPendingSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pending.map((candidate) => candidate.id)))
    }
  }

  const selectedCandidates = candidates.filter((candidate) => selectedIds.has(candidate.id))

  return (
    <Panel
      variant="paperCard"
      className={cn('rounded-[24px] p-5', className)}
      data-testid="card-candidate-panel"
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-ui text-[11px] uppercase tracking-[0.24em] text-ink-soft">卡片候选</p>
          <h3 className="mt-1 font-display text-lg text-ink">
            待确认 {pending.length} · 已接受 {acceptedCount} · 已丢弃 {rejectedCount}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={togglePending}
            disabled={pending.length === 0 || busy}
            data-testid="card-candidate-toggle-pending"
          >
            {allPendingSelected ? '取消全选' : '全选待确认'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selectedCandidates.length === 0 || !onBulkReject || busy}
            onClick={() => onBulkReject?.(selectedCandidates)}
            data-testid="card-candidate-bulk-reject"
          >
            批量丢弃
          </Button>
          <Button
            variant="sketch"
            size="sm"
            disabled={selectedCandidates.length === 0 || !onBulkAccept || busy}
            onClick={() => onBulkAccept?.(selectedCandidates)}
            data-testid="card-candidate-bulk-accept"
          >
            批量接受 ({selectedCandidates.length})
          </Button>
        </div>
      </header>

      {candidates.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-line-soft bg-paper-muted/40 px-4 py-8 text-center">
          <p className="font-body text-sm text-ink-muted">{emptyHint}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {candidates.map((candidate) => {
            const isSelected = selectedIds.has(candidate.id)
            const isPending = candidate.status === 'pending'
            return (
              <li
                key={candidate.id}
                data-testid={`card-candidate-${candidate.id}`}
                className={cn(
                  'rounded-[20px] border px-4 py-4 transition-colors',
                  STATUS_TONES[candidate.status],
                  isSelected && 'ring-1 ring-ink/25'
                )}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleId(candidate.id)}
                    disabled={!isPending || busy}
                    className="mt-1 h-4 w-4 rounded border-line-soft accent-ink"
                    aria-label="选择该候选"
                  />
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-ink/10 bg-paper-card px-2 py-0.5 font-latin text-[10px] uppercase tracking-[0.2em] text-ink-soft">
                        {STATUS_LABELS[candidate.status]}
                      </span>
                      {candidate.sourcePage != null && (
                        <span className="font-latin text-[11px] text-ink-soft">
                          来源 P.{candidate.sourcePage}
                        </span>
                      )}
                      <ConfidenceMeter value={candidate.confidence} />
                      {candidate.scoreOverall != null && (
                        <span className="rounded-full border border-ink/10 bg-paper-card px-2 py-0.5 font-latin text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                          评分 {Math.round(candidate.scoreOverall)}
                        </span>
                      )}
                      {candidate.visibilityBucket && (
                        <span className="rounded-full border border-ink/10 bg-paper-card px-2 py-0.5 font-latin text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                          {formatVisibilityBucket(candidate.visibilityBucket)}
                        </span>
                      )}
                      {candidate.generationMode !== 'llm' && (
                        <span className="rounded-full border border-highlight-yellow/40 bg-highlight-yellow/15 px-2 py-0.5 font-latin text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                          {formatGenerationMode(candidate.generationMode)}
                        </span>
                      )}
                    </div>

                    <div>
                      <p className="font-ui text-sm font-medium text-ink">{candidate.front}</p>
                      <p className="mt-1.5 font-body text-sm leading-6 text-ink/85">
                        {candidate.back}
                      </p>
                    </div>

                    {candidate.sourceQuote && (
                      <blockquote className="rounded-[14px] border-l-2 border-ink/20 bg-paper-muted/60 px-3 py-2 font-body text-xs leading-5 text-ink-muted">
                        {candidate.sourceQuote}
                      </blockquote>
                    )}

                    {candidate.evaluationSummary && (
                      <div className="rounded-[14px] border border-line-soft/60 bg-paper-base/70 px-3 py-2 font-body text-xs leading-5 text-ink-muted">
                        {candidate.evaluationSummary}
                      </div>
                    )}

                    {candidate.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {candidate.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-line-soft bg-paper-card px-2 py-0.5 font-latin text-[10px] text-ink-soft"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {isPending && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          variant="sketch"
                          size="sm"
                          disabled={!onAccept || busy}
                          onClick={() => onAccept?.(candidate)}
                          data-testid={`card-candidate-accept-${candidate.id}`}
                        >
                          接受
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!onEdit || busy}
                          onClick={() => onEdit?.(candidate)}
                          data-testid={`card-candidate-edit-${candidate.id}`}
                        >
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!onReject || busy}
                          onClick={() => onReject?.(candidate)}
                          data-testid={`card-candidate-reject-${candidate.id}`}
                        >
                          丢弃
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

function formatVisibilityBucket(value: NonNullable<CardCandidate['visibilityBucket']>) {
  switch (value) {
    case 'expanded':
      return '扩展展示'
    case 'hidden_low_quality':
      return '低质量候选'
    default:
      return '默认展示'
  }
}

function formatGenerationMode(value: CardCandidate['generationMode']) {
  switch (value) {
    case 'fallback_rule':
      return '规则降级'
    case 'fallback_fts5_only':
      return 'FTS5 降级'
    default:
      return '模型生成'
  }
}

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const tone =
    pct >= 80 ? 'bg-highlight-green' : pct >= 55 ? 'bg-highlight-yellow' : 'bg-highlight-pink'

  return (
    <span
      className="flex items-center gap-1.5 font-latin text-[10px] text-ink-soft"
      title={`置信度 ${pct}%`}
    >
      <span className="block h-1.5 w-16 overflow-hidden rounded-full bg-paper-soft">
        <span className={cn('block h-full', tone)} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums">{pct}%</span>
    </span>
  )
}
