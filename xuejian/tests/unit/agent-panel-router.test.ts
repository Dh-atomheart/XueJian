import { describe, expect, it } from 'vitest'
import { routeAgentRequest } from '@/features/agent'

describe('agent panel intent router', () => {
  it('routes simple QA to KnowledgeGraph', () => {
    expect(routeAgentRequest('解释当前资料').route).toBe('qa')
    expect(routeAgentRequest('Answer this question from the document').route).toBe('qa')
  })

  it('routes ordinary card generation to CardGraph', () => {
    expect(routeAgentRequest('从当前资料生成卡片').route).toBe('card')
    expect(routeAgentRequest('make flashcards from this document').route).toBe('card')
  })

  it('routes study diagnosis to agent task', () => {
    expect(routeAgentRequest('推荐今天复习的卡组').route).toBe('study')
    expect(routeAgentRequest('diagnose weak review topics').route).toBe('study')
  })

  it('routes multi-intent learning tasks to Supervisor', () => {
    expect(routeAgentRequest('解释资料、生成卡片、给出复习建议').route).toBe('compound')
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
