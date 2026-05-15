import { cn } from '@/lib/utils'
import type { RagTrace } from '@/types'

type RagTracePanelProps = {
  ragTrace: RagTrace
}

function rewriteStatusLabel(ragTrace: RagTrace) {
  if (ragTrace.queryRewriteUsed) {
    return '已改写'
  }
  switch (ragTrace.rewriteSummary?.status) {
    case 'failed':
      return '失败回退'
    case 'skipped_no_model':
      return '未启用'
    case 'same_as_original':
      return '保持原问法'
    default:
      return '未触发'
  }
}

function rerankStatusLabel(status?: string | null) {
  switch (status) {
    case 'local_rule':
      return '本地规则'
    case 'llm_provider':
      return 'LLM'
    case 'llm_fallback_local_rule':
      return 'LLM 回退本地'
    case 'disabled':
      return '已关闭'
    case 'single_chunk':
      return '单块直通'
    default:
      return '未启用'
  }
}

function gateDecisionLabel(decision?: string | null) {
  switch (decision) {
    case 'answer':
      return '进入作答'
    case 'second_retrieval':
      return '补检索'
    case 'no_relevant_content':
      return '拒答'
    default:
      return '未启用'
  }
}

function auditStatusLabel(status?: string | null) {
  switch (status) {
    case 'clean':
      return '通过'
    case 'filtered':
      return '部分过滤'
    case 'all_rejected':
      return '全部驳回'
    default:
      return '未执行'
  }
}

function SummaryChip({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'warn'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium',
        tone === 'warn'
          ? 'border-amber-300/70 bg-amber-50 text-amber-900'
          : 'border-border/60 bg-card/80 text-muted-foreground'
      )}
    >
      <span className="text-[10px] uppercase tracking-[0.18em]">{label}</span>
      <span className="text-foreground">{value}</span>
    </span>
  )
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/35 py-1.5 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-full break-all text-right text-foreground">{value}</span>
    </div>
  )
}

export function RagTracePanel({ ragTrace }: RagTracePanelProps) {
  const summaryItems = [
    { label: '检索', value: ragTrace.retrievalMode === 'fts5' ? 'FTS5' : 'Hybrid' },
    { label: '文档', value: `${ragTrace.retrievedDocumentCount} 份` },
    { label: '改写', value: rewriteStatusLabel(ragTrace) },
    { label: '二检索', value: ragTrace.secondRetrievalUsed ? '已补检索' : '未使用' },
    { label: 'Rerank', value: rerankStatusLabel(ragTrace.rerankStatus) },
    {
      label: 'Gate',
      value: gateDecisionLabel(ragTrace.relevanceGateDecision),
      tone:
        ragTrace.relevanceGateDecision === 'no_relevant_content'
          ? ('warn' as const)
          : ('neutral' as const),
    },
    {
      label: 'Audit',
      value: auditStatusLabel(ragTrace.citationAuditStatus),
      tone:
        ragTrace.citationAuditStatus === 'all_rejected' ? ('warn' as const) : ('neutral' as const),
    },
  ]

  if (ragTrace.retrievalSummary.lexicalStatus === 'fallback') {
    summaryItems.splice(1, 0, {
      label: '词法',
      value: '词法降级',
      tone: 'warn' as const,
    })
  }

  // Intentionally whitelist only summary-safe fields here; do not surface prompt text,
  // provider raw responses, full chunk content, API keys, or full conversation history.
  const diagnosticPayload = {
    retrievalSummary: ragTrace.retrievalSummary,
    rewriteSummary: ragTrace.rewriteSummary,
    rerankSummary: ragTrace.rerankSummary,
    relevanceGateSummary: ragTrace.relevanceGateSummary,
    secondRetrievalSummary: ragTrace.secondRetrievalSummary,
    mergeSummary: ragTrace.mergeSummary,
    packingSummary: ragTrace.packingSummary,
    auditSummary: ragTrace.auditSummary,
    failureReason: ragTrace.failureReason,
  }

  return (
    <div
      className="mt-4 rounded-xl border border-border/50 bg-muted/[0.16] px-3 py-3"
      data-testid="knowledge-qa-rag-trace"
    >
      <div className="flex flex-wrap gap-2">
        {summaryItems.map((item) => (
          <SummaryChip key={item.label} label={item.label} value={item.value} tone={item.tone} />
        ))}
      </div>

      <details className="group mt-3 rounded-lg border border-border/45 bg-card/80 px-3 py-2">
        <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground">
          查看 RAG 诊断
        </summary>
        <div className="mt-2 space-y-2 text-xs" data-testid="knowledge-qa-rag-trace-diagnostics">
          <DiagnosticRow
            label="命中块数"
            value={`${ragTrace.retrievalSummary.chunkCount} / ${ragTrace.packingSummary.passageCount}`}
          />
          <DiagnosticRow
            label="最高分"
            value={
              ragTrace.relevanceGateSummary?.topScore != null
                ? `${Math.round(ragTrace.relevanceGateSummary.topScore * 100)}%`
                : '未知'
            }
          />
          <DiagnosticRow
            label="二检索原因"
            value={
              ragTrace.secondRetrievalSummary?.reason ??
              ragTrace.relevanceGateSummary?.reason ??
              '无'
            }
          />
          {ragTrace.retrievalSummary.lexicalStatus === 'fallback' ? (
            <DiagnosticRow
              label="检索提示"
              value="词法检索已降级，建议重建索引或检查 FTS5 是否可用。"
            />
          ) : null}
          {ragTrace.failureReason ? (
            <DiagnosticRow label="失败原因" value={ragTrace.failureReason} />
          ) : null}
          <pre className="overflow-x-auto rounded-md bg-background/80 p-2 text-[11px] leading-5 text-foreground/80">
            {JSON.stringify(diagnosticPayload, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  )
}
