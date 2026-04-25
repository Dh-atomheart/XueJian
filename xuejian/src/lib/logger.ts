import { getErrorMessage } from './appFeedback'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface AppLogEvent {
  level: LogLevel
  scope: string
  message: string
  requestId?: string
  command?: string
  durationMs?: number
  errorCode?: string
  details?: Record<string, unknown>
}

const sensitiveKeyPattern = /(key|secret|token|authorization|password|credential)/i

export const appLogger = {
  debug(scope: string, message: string, details?: Record<string, unknown>) {
    void writeLog({ level: 'debug', scope, message, details })
  },
  info(scope: string, message: string, details?: Record<string, unknown>) {
    void writeLog({ level: 'info', scope, message, details })
  },
  warn(scope: string, message: string, details?: Record<string, unknown>) {
    void writeLog({ level: 'warn', scope, message, details })
  },
  error(scope: string, message: string, error?: unknown, details?: Record<string, unknown>) {
    void writeLog({
      level: 'error',
      scope,
      message,
      details: {
        ...details,
        error: serializeError(error),
      },
    })
  },
  event(event: AppLogEvent) {
    void writeLog(event)
  },
}

export function installGlobalErrorLogging() {
  if (typeof window === 'undefined') {
    return
  }

  window.addEventListener('error', (event) => {
    appLogger.error('frontend.runtime', 'Unhandled window error', event.error ?? event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    appLogger.error('frontend.promise', 'Unhandled promise rejection', event.reason)
  })
}

export function createRequestId(prefix = 'req') {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `${prefix}-${Date.now()}-${random}`
}

function serializeError(error: unknown): Record<string, unknown> | string | null {
  if (!error) {
    return null
  }

  if (error instanceof Error) {
    const errorWithCause = error as Error & { cause?: unknown }
    return sanitizeRecord({
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: serializeError(errorWithCause.cause),
    })
  }

  if (typeof error === 'object') {
    return sanitizeRecord(error as Record<string, unknown>)
  }

  return getErrorMessage(error, String(error))
}

async function writeLog(event: AppLogEvent) {
  const sanitizedEvent = {
    ...event,
    details: event.details ? sanitizeRecord(event.details) : undefined,
  }

  if (!isTauriEnvironment()) {
    writeConsoleFallback(sanitizedEvent)
    return
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('log_frontend_event', { event: sanitizedEvent })
  } catch (error) {
    writeConsoleFallback({
      level: 'warn',
      scope: 'frontend.logger',
      message: `Failed to write app log: ${getErrorMessage(error)}`,
      details: sanitizedEvent.details,
    })
  }
}

function sanitizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      sensitiveKeyPattern.test(key) ? '[redacted]' : sanitizeValue(value),
    ])
  )
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(sanitizeValue)
  }

  if (value && typeof value === 'object') {
    return sanitizeRecord(value as Record<string, unknown>)
  }

  if (typeof value === 'string' && value.length > 1000) {
    return `${value.slice(0, 1000)}...[truncated]`
  }

  return value
}

function writeConsoleFallback(event: AppLogEvent) {
  if (import.meta.env.MODE === 'test') {
    return
  }

  const method = event.level === 'error' ? 'error' : event.level === 'warn' ? 'warn' : 'info'
  console[method](`[${event.scope}] ${event.message}`, event.details ?? '')
}

function isTauriEnvironment(): boolean {
  const globalScope = globalThis as typeof globalThis & { isTauri?: boolean }
  if (globalScope.isTauri === true) {
    return true
  }

  if (typeof window === 'undefined') {
    return false
  }

  const tauriWindow = window as Window & {
    __TAURI__?: unknown
    __TAURI_INTERNALS__?: unknown
  }

  return (
    typeof tauriWindow.__TAURI_INTERNALS__ !== 'undefined' ||
    typeof tauriWindow.__TAURI__ !== 'undefined'
  )
}
