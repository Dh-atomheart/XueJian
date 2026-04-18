import { z } from 'zod'
import { CardAnimationSchema } from '@/types'
import type { CardAnimation } from '@/types'
import { invokeWithSchema } from './index'

export interface StartCardAnimationInput {
  cardId: string
  animType?: 'flashcard_reveal' | 'keyword_emphasis'
}

export async function startCardAnimation(
  input: StartCardAnimationInput
): Promise<CardAnimation> {
  return invokeWithSchema(
    'start_card_animation_workflow',
    CardAnimationSchema,
    { data: input }
  )
}

export async function getCardAnimation(
  cardId: string
): Promise<CardAnimation | null> {
  return invokeWithSchema(
    'get_card_animation',
    CardAnimationSchema.nullable(),
    { cardId }
  )
}

export async function deleteCardAnimation(cardId: string): Promise<void> {
  return invokeWithSchema('delete_card_animation', z.void(), { cardId })
}
