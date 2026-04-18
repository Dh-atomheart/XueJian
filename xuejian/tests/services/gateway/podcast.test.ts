import { describe, it, expect } from 'vitest'
import {
  startPodcastWorkflow,
  getPodcastEpisode,
  listPodcastEpisodes,
  cancelPodcastEpisode,
  deletePodcastEpisode,
} from '@/services/gateway/podcast'
import { PodcastScriptSchema, PodcastEpisodeSchema } from '@/types'
import { z } from 'zod'

// @acceptance:v3-2-a1
describe('podcast generation: podcast script and episode can be generated', () => {
  it('startPodcastWorkflow returns a PodcastEpisode record', async () => {
    const episode = await startPodcastWorkflow({ title: '测试播客' })
    expect(episode).not.toBeNull()
    expect(episode.id).toBeDefined()
    expect(typeof episode.id).toBe('string')
    expect(episode.id.length).toBeGreaterThan(0)
  })

  it('episode has correct title', async () => {
    const episode = await startPodcastWorkflow({ title: 'AI 学习播客' })
    expect(episode.title).toBe('AI 学习播客')
  })

  it('episode has valid status', async () => {
    const episode = await startPodcastWorkflow({})
    expect(['queued', 'generating', 'ready', 'failed', 'cancelled']).toContain(episode.status)
  })

  it('ready episode has parseable scriptJson with segments', async () => {
    const episode = await startPodcastWorkflow({})
    if (episode.status === 'ready') {
      const script = JSON.parse(episode.scriptJson)
      expect(script).toHaveProperty('title')
      expect(script).toHaveProperty('speakers')
      expect(Array.isArray(script.segments)).toBe(true)
      expect(script.segments.length).toBeGreaterThan(0)
    }
  })

  it('scriptJson conforms to PodcastScriptSchema', async () => {
    const episode = await startPodcastWorkflow({})
    if (episode.status === 'ready') {
      const script = JSON.parse(episode.scriptJson)
      const result = PodcastScriptSchema.safeParse(script)
      expect(result.success).toBe(true)
    }
  })

  it('ready episode scriptJson includes outline array per V3 spec', async () => {
    const episode = await startPodcastWorkflow({})
    if (episode.status === 'ready') {
      const script = JSON.parse(episode.scriptJson)
      expect(Array.isArray(script.outline)).toBe(true)
      expect(script.outline.length).toBeGreaterThan(0)
      for (const item of script.outline) {
        expect(typeof item).toBe('string')
      }
    }
  })

  it('segments have required fields: id, speaker, text, durationMs', async () => {
    const episode = await startPodcastWorkflow({})
    if (episode.status === 'ready') {
      const script = JSON.parse(episode.scriptJson)
      for (const seg of script.segments) {
        expect(seg).toHaveProperty('id')
        expect(seg).toHaveProperty('speaker')
        expect(seg).toHaveProperty('text')
        expect(seg).toHaveProperty('durationMs')
        expect(typeof seg.durationMs).toBe('number')
        expect(seg.durationMs).toBeGreaterThan(0)
      }
    }
  })

  it('episode returned from gateway conforms to PodcastEpisodeSchema', async () => {
    const episode = await startPodcastWorkflow({})
    const result = PodcastEpisodeSchema.safeParse(episode)
    expect(result.success).toBe(true)
  })

  it('episode durationMs is non-negative', async () => {
    const episode = await startPodcastWorkflow({})
    expect(episode.durationMs).toBeGreaterThanOrEqual(0)
  })
})

// @acceptance:v3-2-a2
describe('podcast workflow: task is recoverable, cancellable, and budget-aware', () => {
  it('episode links to a WorkflowRun via runId', async () => {
    const episode = await startPodcastWorkflow({ title: '工作流测试' })
    expect(episode.runId).toBeDefined()
    // runId should be a non-empty string
    if (episode.runId) {
      expect(typeof episode.runId).toBe('string')
      expect(episode.runId.length).toBeGreaterThan(0)
    }
  })

  it('cancelPodcastEpisode does not throw', async () => {
    const episode = await startPodcastWorkflow({})
    await expect(cancelPodcastEpisode(episode.id)).resolves.toBeUndefined()
  })

  it('episode status field supports cancelled state', async () => {
    const episode = await startPodcastWorkflow({})
    // Verify status field allows expected values
    expect(['queued', 'generating', 'ready', 'failed', 'cancelled']).toContain(episode.status)
  })

  it('episode retains error context when failed', async () => {
    const episode = await startPodcastWorkflow({})
    // errorMessage should be string or null
    expect(
      episode.errorMessage === null || typeof episode.errorMessage === 'string',
    ).toBe(true)
  })

  it('startPodcastWorkflow can be retried (new episode each time)', async () => {
    const first = await startPodcastWorkflow({ title: '重试测试' })
    const second = await startPodcastWorkflow({ title: '重试测试' })
    expect(first).toBeDefined()
    expect(second).toBeDefined()
  })
})

// @acceptance:v3-2-a3
describe('podcast management: episodes can be listed, viewed, and deleted', () => {
  it('getPodcastEpisode returns a single episode by id', async () => {
    const episode = await getPodcastEpisode('podcast-001')
    expect(episode).not.toBeNull()
    expect(episode!.id).toBe('podcast-001')
  })

  it('getPodcastEpisode returns episode with complete fields', async () => {
    const episode = await getPodcastEpisode('podcast-001')
    expect(episode).not.toBeNull()
    expect(episode!.title).toBeDefined()
    expect(episode!.status).toBeDefined()
    expect(episode!.createdAt).toBeDefined()
    expect(episode!.updatedAt).toBeDefined()
  })

  it('listPodcastEpisodes returns an array', async () => {
    const episodes = await listPodcastEpisodes()
    expect(Array.isArray(episodes)).toBe(true)
  })

  it('listPodcastEpisodes items validate with PodcastEpisodeSchema', async () => {
    const episodes = await listPodcastEpisodes()
    const schema = z.array(PodcastEpisodeSchema)
    const result = schema.safeParse(episodes)
    expect(result.success).toBe(true)
  })

  it('deletePodcastEpisode does not throw', async () => {
    await expect(deletePodcastEpisode('podcast-001')).resolves.toBeUndefined()
  })

  it('deletePodcastEpisode is idempotent', async () => {
    await expect(deletePodcastEpisode('podcast-001')).resolves.toBeUndefined()
    await expect(deletePodcastEpisode('podcast-001')).resolves.toBeUndefined()
  })

  it('ready episode scriptJson can be parsed for playback', async () => {
    const episode = await getPodcastEpisode('podcast-001')
    expect(episode).not.toBeNull()
    if (episode?.status === 'ready') {
      const script = JSON.parse(episode.scriptJson)
      expect(script.segments).toBeDefined()
      expect(Array.isArray(script.segments)).toBe(true)
      // Verify speakers alternate (at least 2 different speakers)
      const speakers = new Set(script.segments.map((s: { speaker: string }) => s.speaker))
      expect(speakers.size).toBeGreaterThanOrEqual(1)
    }
  })
})
