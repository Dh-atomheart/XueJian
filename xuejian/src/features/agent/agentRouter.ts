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
  'summarize',
  '问答',
  '问题',
  '回答',
  '解释',
  '说明',
  '为什么',
  '是什么',
  '怎么',
  '如何',
  '总结',
]

const CARD_TOKENS = [
  'card',
  'cards',
  'flashcard',
  'flashcards',
  'make card',
  'make cards',
  'generate card',
  'generate cards',
  'anki',
  '卡片',
  '闪卡',
  '制卡',
  '生成卡片',
  '制作卡片',
  '生成闪卡',
  '复习卡',
]

const STUDY_TOKENS = [
  'study',
  'review',
  'diagnose',
  'weak',
  'weakness',
  'recommend',
  'recommendation',
  'practice',
  '学习',
  '复习',
  '诊断',
  '薄弱',
  '弱点',
  '推荐',
  '练习',
  '学习计划',
  '复习计划',
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
