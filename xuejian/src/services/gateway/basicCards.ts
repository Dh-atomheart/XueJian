import { z } from 'zod'
import { basicCardGroupSchema, basicCardSchema } from '@/types'
import type { BasicCard, BasicCardGroup } from '@/types'
import { invoke, invokeWithSchema } from './index'

export interface BasicCardFilters {
  groupId?: string | null
  sourceDocumentId?: string | null
  searchQuery?: string | null
  tags?: string[] | null
  includeDeleted?: boolean
}

export interface CreateBasicCardInput {
  groupId: string
  sourceDocumentId?: string | null
  sourceAnchorId?: string | null
  title: string
  front: string
  back: string
  tags?: string[]
}

export interface UpdateBasicCardInput extends CreateBasicCardInput {}

export interface CreateBasicCardGroupInput {
  name: string
  description?: string | null
  color?: string | null
}

export interface UpdateBasicCardGroupInput extends CreateBasicCardGroupInput {}

export const basicCardsGateway = {
  async list(filters: BasicCardFilters = {}): Promise<BasicCard[]> {
    return invokeWithSchema('list_basic_cards', z.array(basicCardSchema), {
      filters: {
        groupId: filters.groupId ?? undefined,
        sourceDocumentId: filters.sourceDocumentId ?? undefined,
        searchQuery: filters.searchQuery ?? undefined,
        tags: filters.tags ?? undefined,
        includeDeleted: filters.includeDeleted ?? undefined,
      },
    })
  },

  async create(data: CreateBasicCardInput): Promise<BasicCard> {
    return invokeWithSchema('create_basic_card', basicCardSchema, { data })
  },

  async update(id: string, data: UpdateBasicCardInput): Promise<BasicCard> {
    return invokeWithSchema('update_basic_card', basicCardSchema, { id, data })
  },

  async delete(id: string): Promise<void> {
    return invoke<void>('delete_basic_card', { id })
  },

  async deleteMany(ids: string[]): Promise<void> {
    return invoke<void>('delete_basic_cards', { ids })
  },

  async listGroups(includeDeleted = false): Promise<BasicCardGroup[]> {
    return invokeWithSchema('list_basic_card_groups', z.array(basicCardGroupSchema), {
      includeDeleted,
    })
  },

  async createGroup(data: CreateBasicCardGroupInput): Promise<BasicCardGroup> {
    return invokeWithSchema('create_basic_card_group', basicCardGroupSchema, { data })
  },

  async updateGroup(id: string, data: UpdateBasicCardGroupInput): Promise<BasicCardGroup> {
    return invokeWithSchema('update_basic_card_group', basicCardGroupSchema, { id, data })
  },

  async setGroupEnabled(id: string, isEnabled: boolean): Promise<BasicCardGroup> {
    return invokeWithSchema('set_basic_card_group_enabled', basicCardGroupSchema, {
      id,
      isEnabled,
    })
  },

  async deleteGroup(id: string): Promise<void> {
    return invoke<void>('delete_basic_card_group', { id })
  },
}
