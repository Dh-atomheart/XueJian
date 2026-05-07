import { beforeEach, describe, expect, it } from 'vitest'
import { basicCardsGateway } from '@/services/gateway/basicCards'
import { resetMockGatewayState } from '@/services/gateway/mockData'

beforeEach(() => {
  resetMockGatewayState()
})

describe('basic cards gateway mocks', () => {
  it('lists seeded groups and cards outside Tauri', async () => {
    const groups = await basicCardsGateway.listGroups()
    const cards = await basicCardsGateway.list()

    expect(groups).toHaveLength(2)
    expect(cards).toHaveLength(2)
    expect(cards.some((card) => card.source.documentTitle === 'M4 Reader Mock Notes.pdf')).toBe(
      true
    )
  })

  it('creates, updates, filters, and soft deletes a basic card', async () => {
    const group = await basicCardsGateway.createGroup({ name: '测试分组' })
    const created = await basicCardsGateway.create({
      groupId: group.id,
      sourceDocumentId: '22222222-2222-4222-8222-222222222222',
      title: '测试卡片',
      front: '什么是基础卡片？',
      back: '它是一张只保留 title/front/back/source/tags/group 的手工卡片。',
      tags: ['m04', 'manual'],
    })

    expect(created.groupName).toBe('测试分组')

    const updated = await basicCardsGateway.update(created.id, {
      groupId: group.id,
      sourceDocumentId: '22222222-2222-4222-8222-222222222222',
      title: '更新后的测试卡片',
      front: '为什么要独立 basic cards 链路？',
      back: '为了不把旧的 AI 卡片工作台一起改坏。',
      tags: ['m04'],
    })

    expect(updated.title).toBe('更新后的测试卡片')

    const filtered = await basicCardsGateway.list({ searchQuery: '独立 basic cards' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.id).toBe(created.id)

    await basicCardsGateway.delete(created.id)
    const visible = await basicCardsGateway.list({ searchQuery: '独立 basic cards' })
    expect(visible).toHaveLength(0)
  })

  it('blocks deleting a group that still has active cards', async () => {
    await expect(
      basicCardsGateway.deleteGroup('10101010-1010-4010-8010-101010101010')
    ).rejects.toThrow('分组下仍有未删除卡片')
  })
})
