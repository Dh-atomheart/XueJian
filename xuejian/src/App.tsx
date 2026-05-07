import { lazy, Suspense } from 'react'
import { AppShell } from '@/components/shell/AppShell'
import { HomePage } from '@/features/dashboard'
import { ByokBootstrap } from '@/features/settings/byokMigration'
import { useAppUiStore, type NavItemId } from '@/store'

const LibraryPage = lazy(() =>
  import('@/features/documents/LibraryPage').then((module) => ({ default: module.LibraryPage }))
)
const ReaderPage = lazy(() =>
  import('@/features/documents/ReaderPage').then((module) => ({ default: module.ReaderPage }))
)
const BasicCardsPage = lazy(() =>
  import('@/features/cards/BasicCardsPage').then((module) => ({ default: module.BasicCardsPage }))
)
const ReviewPage = lazy(() =>
  import('@/features/review/ReviewPage').then((module) => ({ default: module.ReviewPage }))
)
const KnowledgeQaPage = lazy(() =>
  import('@/features/knowledge').then((module) => ({ default: module.KnowledgeQaPage }))
)
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage }))
)

function App() {
  const activeNavItem = useAppUiStore((state) => state.activeNavItem)
  const reader = useAppUiStore((state) => state.reader)

  if (reader.documentId) {
    return (
      <AppShell>
        <Suspense fallback={<RouteFallback label="Preparing reader" />}>
          <ReaderPage documentId={reader.documentId} />
        </Suspense>
      </AppShell>
    )
  }

  return (
    <>
      <ByokBootstrap />
      <AppShell>
        <CurrentPage activeNavItem={activeNavItem} />
      </AppShell>
    </>
  )
}

function CurrentPage({ activeNavItem }: { activeNavItem: NavItemId }) {
  switch (activeNavItem) {
    case 'library':
      return (
        <Suspense fallback={<RouteFallback label="Opening library" />}>
          <LibraryPage />
        </Suspense>
      )
    case 'cards':
      return (
        <Suspense fallback={<RouteFallback label="Opening cards" />}>
          <BasicCardsPage />
        </Suspense>
      )
    case 'learning':
      return (
        <Suspense fallback={<RouteFallback label="Opening review" />}>
          <ReviewPage />
        </Suspense>
      )
    case 'knowledge':
      return (
        <Suspense fallback={<RouteFallback label="Opening knowledge" />}>
          <KnowledgeQaPage />
        </Suspense>
      )
    case 'settings':
      return (
        <Suspense fallback={<RouteFallback label="Opening settings" />}>
          <SettingsPage />
        </Suspense>
      )
    case 'home':
    default:
      return <HomePage />
  }
}

function RouteFallback({ label }: { label: string }) {
  return (
    <div className="flex min-h-[420px] items-center justify-center px-6 text-center text-sm text-ink-muted">
      <div className="space-y-3">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border border-line-soft border-t-ink/60" />
        <p>{label}...</p>
      </div>
    </div>
  )
}

export default App
