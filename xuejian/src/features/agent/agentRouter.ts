export type AgentRoute = 'qa' | 'card' | 'study' | 'compound' | 'ambiguous'

export interface AgentRouteDecision {
  route: AgentRoute
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

const QA_TOKENS = [
  'explain',
  'answer',
  'qa',
  'question',
  'what is',
  'why',
  'how',
  '解释',
  '说明',
  '问答',
  '回答',
  '是什么',
  '为什么',
]

const CARD_TOKENS = [
  'card',
  'cards',
  'flashcard',
  'make card',
  'generate card',
  '制卡',
  '卡片',
  '生成卡',
  '做卡',
  '补卡',
]

const STUDY_TOKENS = [
  'study',
  'review',
  'diagnose',
  'weak',
  'recommend',
  'practice',
  '学习',
  '复习',
  '诊断',
  '薄弱',
  '推荐',
  '练习',
  '卡组',
]

function hasAny(text: string, tokens: string[]) {
  return tokens.some((token) => text.includes(token))
}

export function routeAgentRequest(input: string): AgentRouteDecision {
  const text = input.trim().toLowerCase()
  if (!text) {
    return { route: 'ambiguous', confidence: 'low', reason: 'empty_request' }
  }

  const hasQa = hasAny(text, QA_TOKENS)
  const hasCard = hasAny(text, CARD_TOKENS)
  const hasStudy = hasAny(text, STUDY_TOKENS)
  const hitCount = [hasQa, hasCard, hasStudy].filter(Boolean).length

  if (hitCount >= 2) {
    return { route: 'compound', confidence: 'high', reason: 'multiple_learning_intents' }
  }
  if (hasCard) {
    return { route: 'card', confidence: 'high', reason: 'card_generation_intent' }
  }
  if (hasStudy) {
    return { route: 'study', confidence: 'high', reason: 'study_diagnosis_intent' }
  }
  if (hasQa) {
    return { route: 'qa', confidence: 'high', reason: 'knowledge_qa_intent' }
  }
  return { route: 'ambiguous', confidence: 'low', reason: 'no_clear_workflow_intent' }
}
