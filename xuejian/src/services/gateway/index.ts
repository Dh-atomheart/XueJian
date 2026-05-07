import type { ZodType } from 'zod'
import { getErrorMessage, reportFeedback } from '@/lib/appFeedback'
import { appLogger, createRequestId } from '@/lib/logger'

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

type InvokeOptions = {
  timeoutMs?: number
  timeoutMessage?: string
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

export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
  options?: InvokeOptions
): Promise<T> {
  const requestId = createRequestId('ipc')
  const startedAt = performance.now()
  let slowWarningShown = false
  const shouldToastSlowCommand = cmd !== 'get_orchestration_service_health'
  const slowWarningTimer =
    typeof window === 'undefined'
      ? undefined
      : window.setTimeout(() => {
          slowWarningShown = true
          appLogger.event({
            level: 'warn',
            scope: 'tauri.command.slow',
            message: 'Command is still running',
            requestId,
            command: cmd,
            durationMs: performance.now() - startedAt,
          })
          if (shouldToastSlowCommand) {
            reportFeedback({
              scope: 'IPC',
              title: '操作仍在执行',
              detail: '后台命令耗时较长，界面会在完成后自动更新。',
              level: 'info',
              showToast: true,
            })
          }
        }, 15_000)

  if (!isTauriEnvironment()) {
    if (slowWarningTimer) window.clearTimeout(slowWarningTimer)
    console.warn(`[Gateway] Tauri not available, command "${cmd}" will return mock data`)
    appLogger.warn('IPC', 'Tauri unavailable, returning mock data', {
      requestId,
      command: cmd,
    })
    return getMockResponse<T>(cmd, args)
  }

  try {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
    const invokePromise = tauriInvoke<T>(cmd, args)
    const result = options?.timeoutMs
      ? await withTimeout(
          invokePromise,
          options.timeoutMs,
          options.timeoutMessage ?? `Command timed out: ${cmd}`,
          () => {
            appLogger.event({
              level: 'error',
              scope: 'IPC',
              message: 'Command timed out',
              requestId,
              command: cmd,
              durationMs: performance.now() - startedAt,
              errorCode: 'INVOKE_TIMEOUT',
            })
          }
        )
      : await invokePromise
    const durationMs = performance.now() - startedAt
    if (slowWarningTimer) window.clearTimeout(slowWarningTimer)

    if (durationMs >= 500) {
      appLogger.event({
        level: 'info',
        scope: 'tauri.command.slow',
        message: 'Slow command completed',
        requestId,
        command: cmd,
        durationMs,
        details: { warningShown: slowWarningShown },
      })
    }

    return result
  } catch (error) {
    const durationMs = performance.now() - startedAt
    if (slowWarningTimer) window.clearTimeout(slowWarningTimer)
    if (error instanceof GatewayError && error.code === 'INVOKE_TIMEOUT') {
      reportFeedback({
        scope: 'IPC',
        title: `Command timed out: ${cmd}`,
        detail: error.message,
        level: 'error',
        showToast: false,
      })
      throw error
    }
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
  args?: Record<string, unknown>,
  options?: InvokeOptions
): Promise<T> {
  const result = await invoke<unknown>(cmd, args, options)
  return schema.parse(result)
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout: () => void
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  return new Promise<T>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      onTimeout()
      reject(new GatewayError(message, 'INVOKE_TIMEOUT'))
    }, timeoutMs)

    promise.then(resolve, reject).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    })
  })
}

async function getMockResponse<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { getMockGatewayResponse } = await import('./mockData')
  return getMockGatewayResponse<T>(cmd, args)
}
