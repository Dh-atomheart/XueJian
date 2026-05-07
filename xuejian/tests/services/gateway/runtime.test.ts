import { invoke, isTauriEnvironment } from '@/services/gateway/index'

const globalScope = globalThis as typeof globalThis & {
  isTauri?: boolean
}

const tauriWindow = window as Window & {
  __TAURI__?: unknown
  __TAURI_INTERNALS__?: unknown
}

describe('gateway runtime detection', () => {
  afterEach(() => {
    delete tauriWindow.__TAURI__
    delete tauriWindow.__TAURI_INTERNALS__
    delete globalScope.isTauri
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('falls back to mock data outside Tauri', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(isTauriEnvironment()).toBe(false)

    const documents = await invoke('list_documents')

    expect(Array.isArray(documents)).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(
      '[Gateway] Tauri not available, command "list_documents" will return mock data'
    )
  })

  it('recognizes Tauri 2 via __TAURI_INTERNALS__ and uses IPC invoke', async () => {
    const ipcInvoke = vi.fn().mockResolvedValue({ ok: true })
    tauriWindow.__TAURI_INTERNALS__ = {}
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: ipcInvoke }))

    const runtimeModule = await import('@/services/gateway/index')
    const result = await runtimeModule.invoke('pick_and_import_pdf_document')

    expect(runtimeModule.isTauriEnvironment()).toBe(true)
    expect(ipcInvoke).toHaveBeenCalledWith('pick_and_import_pdf_document', undefined)
    expect(result).toEqual({ ok: true })
  })

  it('recognizes Tauri via global isTauri flag', () => {
    globalScope.isTauri = true

    expect(isTauriEnvironment()).toBe(true)
  })

  it('rejects IPC calls that exceed an explicit timeout', async () => {
    vi.useFakeTimers()
    const ipcInvoke = vi.fn(() => new Promise(() => undefined))
    tauriWindow.__TAURI_INTERNALS__ = {}
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: ipcInvoke }))

    const runtimeModule = await import('@/services/gateway/index')
    const promise = runtimeModule.invoke('test_api_connection', undefined, {
      timeoutMs: 20,
      timeoutMessage: 'model health test timed out',
    })
    const expectation = expect(promise).rejects.toMatchObject({
      code: 'INVOKE_TIMEOUT',
      message: 'model health test timed out',
    })

    await vi.advanceTimersByTimeAsync(20)

    await expectation
  })
})
