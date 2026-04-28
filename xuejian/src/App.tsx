import { AppShell } from '@/components/shell'
import { StickyNotesPanel } from '@/components/documents'
import { CardStudioPage } from '@/features/cards'
import { HomePage } from '@/features/dashboard'
import { LibraryPage, ReaderPage } from '@/features/documents'
import { KnowledgeQaPage } from '@/features/knowledge'
import { ProfilePage } from '@/features/profile'
import { ReviewPage } from '@/features/review'
import { SettingsPage } from '@/features/settings'
import { ByokBootstrap } from '@/features/settings/byokMigration'
import { useAppUiStore, type NavItemId } from '@/store'

function App() {
  const activeNavItem = useAppUiStore((state) => state.activeNavItem)
  const reader = useAppUiStore((state) => state.reader)
  const isContextRailOpen = useAppUiStore((state) => state.isContextRailOpen)

  if (reader.documentId) {
    return (
      <AppShell
        contextPanel={
          isContextRailOpen ? <StickyNotesPanel documentId={reader.documentId} /> : undefined
        }
      >
        <ReaderPage documentId={reader.documentId} />
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
      return <LibraryPage />
    case 'cards':
      return <CardStudioPage />
    case 'learning':
      return <ReviewPage />
    case 'knowledge':
      return <KnowledgeQaPage />
    case 'settings':
      return <SettingsPage />
    case 'profile':
      return <ProfilePage />
    case 'home':
    default:
      return <HomePage />
  }
}

export default App
