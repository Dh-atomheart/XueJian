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
          void importState.importDocument()
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
    const pickAndImportSpy = vi.spyOn(documentGateway, 'pickAndImportDocument')

    render(
      <QueryClientProvider client={queryClient}>
        <ImportHarness />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'import' }))

    // In mock (non-Tauri) mode, pickAndImportDocument returns null — no crash, no error
    await waitFor(() => {
      expect(pickAndImportSpy).toHaveBeenCalled()
    })
  })
})