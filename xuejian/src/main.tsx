import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/design-system/ThemeProvider'
import { ErrorBoundary } from '@/components/ui'
import { queryClient } from '@/queries'
import { appLogger, installGlobalErrorLogging } from '@/lib/logger'
import './index.css'
import App from './App'

installGlobalErrorLogging()
appLogger.info('frontend.bootstrap', 'Application frontend mounted')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
)
