import { useQuery } from '@tanstack/react-query'
import { orchestrationGateway } from '@/services/gateway/orchestration'

export const orchestrationQueryKeys = {
  all: ['orchestration'] as const,
  health: () => [...orchestrationQueryKeys.all, 'health'] as const,
  runs: (limit: number) => [...orchestrationQueryKeys.all, 'runs', limit] as const,
  run: (id: string) => [...orchestrationQueryKeys.all, 'run', id] as const,
  checkpoint: (runId: string, checkpointRef: string | null) =>
    [...orchestrationQueryKeys.all, 'checkpoint', runId, checkpointRef ?? 'latest'] as const,
  events: (runId: string, limit: number) =>
    [...orchestrationQueryKeys.all, 'events', runId, limit] as const,
  manifest: () => [...orchestrationQueryKeys.all, 'manifest'] as const,
}

export function useOrchestrationServiceHealthQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: orchestrationQueryKeys.health(),
    queryFn: () => orchestrationGateway.getHealth(),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}

export function useRecentWorkflowRunsQuery(limit = 5, refetchInterval?: number | false) {
  return useQuery({
    queryKey: orchestrationQueryKeys.runs(limit),
    queryFn: () => orchestrationGateway.listRuns(limit),
    refetchInterval,
  })
}

export function useWorkflowRunQuery(
  id: string | null,
  options?: { refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: orchestrationQueryKeys.run(id ?? 'unknown'),
    queryFn: () => orchestrationGateway.getRun(id!),
    enabled: Boolean(id),
    refetchInterval: options?.refetchInterval,
  })
}

export function useWorkflowCheckpointQuery(
  runId: string | null,
  checkpointRef?: string | null,
  options?: { refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: orchestrationQueryKeys.checkpoint(runId ?? 'unknown', checkpointRef ?? null),
    queryFn: () => orchestrationGateway.getCheckpoint(runId!, checkpointRef),
    enabled: Boolean(runId),
    refetchInterval: options?.refetchInterval,
  })
}

export function useWorkflowEventsQuery(
  runId: string | null,
  limit = 20,
  options?: { refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: orchestrationQueryKeys.events(runId ?? 'unknown', limit),
    queryFn: () => orchestrationGateway.listEvents(runId!, limit),
    enabled: Boolean(runId),
    refetchInterval: options?.refetchInterval,
  })
}

export function useHostGatewayManifestQuery() {
  return useQuery({
    queryKey: orchestrationQueryKeys.manifest(),
    queryFn: () => orchestrationGateway.getManifest(),
    staleTime: 60_000,
  })
}
