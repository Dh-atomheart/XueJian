import { useEffect, useState } from 'react'
import { SketchButton, SketchCard } from '@/components/ui/Sketch'
import { reportAppError } from '@/lib/appFeedback'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useAppSettingsQuery, useUpdateAppSettingsMutation } from '@/queries'
import { useAppUiStore } from '@/store'

const podcastProviderOptions = [
  { value: 'auto', label: '自动选择' },
  { value: 'openai', label: 'OpenAI TTS' },
  { value: 'edge_tts', label: 'Edge TTS' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
  { value: 'fish_audio', label: 'Fish Audio' },
] as const

const formatVoiceOverrides = (value: Record<string, string>) => JSON.stringify(value, null, 2)

export function SettingsPage({ forcedOnboarding = false }: { forcedOnboarding?: boolean }) {
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const { aiConfig, setAIConfig } = useAppStore()
  const { data: settings } = useAppSettingsQuery()
  const updateSettingsMutation = useUpdateAppSettingsMutation()

  const [provider, setProvider] = useState(aiConfig?.provider || 'openai')
  const [apiKey, setApiKey] = useState(aiConfig?.apiKey || '')
  const [baseUrl, setBaseUrl] = useState(aiConfig?.baseUrl || '')
  const [model, setModel] = useState(aiConfig?.model || 'gpt-4')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  const [dailyNewCardLimit, setDailyNewCardLimit] = useState(20)
  const [reviewTimeLimit, setReviewTimeLimit] = useState(30)
  const [podcastTtsProvider, setPodcastTtsProvider] = useState<
    'auto' | 'openai' | 'edge_tts' | 'elevenlabs' | 'fish_audio'
  >('auto')
  const [podcastOpenaiModel, setPodcastOpenaiModel] = useState('tts-1')
  const [podcastFishAudioEndpoint, setPodcastFishAudioEndpoint] = useState('')
  const [podcastOutputFormat, setPodcastOutputFormat] = useState<'mp3' | 'wav'>('mp3')
  const [podcastSkipReview, setPodcastSkipReview] = useState(true)
  const [podcastVoiceOverrides, setPodcastVoiceOverrides] = useState('{}')
  const [settingsSaved, setSettingsSaved] = useState(false)

  useEffect(() => {
    if (!settings) {
      return
    }

    setDailyNewCardLimit(settings.dailyNewCardLimit)
    setReviewTimeLimit(settings.reviewTimeLimit)
    setPodcastTtsProvider(settings.podcastTtsProvider)
    setPodcastOpenaiModel(settings.podcastOpenaiModel)
    setPodcastFishAudioEndpoint(settings.podcastFishAudioEndpoint || '')
    setPodcastOutputFormat(settings.podcastOutputFormat)
    setPodcastSkipReview(settings.podcastSkipReview)
    setPodcastVoiceOverrides(formatVoiceOverrides(settings.podcastVoiceOverrides))
  }, [settings])

  const handleSaveModelConfig = () => {
    setAIConfig({
      provider: provider as 'openai' | 'anthropic' | 'google' | 'openai_compatible',
      apiKey,
      baseUrl: baseUrl || undefined,
      model,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSaveAppSettings = async () => {
    let parsedVoiceOverrides: Record<string, string>
    try {
      const parsed = JSON.parse(podcastVoiceOverrides || '{}')
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('voice override 必须是 JSON 对象')
      }

      parsedVoiceOverrides = Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => {
          if (typeof value !== 'string') {
            throw new Error('voice override 的值必须是字符串')
          }
          return [key, value]
        })
      )
    } catch (error) {
      reportAppError('设置', error, {
        title: 'Voice Overrides 格式错误',
        fallbackDetail: 'voice override 需要是合法 JSON，例如 {"openai:zh-CN:host":"alloy"}。',
      })
      return
    }

    try {
      await updateSettingsMutation.mutateAsync({
        dailyNewCardLimit,
        reviewTimeLimit,
        podcastTtsProvider,
        podcastOpenaiModel: podcastOpenaiModel.trim() || 'tts-1',
        podcastFishAudioEndpoint: podcastFishAudioEndpoint.trim() || null,
        podcastVoiceOverrides: parsedVoiceOverrides,
        podcastOutputFormat,
        podcastSkipReview,
      })
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2000)
    } catch (error) {
      reportAppError('设置', error, {
        title: '应用设置保存失败',
        fallbackDetail: '请检查本地数据库和字段格式。',
      })
    }
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

  const currentProvider = providers.find((item) => item.id === provider)

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 animate-fade-in">
      <div className="flex items-center gap-4 mb-8">
        {!forcedOnboarding ? (
          <button
            onClick={() => setActiveNavItem('home')}
            title="返回首页"
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
        ) : null}
        <div>
          <p className="text-xs tracking-[0.3em] text-ink-muted uppercase mb-1 font-ui">Settings</p>
          <h1 className="text-2xl font-display font-semibold">设置</h1>
          {forcedOnboarding ? (
            <p className="mt-2 text-sm text-ink-muted">
              首次进入前，请先配置至少一组可用的模型凭证。
            </p>
          ) : null}
        </div>
      </div>

      <SketchCard className="mb-6">
        <h2 className="font-medium mb-4">AI 模型配置</h2>
        <p className="text-sm text-ink-muted mb-6">
          配置你的 AI API Key 以启用智能功能。采用 BYOK 策略，密钥仅保存在本地。
        </p>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-3">选择提供商</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {providers.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setProvider(item.id)
                  if (item.models.length > 0) {
                    setModel(item.models[0])
                  }
                }}
                className={cn(
                  'p-4 rounded-lg border text-left transition-colors',
                  provider === item.id
                    ? 'border-ink/30 bg-paper-muted/50'
                    : 'border-line-soft/60 hover:border-line-soft'
                )}
              >
                <p className="font-medium text-sm">{item.name}</p>
                <p className="text-xs text-ink-muted mt-1">{item.description}</p>
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
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={`输入你的 ${currentProvider?.name} API Key`}
              className="w-full px-4 py-3 pr-12 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ink/10 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              title={showKey ? '隐藏密钥' : '显示密钥'}
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

        {provider === 'openai_compatible' ? (
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Base URL（可选）</label>
            <input
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.example.com/v1"
              className="w-full px-4 py-3 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ink/10 transition-all"
            />
          </div>
        ) : null}

        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">模型</label>
          {currentProvider?.models && currentProvider.models.length > 0 ? (
            <select
              value={model}
              onChange={(event) => setModel(event.target.value)}
              title="选择模型"
              className="w-full px-4 py-3 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ink/10 transition-all"
            >
              {currentProvider.models.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="输入模型名称"
              className="w-full px-4 py-3 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ink/10 transition-all"
            />
          )}
        </div>

        <div className="flex items-center gap-4">
          <SketchButton variant="outline" onClick={handleSaveModelConfig}>
            {saved ? '已保存' : '保存配置'}
          </SketchButton>
          {saved ? (
            <span className="text-sm text-green-600 animate-fade-in">配置已保存</span>
          ) : null}
        </div>
      </SketchCard>

      <SketchCard className="mb-6">
        <h2 className="font-medium mb-4">学习设置</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">每日新卡片数量</p>
              <p className="text-xs text-ink-muted">控制每天学习的新卡片上限</p>
            </div>
            <select
              value={dailyNewCardLimit}
              onChange={(event) => setDailyNewCardLimit(Number(event.target.value))}
              title="每日新卡片数量"
              className="px-3 py-2 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm"
            >
              {[10, 20, 30, 50].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">每日复习时长上限</p>
              <p className="text-xs text-ink-muted">单位为分钟，用于限制当天总复习耗时</p>
            </div>
            <select
              value={reviewTimeLimit}
              onChange={(event) => setReviewTimeLimit(Number(event.target.value))}
              title="每日复习时长上限"
              className="px-3 py-2 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm"
            >
              {[15, 30, 45, 60].map((item) => (
                <option key={item} value={item}>
                  {item} 分钟
                </option>
              ))}
            </select>
          </div>
        </div>
      </SketchCard>

      <SketchCard className="mb-6">
        <h2 className="font-medium mb-4">播客与语音</h2>
        <p className="text-sm text-ink-muted mb-6">
          这些值会成为播客工作流的默认参数。关闭跳过审阅后，工作流会在脚本阶段停在
          awaiting_review，等待人工确认再继续生成音频。
        </p>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2">默认 TTS 提供商</label>
            <select
              value={podcastTtsProvider}
              onChange={(event) =>
                setPodcastTtsProvider(
                  event.target.value as 'auto' | 'openai' | 'edge_tts' | 'elevenlabs' | 'fish_audio'
                )
              }
              title="默认 TTS 提供商"
              className="w-full px-4 py-3 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm"
            >
              {podcastProviderOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">OpenAI TTS 模型</label>
            <input
              type="text"
              value={podcastOpenaiModel}
              onChange={(event) => setPodcastOpenaiModel(event.target.value)}
              placeholder="tts-1"
              className="w-full px-4 py-3 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Fish Audio Endpoint</label>
            <input
              type="url"
              value={podcastFishAudioEndpoint}
              onChange={(event) => setPodcastFishAudioEndpoint(event.target.value)}
              placeholder="https://api.fish.audio"
              className="w-full px-4 py-3 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">默认输出格式</label>
            <select
              value={podcastOutputFormat}
              onChange={(event) => setPodcastOutputFormat(event.target.value as 'mp3' | 'wav')}
              title="默认输出格式"
              className="w-full px-4 py-3 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm"
            >
              <option value="mp3">MP3</option>
              <option value="wav">WAV</option>
            </select>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-line-soft/60 p-4 bg-paper-muted/30">
            <input
              type="checkbox"
              checked={podcastSkipReview}
              onChange={(event) => setPodcastSkipReview(event.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium">跳过人工审阅</span>
              <span className="block text-xs text-ink-muted mt-1">
                开启时脚本评估完成后直接进入语音阶段；关闭时会停在脚本审阅状态。
              </span>
            </span>
          </label>

          <div>
            <label className="block text-sm font-medium mb-2">Voice Overrides JSON</label>
            <textarea
              value={podcastVoiceOverrides}
              onChange={(event) => setPodcastVoiceOverrides(event.target.value)}
              rows={6}
              placeholder='{"openai:zh-CN:host":"alloy"}'
              title="Voice Overrides JSON"
              className="w-full px-4 py-3 bg-paper-muted/50 border border-line-soft/60 rounded-lg text-sm font-mono"
            />
            <p className="text-xs text-ink-muted mt-2">
              支持 role、provider:role、provider:language:role 三种 key 形式，例如
              host、openai:host、openai:zh-CN:host。
            </p>
          </div>

          <div className="flex items-center gap-4">
            <SketchButton
              variant="outline"
              onClick={() => {
                void handleSaveAppSettings()
              }}
              disabled={updateSettingsMutation.isPending}
            >
              {updateSettingsMutation.isPending
                ? '保存中...'
                : settingsSaved
                  ? '已保存'
                  : '保存应用设置'}
            </SketchButton>
            {settingsSaved ? (
              <span className="text-sm text-green-600 animate-fade-in">应用设置已保存</span>
            ) : null}
          </div>
        </div>
      </SketchCard>

      <div className="mt-8 text-center text-sm text-ink-muted">
        <p>学笺 XueJian v1.0.0</p>
        <p className="mt-1">智能学习，从心开始</p>
      </div>
    </div>
  )
}
