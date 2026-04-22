import { AppShell } from '@/components/shell'
import { StickyNotesPanel } from '@/components/documents'
import { CardStudioPage } from '@/features/cards'
import { HomePage } from '@/features/dashboard'
import { LibraryPage, ReaderPage } from '@/features/documents'
import { KnowledgeGraphPage, KnowledgeQaPage } from '@/features/knowledge'
import { PodcastPage } from '@/features/podcast'
import { ProfilePage } from '@/features/profile'
import { ReviewPage } from '@/features/review'
import { SettingsPage } from '@/features/settings'
import { useAppUiStore } from '@/store'

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

  if (activeNavItem === 'library') {
    return (
      <AppShell>
        <LibraryPage />
      </AppShell>
    )
  }

  if (activeNavItem === 'cards') {
    return (
      <AppShell>
        <CardStudioPage />
      </AppShell>
    )
  }

  if (activeNavItem === 'learning') {
    return (
      <AppShell>
        <ReviewPage />
      </AppShell>
    )
  }

  if (activeNavItem === 'knowledge') {
    return (
      <AppShell>
        <KnowledgeQaPage />
      </AppShell>
    )
  }

  if (activeNavItem === 'podcast') {
    return (
      <AppShell>
        <PodcastPage />
      </AppShell>
    )
  }

  if (activeNavItem === 'graph') {
    return (
      <AppShell>
        <KnowledgeGraphPage />
      </AppShell>
    )
  }

  if (activeNavItem === 'settings') {
    return (
      <AppShell>
        <SettingsPage />
      </AppShell>
    )
  }

  if (activeNavItem === 'profile') {
    return (
      <AppShell>
        <ProfilePage />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <HomePage />
    </AppShell>
  )
}

export default App
