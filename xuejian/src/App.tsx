import { useEffect, useRef } from 'react'
import { AppShell } from '@/components/shell'
import { StickyNotesPanel } from '@/components/documents'
import { Panel } from '@/components/ui'
import { CardStudioPage } from '@/features/cards'
import { DashboardPage } from '@/features/dashboard'
import { LibraryPage, ReaderPage } from '@/features/documents'
import { KnowledgeGraphPage, KnowledgeQaPage } from '@/features/knowledge'
import { PodcastPage } from '@/features/podcast'
import { useApiConfigsQuery, hasUsableApiConfig } from '@/queries'
import { ReviewPage } from '@/features/review'
import { isTauriEnvironment } from '@/services/gateway'
import { SettingsPage } from '@/features/settings'
import { useAppUiStore } from '@/store'

function App() {
  const activeNavItem = useAppUiStore((state) => state.activeNavItem)
  const closeReader = useAppUiStore((state) => state.closeReader)
  const reader = useAppUiStore((state) => state.reader)
  const isContextRailOpen = useAppUiStore((state) => state.isContextRailOpen)
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const { data: apiConfigs = [], isLoading: isLoadingApiConfigs } = useApiConfigsQuery()
  const wasForcedOnboardingRef = useRef(false)

  const shouldForceOnboarding =
    isTauriEnvironment() && !isLoadingApiConfigs && !hasUsableApiConfig(apiConfigs)

  useEffect(() => {
    if (!shouldForceOnboarding) {
      return
    }

    if (reader.documentId) {
      closeReader()
      return
    }

    if (activeNavItem !== 'settings') {
      setActiveNavItem('settings')
    }
  }, [activeNavItem, closeReader, reader.documentId, setActiveNavItem, shouldForceOnboarding])

  useEffect(() => {
    const wasForcedOnboarding = wasForcedOnboardingRef.current
    wasForcedOnboardingRef.current = shouldForceOnboarding

    if (
      wasForcedOnboarding &&
      !shouldForceOnboarding &&
      !reader.documentId &&
      activeNavItem === 'settings'
    ) {
      setActiveNavItem('home')
    }
  }, [activeNavItem, reader.documentId, setActiveNavItem, shouldForceOnboarding])

  if (isTauriEnvironment() && isLoadingApiConfigs) {
    return (
      <AppShell>
        <Panel
          variant="paperCard"
          className="mx-auto mt-16 max-w-lg rounded-[24px] p-8 text-center"
        >
          <p className="text-xs uppercase tracking-[0.24em] text-ink-soft">Local Setup</p>
          <h1 className="mt-3 font-display text-3xl text-ink">正在检查本地模型配置</h1>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            学笺会在本机密钥库中确认是否已经存在可用的模型密钥，然后再决定是否开放主功能。
          </p>
        </Panel>
      </AppShell>
    )
  }

  if (shouldForceOnboarding) {
    return (
      <AppShell>
        <SettingsPage forcedOnboarding />
      </AppShell>
    )
  }

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

  return (
    <AppShell>
      <DashboardPage />
    </AppShell>
  )
}

export default App
