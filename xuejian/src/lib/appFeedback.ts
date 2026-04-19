import { useAppUiStore, type AppFeedbackLevel } from '@/store'

interface ReportFeedbackInput {
  scope: string
  title: string
  detail?: string | null
  level?: AppFeedbackLevel
  showToast?: boolean
}

interface ReportAppErrorOptions {
  title?: string
  fallbackDetail?: string
  showToast?: boolean
}

export function reportFeedback(input: ReportFeedbackInput) {
  return useAppUiStore.getState().reportFeedback(input)
}

export function reportAppError(
  scope: string,
  error: unknown,
  options?: ReportAppErrorOptions
) {
  const detail = getErrorMessage(error, options?.fallbackDetail)

  useAppUiStore.getState().reportFeedback({
    scope,
    title: options?.title ?? `${scope}出现问题`,
    detail,
    level: 'error',
    showToast: options?.showToast ?? true,
  })

  return detail
}

export function getErrorMessage(error: unknown, fallback = '发生了未预期的错误') {
  const detail = extractNestedMessage(error, new Set<object>())
  return detail ?? fallback
}

function extractNestedMessage(error: unknown, seen: Set<object>): string | null {
  if (!error) {
    return null
  }

  if (typeof error === 'string') {
    return error.trim() || null
  }

  if (error instanceof Error) {
    const errorWithCause = error as Error & { cause?: unknown }
    const parts = [error.message, extractNestedMessage(errorWithCause.cause, seen)].filter(Boolean)
    return parts.length > 0 ? Array.from(new Set(parts)).join(' | ') : null
  }

  if (typeof error !== 'object') {
    return null
  }

  if (seen.has(error)) {
    return null
  }
  seen.add(error)

  const candidate = error as {
    message?: unknown
    error?: unknown
    cause?: unknown
    data?: unknown
    details?: unknown
  }

  const parts = [
    extractNestedMessage(candidate.message, seen),
    extractNestedMessage(candidate.error, seen),
    extractNestedMessage(candidate.cause, seen),
    extractNestedMessage(candidate.data, seen),
    extractNestedMessage(candidate.details, seen),
  ].filter(Boolean)

  return parts.length > 0 ? Array.from(new Set(parts)).join(' | ') : null
}