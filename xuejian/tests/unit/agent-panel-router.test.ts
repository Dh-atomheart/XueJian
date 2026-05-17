import { describe, expect, it } from 'vitest'
import { routeAgentRequest } from '@/features/agent'

describe('agent panel intent router', () => {
  it('routes simple QA to KnowledgeGraph', () => {
    expect(routeAgentRequest('请解释这份文档的核心概念').route).toBe('qa')
    expect(routeAgentRequest('Answer this question from the document').route).toBe('qa')
  })

  it('routes ordinary card generation to CardGraph', () => {
    expect(routeAgentRequest('请根据文档生成闪卡').route).toBe('card')
    expect(routeAgentRequest('make flashcards from this document').route).toBe('card')
  })

  it('routes study diagnosis to agent task', () => {
    expect(routeAgentRequest('诊断我的薄弱复习主题').route).toBe('study')
    expect(routeAgentRequest('diagnose weak review topics').route).toBe('study')
  })

  it('routes multi-intent learning tasks to Supervisor', () => {
    expect(routeAgentRequest('解释文档并生成卡片，再诊断复习弱点').route).toBe('compound')
    expect(routeAgentRequest('Explain this, make cards, and diagnose weak topics').route).toBe(
      'compound'
    )
  })

  it('keeps unclear prompts unexecuted until confirmation', () => {
    const decision = routeAgentRequest('继续')

    expect(decision.route).toBe('ambiguous')
    expect(decision.confidence).toBe('low')
  })
})
