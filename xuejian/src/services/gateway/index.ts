import type { ZodType } from 'zod'
import { getErrorMessage, reportFeedback } from '@/lib/appFeedback'
import { appLogger, createRequestId } from '@/lib/logger'
import { getMockGatewayResponse } from './mockData'

const globalScope = globalThis as typeof globalThis & {
  isTauri?: boolean
}

export class GatewayError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: unknown
  ) {
    super(message)
    this.name = 'GatewayError'
  }
}

export function isTauriEnvironment(): boolean {
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

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const requestId = createRequestId('ipc')
  const startedAt = performance.now()

  if (!isTauriEnvironment()) {
    console.warn(`[Gateway] Tauri not available, command "${cmd}" will return mock data`)
    appLogger.warn('IPC', 'Tauri unavailable, returning mock data', {
      requestId,
      command: cmd,
    })
    return getMockResponse<T>(cmd, args)
  }

  try {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
    const result = await tauriInvoke<T>(cmd, args)
    const durationMs = performance.now() - startedAt

    if (durationMs >= 500) {
      appLogger.event({
        level: 'info',
        scope: 'IPC',
        message: 'Slow command completed',
        requestId,
        command: cmd,
        durationMs,
      })
    }

    return result
  } catch (error) {
    const durationMs = performance.now() - startedAt
    const detail = getErrorMessage(error, 'No lower-level error detail was returned')
    const gatewayError = new GatewayError(
      `Command invocation failed: ${cmd}. ${detail}`,
      'INVOKE_ERROR',
      error
    )

    appLogger.event({
      level: 'error',
      scope: 'IPC',
      message: 'Command failed',
      requestId,
      command: cmd,
      durationMs,
      errorCode: 'INVOKE_ERROR',
      details: { detail },
    })

    reportFeedback({
      scope: 'IPC',
      title: `Command invocation failed: ${cmd}`,
      detail,
      level: 'error',
      showToast: false,
    })

    throw gatewayError
  }
}

export async function invokeWithSchema<T>(
  cmd: string,
  schema: ZodType<T>,
  args?: Record<string, unknown>
): Promise<T> {
  const result = await invoke<unknown>(cmd, args)
  return schema.parse(result)
}

function getMockResponse<T>(cmd: string, args?: Record<string, unknown>): T {
  return getMockGatewayResponse<T>(cmd, args)
}
