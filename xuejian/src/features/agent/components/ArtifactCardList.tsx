import { useEffect, useMemo, useRef, useState } from 'react'
import { agentGateway } from '@/services/gateway/agent'
import type { WorkflowArtifact } from '@/types'
import type { AgentWorkflowSummary } from '../agentResult'
import { ArtifactCard } from './ArtifactCard'

interface ArtifactCardListProps {
  summary: AgentWorkflowSummary
  onAction: (action: AgentWorkflowSummary['availableActions'][number]) => void
}

export function ArtifactCardList({ summary, onAction }: ArtifactCardListProps) {
  const [artifactMap, setArtifactMap] = useState<Record<string, WorkflowArtifact | null>>({})
  const loadedRefsRef = useRef<Set<string>>(new Set())

  const artifactRefs = useMemo(() => {
    const entries = Object.entries(summary.artifactRefs).filter(([, refs]) => refs.length > 0)
    return entries.flatMap(([, refs]) => refs).slice(0, 12)
  }, [summary.artifactRefs])

  useEffect(() => {
    if (artifactRefs.length === 0) return

    const missingRefs = artifactRefs.filter((ref) => !loadedRefsRef.current.has(ref))
    if (missingRefs.length === 0) return

    let cancelled = false
    void Promise.all(
      missingRefs.map(async (ref) => {
        try {
          return [ref, await agentGateway.getWorkflowArtifact(ref)] as const
        } catch {
          return [ref, null] as const
        }
      })
    ).then((items) => {
      if (cancelled) return
      items.forEach(([ref]) => {
        loadedRefsRef.current.add(ref)
      })
      setArtifactMap((current) => ({
        ...current,
        ...Object.fromEntries(items),
      }))
    })

    return () => {
      cancelled = true
    }
  }, [artifactRefs])

  const loadedArtifacts = useMemo(() => {
    return artifactRefs
      .map((ref) => artifactMap[ref])
      .filter((artifact): artifact is WorkflowArtifact => Boolean(artifact))
  }, [artifactRefs, artifactMap])

  if (loadedArtifacts.length === 0 && artifactRefs.length === 0) {
    return null
  }

  return (
    <div className="space-y-2" data-testid="artifact-card-list">
      {loadedArtifacts.length === 0 ? (
        <div className="rounded-lg border border-line-soft bg-paper-base/60 px-3 py-2 text-xs text-ink-muted">
          正在加载工作流产物...
        </div>
      ) : (
        loadedArtifacts.map((artifact) => (
          <ArtifactCard
            key={artifact.artifactId}
            artifact={artifact}
            summary={summary}
            onAction={onAction}
          />
        ))
      )}
    </div>
  )
}
