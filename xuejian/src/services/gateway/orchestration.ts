import { z } from 'zod'
import {
  hostGatewayManifestSchema,
  serviceHealthStatusSchema,
  workflowCheckpointSchema,
  workflowEventSchema,
  workflowRunSchema,
} from '@/types'
import type {
  HostGatewayManifest,
  ServiceHealthStatus,
  WorkflowCheckpoint,
  WorkflowEvent,
  WorkflowRun,
} from '@/types'
import { invoke, invokeWithSchema } from './index'

export const orchestrationGateway = {
  async getHealth(): Promise<ServiceHealthStatus> {
    return invokeWithSchema('get_orchestration_service_health', serviceHealthStatusSchema)
  },

  async restart(): Promise<ServiceHealthStatus> {
    return invokeWithSchema('restart_orchestration_service', serviceHealthStatusSchema)
  },

  async stop(): Promise<void> {
    return invoke<void>('stop_orchestration_service')
  },

  async getManifest(): Promise<HostGatewayManifest> {
    return invokeWithSchema('get_host_gateway_manifest', hostGatewayManifestSchema)
  },

  async listRuns(limit = 10): Promise<WorkflowRun[]> {
    return invokeWithSchema('list_workflow_runs', z.array(workflowRunSchema), { limit })
  },

  async getRun(id: string): Promise<WorkflowRun | null> {
    return invokeWithSchema('get_workflow_run', workflowRunSchema.nullable(), { id })
  },

  async listEvents(runId: string, limit = 20): Promise<WorkflowEvent[]> {
    return invokeWithSchema('list_workflow_events', z.array(workflowEventSchema), { runId, limit })
  },

  async getCheckpoint(runId: string, checkpointRef?: string | null): Promise<WorkflowCheckpoint | null> {
    return invokeWithSchema('get_workflow_checkpoint', workflowCheckpointSchema.nullable(), {
      runId,
      checkpointRef: checkpointRef ?? null,
    })
  },
}
