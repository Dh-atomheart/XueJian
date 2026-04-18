import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useDocumentImport } from '@/features/documents/useDocumentImport'
import { documentGateway } from '@/services/gateway/documents'

vi.mock('@/services/renderer/pdf', () => ({
  parsePdfDocument: vi.fn(),
}))

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

function ImportHarness() {
  const importState = useDocumentImport()

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void importState.importPdf()
        }}
      >
        import
      </button>
      {importState.error ? <p>{importState.error}</p> : null}
    </div>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useDocumentImport', () => {
  it('shows a clear error and does not call the gateway outside Tauri', async () => {
    const queryClient = createTestQueryClient()
    const pickAndImportSpy = vi.spyOn(documentGateway, 'pickAndImportPdf')

    render(
      <QueryClientProvider client={queryClient}>
        <ImportHarness />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'import' }))

    await waitFor(() => {
      expect(
        screen.getByText('当前运行模式不支持系统文件导入，请使用 npm run tauri:dev 启动桌面应用。')
      ).toBeInTheDocument()
    })

    expect(pickAndImportSpy).not.toHaveBeenCalled()
  })
})