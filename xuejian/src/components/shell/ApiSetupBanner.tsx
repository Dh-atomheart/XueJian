import { useState } from 'react'
import { useApiConfigsQuery, hasUsableApiConfig } from '@/queries/apiConfigs'
import { useAppUiStore } from '@/store'

const DISMISS_KEY = 'xuejian_api_banner_dismissed'

export function ApiSetupBanner() {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === 'true'
  )
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const { data: apiConfigs = [], isLoading } = useApiConfigsQuery()

  if (isLoading || hasUsableApiConfig(apiConfigs) || dismissed) {
    return null
  }

  function handleDismiss() {
    sessionStorage.setItem(DISMISS_KEY, 'true')
    setDismissed(true)
  }

  function handleConfigure() {
    setActiveNavItem('settings')
    handleDismiss()
  }

  return (
    <div
      role="alert"
      className="flex items-center justify-between border-b border-themeAccent-warning/30 bg-themeAccent-warning/10 px-4 py-2 text-xs text-ink backdrop-blur-sm"
    >
      <span className="font-ui">
        尚未配置 AI 模型密钥 — AI 功能暂不可用
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleConfigure}
          className="font-ui font-medium underline underline-offset-2 hover:opacity-70 transition-opacity"
        >
          前往配置
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="关闭提示"
          className="text-themeAccent-warning transition-opacity hover:opacity-70"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
