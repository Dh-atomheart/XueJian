import type { ZodType } from 'zod'
import { getMockGatewayResponse } from './mockData'

/**
 * Gateway 错误类型
 */
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

/**
 * 检查是否在 Tauri 环境中运行
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

/**
 * 调用 Tauri 命令的统一封装
 * 在非 Tauri 环境中返回模拟数据或抛出错误
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriEnvironment()) {
    console.warn(`[Gateway] Tauri not available, command "${cmd}" will return mock data`)
    return getMockResponse<T>(cmd, args)
  }

  try {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
    return await tauriInvoke<T>(cmd, args)
  } catch (error) {
    throw new GatewayError(`Failed to invoke command: ${cmd}`, 'INVOKE_ERROR', error)
  }
}

/**
 * 调用 Tauri 命令并使用 Zod 在 IPC 边界做运行时校验。
 */
export async function invokeWithSchema<T>(
  cmd: string,
  schema: ZodType<T>,
  args?: Record<string, unknown>
): Promise<T> {
  const result = await invoke<unknown>(cmd, args)
  return schema.parse(result)
}

/**
 * 非 Tauri 环境的模拟响应
 */
function getMockResponse<T>(cmd: string, args?: Record<string, unknown>): T {
  return getMockGatewayResponse<T>(cmd, args)
}
