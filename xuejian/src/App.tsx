import { AppShell } from '@/components/shell'
import { CardStudioPage } from '@/features/cards'
import { DashboardPage } from '@/features/dashboard'
import { LibraryPage } from '@/features/documents'
import { KnowledgeQaPage } from '@/features/knowledge'
import { ReviewPage } from '@/features/review'
import { SettingsPage } from '@/features/settings'
import { ProfilePage } from '@/features/profile'
import { PodcastPage } from '@/features/podcast'
import { GraphPage } from '@/features/graph'
import { useAppUiStore } from '@/store'

function App() {
  const activeNavItem = useAppUiStore((state) => state.activeNavItem)

  const renderPage = () => {
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
      case 'podcast':
        return <PodcastPage />
      case 'graph':
        return <GraphPage />
      default:
        return <DashboardPage />
    }
  }

  return <AppShell>{renderPage()}</AppShell>
}

export default App
