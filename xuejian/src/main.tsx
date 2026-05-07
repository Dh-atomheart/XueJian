import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/design-system/ThemeProvider'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { queryClient } from '@/queries/queryClient'
import { appLogger, installGlobalErrorLogging } from '@/lib/logger'
import './index.css'
import App from './App'

declare global {
  interface Window {
    __XUEJIAN_BOOT_TIMES__?: {
      htmlScriptStart?: number
      domContentLoaded?: number
      windowLoaded?: number
    }
  }
}

const bootstrapStartedAt = performance.now()
const bootTimes = typeof window === 'undefined' ? undefined : window.__XUEJIAN_BOOT_TIMES__

installGlobalErrorLogging()
if (bootTimes?.htmlScriptStart != null) {
  appLogger.info('frontend.html.script.start', 'HTML boot script started', {
    sinceNavigationStartMs: bootTimes.htmlScriptStart,
  })
}
if (bootTimes?.domContentLoaded != null) {
  appLogger.info('frontend.dom.content.loaded', 'DOM content loaded before bootstrap', {
    sinceNavigationStartMs: bootTimes.domContentLoaded,
    beforeBootstrapMs: bootstrapStartedAt - bootTimes.domContentLoaded,
  })
}
if (bootTimes?.windowLoaded != null) {
  appLogger.info('frontend.window.loaded', 'Window load completed before bootstrap', {
    sinceNavigationStartMs: bootTimes.windowLoaded,
    beforeBootstrapMs: bootstrapStartedAt - bootTimes.windowLoaded,
  })
} else if (typeof window !== 'undefined') {
  window.addEventListener(
    'load',
    () => {
      appLogger.info('frontend.window.loaded', 'Window load completed after bootstrap', {
        sinceNavigationStartMs: performance.now(),
        afterBootstrapMs: performance.now() - bootstrapStartedAt,
      })
    },
    { once: true }
  )
}
appLogger.info('frontend.bootstrap.start', 'Frontend bootstrap started', {
  sinceNavigationStartMs: bootstrapStartedAt,
})

const rootElement = document.getElementById('root')!

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <FrontendReadyProbe bootstrapStartedAt={bootstrapStartedAt} />
          <App />
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
)

appLogger.info('frontend.render.scheduled', 'React render scheduled', {
  durationMs: performance.now() - bootstrapStartedAt,
})

function FrontendReadyProbe({ bootstrapStartedAt }: { bootstrapStartedAt: number }) {
  useEffect(() => {
    document.getElementById('xuejian-boot-shell')?.remove()
    appLogger.info('frontend.first_effect', 'Frontend first effect completed', {
      durationMs: performance.now() - bootstrapStartedAt,
    })
  }, [bootstrapStartedAt])

  return null
}
