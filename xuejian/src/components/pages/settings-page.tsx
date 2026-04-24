import type { ChangeEvent } from 'react'
import { BookOpen, KeyRound, Loader2, Mic, Palette, Plus, Settings, Shield } from 'lucide-react'
import { Badge, Button, Card, CardContent, InlineError, Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { ApiConfig, AppSettings, WorkflowType } from '@/types'

export interface SettingsWorkflowAssignment {
  workflowType: WorkflowType
  label: string
  description: string
  apiConfigId: string | null
}

export interface SettingsPageProps {
  activeTab: 'ai' | 'learning' | 'podcast' | 'general'
  apiConfigs: ApiConfig[]
  workflowAssignments: SettingsWorkflowAssignment[]
  learningSettings: Pick<AppSettings, 'dailyNewCardLimit' | 'reviewTimeLimit'>
  podcastSettings: Pick<AppSettings, 'podcastTtsProvider' | 'podcastOpenaiModel' | 'podcastOutputFormat'>
  generalSettings: Pick<AppSettings, 'language' | 'theme'>
  draftApiKey: string
  selectedApiConfigId: string | null
  isTestingConnection?: boolean
  testResultMessage?: string | null
  testResultTone?: 'success' | 'error' | null
  onTabChange: (tab: SettingsPageProps['activeTab']) => void
  onDraftApiKeyChange: (value: string) => void
  onSelectedApiConfigChange: (configId: string) => void
  onTestConnection: () => void
  onSaveApiKey: () => void
  onSetDefaultApiConfig: (configId: string) => void
  onAssignWorkflow: (workflowType: WorkflowType, apiConfigId: string) => void
  onLearningSettingsChange: (patch: Partial<SettingsPageProps['learningSettings']>) => void
  onPodcastSettingsChange: (patch: Partial<SettingsPageProps['podcastSettings']>) => void
  onGeneralSettingsChange: (patch: Partial<SettingsPageProps['generalSettings']>) => void
  onSaveLearning: () => void
  onSavePodcast: () => void
  onSaveGeneral: () => void
}

function PageHeader() {
  return (
    <div className="mb-6">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">SETTINGS</p>
      <h1 className="mt-1 text-2xl font-medium text-foreground" data-testid="app-shell-page-title">
        设置
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">恢复参考编码中的设置导航、Provider 卡片和分区式布局，同时保留真实 BYOK 与工作流分配能力。</p>
    </div>
  )
}

function SettingsNav({
  activeTab,
  onTabChange,
}: {
  activeTab: SettingsPageProps['activeTab']
  onTabChange: SettingsPageProps['onTabChange']
}) {
  const items = [
    { id: 'ai', icon: Settings, label: 'AI 模型' },
    { id: 'learning', icon: BookOpen, label: '学习偏好' },
    { id: 'podcast', icon: Mic, label: '播客与语音' },
    { id: 'general', icon: Palette, label: '通用' },
  ] as const

  return (
    <div className="w-48 shrink-0 space-y-1">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              activeTab === item.id ? 'bg-foreground/5 text-foreground' : 'text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function ProviderCard({
  config,
  selected,
  onSelect,
  onSetDefault,
}: {
  config: ApiConfig
  selected: boolean
  onSelect: () => void
  onSetDefault: () => void
}) {
  const providerLetter = config.provider[0]?.toUpperCase() ?? '?'
  return (
    <Card className={cn('cursor-pointer border-border/50 bg-card transition-all', selected && 'ring-1 ring-foreground/15')} onClick={onSelect}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50 text-sm font-semibold text-foreground">{providerLetter}</div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{config.displayName?.trim() || config.name}</span>
                {config.hasStoredCredential ? (
                  <Badge variant="secondary" className="rounded-md bg-chart-1/15 text-chart-1">
                    已连接
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="rounded-md bg-muted text-muted-foreground">
                    未连接
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{config.model ?? '未设置模型'}</p>
            </div>
          </div>
          {!config.isDefault ? (
            <Button variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-xs" onClick={(e) => { e.stopPropagation(); onSetDefault() }}>
              设为默认
            </Button>
          ) : (
            <Badge variant="outline">默认</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function AiModelSettings(props: Pick<SettingsPageProps, 'apiConfigs' | 'draftApiKey' | 'selectedApiConfigId' | 'isTestingConnection' | 'testResultMessage' | 'testResultTone' | 'workflowAssignments' | 'onDraftApiKeyChange' | 'onSelectedApiConfigChange' | 'onTestConnection' | 'onSaveApiKey' | 'onSetDefaultApiConfig' | 'onAssignWorkflow'>) {
  const selectedConfig = props.apiConfigs.find((config) => config.id === props.selectedApiConfigId) ?? props.apiConfigs[0] ?? null
  return (
    <div className="space-y-6">
      <Card className="border-border/50 bg-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-medium text-foreground">BYOK 供应商配置</h3>
              <p className="mt-1 text-sm text-muted-foreground">继续使用真实 api config 查询和存储，不引入样稿里的 mock store。</p>
            </div>
            <Button variant="outline" size="sm" className="gap-2 rounded-lg">
              <Plus className="h-4 w-4" />
              新增供应商
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            {props.apiConfigs.map((config) => (
              <ProviderCard
                key={config.id}
                config={config}
                selected={selectedConfig?.id === config.id}
                onSelect={() => props.onSelectedApiConfigChange(config.id)}
                onSetDefault={() => props.onSetDefaultApiConfig(config.id)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card">
        <CardContent className="p-6">
          <h4 className="text-sm font-medium text-foreground">连接测试与 Key 存储</h4>
          <div className="mt-4 flex gap-3">
            <Input
              type="password"
              placeholder={selectedConfig ? `为 ${selectedConfig.name} 输入 API Key` : '选择一个供应商后输入 API Key'}
              value={props.draftApiKey}
              onChange={(event: ChangeEvent<HTMLInputElement>) => props.onDraftApiKeyChange(event.target.value)}
              disabled={!selectedConfig}
              className="h-10 rounded-lg"
            />
            <Button variant="outline" className="gap-2 rounded-lg" onClick={props.onTestConnection} disabled={!selectedConfig || !props.draftApiKey.trim() || props.isTestingConnection}>
              {props.isTestingConnection ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              测试连接
            </Button>
            <Button className="gap-2 rounded-lg" onClick={props.onSaveApiKey} disabled={!selectedConfig || !props.draftApiKey.trim()}>
              <KeyRound className="h-4 w-4" />
              保存 Key
            </Button>
          </div>
          {props.testResultMessage ? (
            <div className="mt-4">
              <InlineError message={props.testResultMessage} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card">
        <CardContent className="p-6">
          <h4 className="text-sm font-medium text-foreground">工作流模型分配</h4>
          <p className="mt-1 text-xs text-muted-foreground">按工作流绑定当前真实配置。</p>
          <div className="mt-4 space-y-3">
            {props.workflowAssignments.map((assignment) => (
              <div key={assignment.workflowType} className="flex items-center justify-between border-b border-border/30 py-3 last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{assignment.label}</p>
                  <p className="text-xs text-muted-foreground">{assignment.description}</p>
                </div>
                <select
                  value={assignment.apiConfigId ?? ''}
                  onChange={(event) => props.onAssignWorkflow(assignment.workflowType, event.target.value)}
                  className="h-9 min-w-52 rounded-lg border border-border/50 bg-background px-3 text-sm text-foreground"
                >
                  <option value="">未分配</option>
                  {props.apiConfigs.map((config) => (
                    <option key={config.id} value={config.id}>
                      {config.displayName?.trim() || config.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function SettingsPage(props: SettingsPageProps) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <PageHeader />
      <div className="flex gap-8">
        <SettingsNav activeTab={props.activeTab} onTabChange={props.onTabChange} />
        <div className="flex-1">
          {props.activeTab === 'ai' ? (
            <AiModelSettings {...props} />
          ) : null}

          {props.activeTab === 'learning' ? (
            <Card className="border-border/50 bg-card">
              <CardContent className="space-y-6 p-6">
                <div>
                  <h3 className="text-base font-medium text-foreground">学习偏好</h3>
                  <p className="mt-1 text-sm text-muted-foreground">保留真实设置写入，只重做信息架构和控件层。</p>
                </div>
                <div>
                  <p className="mb-3 text-sm font-medium text-foreground">每日新卡上限</p>
                  <div className="grid grid-cols-4 gap-3">
                    {[10, 20, 30, 50].map((count) => (
                      <Button key={count} variant="outline" className={cn('rounded-lg', props.learningSettings.dailyNewCardLimit === count && 'border-foreground/30 bg-foreground/5')} onClick={() => props.onLearningSettingsChange({ dailyNewCardLimit: count })}>
                        {count}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-3 text-sm font-medium text-foreground">每日复习时长上限</p>
                  <div className="grid grid-cols-4 gap-3">
                    {[15, 30, 45, 60].map((count) => (
                      <Button key={count} variant="outline" className={cn('rounded-lg', props.learningSettings.reviewTimeLimit === count && 'border-foreground/30 bg-foreground/5')} onClick={() => props.onLearningSettingsChange({ reviewTimeLimit: count })}>
                        {count} 分钟
                      </Button>
                    ))}
                  </div>
                </div>
                <Button className="rounded-lg" onClick={props.onSaveLearning}>
                  保存学习设置
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {props.activeTab === 'podcast' ? (
            <Card className="border-border/50 bg-card">
              <CardContent className="space-y-6 p-6">
                <div>
                  <h3 className="text-base font-medium text-foreground">播客与语音</h3>
                  <p className="mt-1 text-sm text-muted-foreground">保留真实播客设置项，但切换到参考页的分区式骨架。</p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">默认 TTS 提供商</span>
                    <select
                      value={props.podcastSettings.podcastTtsProvider}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) => props.onPodcastSettingsChange({ podcastTtsProvider: event.target.value as SettingsPageProps['podcastSettings']['podcastTtsProvider'] })}
                      className="h-10 w-full rounded-lg border border-border/50 bg-background px-3 text-sm text-foreground"
                    >
                      <option value="auto">自动</option>
                      <option value="openai">OpenAI TTS</option>
                      <option value="edge_tts">Edge TTS</option>
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">OpenAI TTS 模型</span>
                    <Input value={props.podcastSettings.podcastOpenaiModel} onChange={(event: ChangeEvent<HTMLInputElement>) => props.onPodcastSettingsChange({ podcastOpenaiModel: event.target.value })} className="h-10 rounded-lg" />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">输出格式</span>
                    <select
                      value={props.podcastSettings.podcastOutputFormat}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) => props.onPodcastSettingsChange({ podcastOutputFormat: event.target.value as SettingsPageProps['podcastSettings']['podcastOutputFormat'] })}
                      className="h-10 w-full rounded-lg border border-border/50 bg-background px-3 text-sm text-foreground"
                    >
                      <option value="mp3">MP3</option>
                      <option value="wav">WAV</option>
                    </select>
                  </label>
                </div>
                <Button className="rounded-lg" onClick={props.onSavePodcast}>
                  保存播客设置
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {props.activeTab === 'general' ? (
            <Card className="border-border/50 bg-card">
              <CardContent className="space-y-6 p-6">
                <div>
                  <h3 className="text-base font-medium text-foreground">通用</h3>
                  <p className="mt-1 text-sm text-muted-foreground">这里保留真实主题与语言设置接口。</p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">语言</span>
                    <select value={props.generalSettings.language} onChange={(event: ChangeEvent<HTMLSelectElement>) => props.onGeneralSettingsChange({ language: event.target.value as SettingsPageProps['generalSettings']['language'] })} className="h-10 w-full rounded-lg border border-border/50 bg-background px-3 text-sm text-foreground">
                      <option value="zh-CN">中文（简体）</option>
                      <option value="en-US">English (US)</option>
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-foreground">主题</span>
                    <Input value={props.generalSettings.theme} onChange={(event: ChangeEvent<HTMLInputElement>) => props.onGeneralSettingsChange({ theme: event.target.value as AppSettings['theme'] })} className="h-10 rounded-lg" />
                  </label>
                </div>
                <Button className="rounded-lg" onClick={props.onSaveGeneral}>
                  保存通用设置
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
