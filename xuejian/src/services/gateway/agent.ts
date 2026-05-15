import { workflowArtifactSchema, workflowRunSchema } from '@/types'
import type {
  WorkflowArtifact,
  WorkflowArtifactLifecycleStatus,
  WorkflowArtifactType,
  WorkflowRun,
} from '@/types'
import { invokeWithSchema } from './index'
import { z } from 'zod'

export interface StartAgentTaskInput {
  userRequest: string
  documentIds?: string[]
  cardGroupIds?: string[]
  allowFormalCardWrite?: boolean
}

export interface StartAgentCardGenerationInput {
  userRequest: string
  documentIds: string[]
  cardCountHint?: number
  difficulty?: string
}

export interface ListWorkflowArtifactsInput {
  runId?: string
  artifactType?: WorkflowArtifactType
  lifecycleStatus?: WorkflowArtifactLifecycleStatus
  limit?: number
}

export const agentGateway = {
  async startAgentTask(data: StartAgentTaskInput): Promise<WorkflowRun> {
    return invokeWithSchema('start_agent_task_workflow', workflowRunSchema, { data })
  },

  async startAgentCardGeneration(data: StartAgentCardGenerationInput): Promise<WorkflowRun> {
    return invokeWithSchema('start_agent_card_generation_workflow', workflowRunSchema, { data })
  },

  async getWorkflowArtifact(artifactId: string): Promise<WorkflowArtifact> {
    return invokeWithSchema('get_workflow_artifact', workflowArtifactSchema, { artifactId })
  },

  async listWorkflowArtifacts(filters: ListWorkflowArtifactsInput = {}): Promise<WorkflowArtifact[]> {
    return invokeWithSchema('list_workflow_artifacts', z.array(workflowArtifactSchema), { filters })
  },

  async updateWorkflowArtifactLifecycle(
    artifactId: string,
    lifecycleStatus: WorkflowArtifactLifecycleStatus
  ): Promise<WorkflowArtifact> {
    return invokeWithSchema('update_workflow_artifact_lifecycle', workflowArtifactSchema, {
      artifactId,
      lifecycleStatus,
    })
  },
}
