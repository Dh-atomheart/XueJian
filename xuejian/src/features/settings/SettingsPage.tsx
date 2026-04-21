import { useState } from 'react'
import { SketchButton, SketchCard } from '@/components/ui/Sketch'
import { useAppStore } from '@/lib/store'
import { useAppUiStore } from '@/store'
import { cn } from '@/lib/utils'

export function SettingsPage() {
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const { aiConfig, setAIConfig } = useAppStore()

  const [provider, setProvider] = useState(aiConfig?.provider || 'openai')
  const [apiKey, setApiKey] = useState(aiConfig?.apiKey || '')
  const [baseUrl, setBaseUrl] = useState(aiConfig?.baseUrl || '')
  const [model, setModel] = useState(aiConfig?.model || 'gpt-4')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setAIConfig({
      provider: provider as 'openai' | 'anthropic' | 'google' | 'openai_compatible',
      apiKey,
      baseUrl: baseUrl || undefined,
      model,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const providers = [
    {
      id: 'openai' as const,
      name: 'OpenAI',
      description: 'GPT-4, GPT-3.5 等模型',
      models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    },
    {
      id: 'anthropic' as const,
      name: 'Anthropic',
      description: 'Claude 系列模型',
      models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
    },
    {
      id: 'openai_compatible' as const,
      name: '自定义',
      description: '兼容 OpenAI API 的服务',
      models: [] as string[],
    },
  ]

  const currentProvider = providers.find((p) => p.id === provider)

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 animate-fade-in">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => setActiveNavItem('home')}
          className="p-2 hover:bg-paper-muted rounded-lg transition-colors"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div>
          <p className="text-xs tracking-[0.3em] text-ink-muted uppercase mb-1 font-ui">Settings</p>
          <h1 className="text-2xl font-display font-semibold">设置</h1>
        </div>
      </div>

      {/* AI 配置 */}
      <SketchCard className="mb-6">
        <h2 className="font-medium mb-4">AI 模型配置</h2>
        <p className="text-sm text-ink-muted mb-6">
          配置你的 AI API Key 以启用智能功能。采用 BYOK 策略，密钥仅保存在本地。
        </p>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-3">选择提供商</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {providers.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setProvider(p.id)
                  if (p.models.length > 0) setModel(p.models[0])
                }}
                className={cn(
                  'p-4 rounded-lg border text-left transition-colors',
                  provider === p.id
                    ? 'border-ink/30 bg-paper-muted/50'
                    : 'border-line-soft/60 hover:border-line-soft'
                )}
              >
                <p className="font-medium text-sm">{p.name}</p>
                <p className="text-xs text-ink-muted mt-1">{p.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">API Key</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`输入你的 ${currentProvider?.name} API Key`}
              className="w-full px-4 py-3 pr-12 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ink/10 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-paper-muted rounded transition-colors"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {showKey ? (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" x2="23" y1="1" y2="23" />
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
            </button>
          </div>
          <p className="text-xs text-ink-muted mt-2">密钥仅保存在本地存储中，不会上传到服务器</p>
        </div>

        {provider === 'openai_compatible' && (
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Base URL（可选）</label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              className="w-full px-4 py-3 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ink/10 transition-all"
            />
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">模型</label>
          {currentProvider?.models && currentProvider.models.length > 0 ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-3 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ink/10 transition-all"
            >
              {currentProvider.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="输入模型名称"
              className="w-full px-4 py-3 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ink/10 transition-all"
            />
          )}
        </div>

        <div className="flex items-center gap-4">
          <SketchButton variant="outline" onClick={handleSave}>
            {saved ? '已保存' : '保存配置'}
          </SketchButton>
          {saved && <span className="text-sm text-green-600 animate-fade-in">配置已保存</span>}
        </div>
      </SketchCard>

      {/* 学习设置 */}
      <SketchCard className="mb-6">
        <h2 className="font-medium mb-4">学习设置</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">每日新卡片数量</p>
              <p className="text-xs text-ink-muted">控制每天学习的新卡片上限</p>
            </div>
            <select className="px-3 py-2 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm">
              <option>10</option>
              <option>20</option>
              <option>30</option>
              <option>50</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">每日复习上限</p>
              <p className="text-xs text-ink-muted">控制每天复习卡片的数量</p>
            </div>
            <select className="px-3 py-2 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm">
              <option>50</option>
              <option>100</option>
              <option>200</option>
              <option>无限制</option>
            </select>
          </div>
        </div>
      </SketchCard>

      {/* 关于 */}
      <div className="mt-8 text-center text-sm text-ink-muted">
        <p>学笺 XueJian v1.0.0</p>
        <p className="mt-1">智能学习，从心开始</p>
      </div>
    </div>
  )
}
