import { useEffect, useState } from 'react'
import { SettingsPage as SettingsPageView } from '@/components/pages/settings-page'
import {
  useApiConfigsQuery,
  useCreateApiConfigMutation,
  useDeleteApiConfigMutation,
  useDeleteApiKeyMutation,
  useGetApiKeyMutation,
  useSetDefaultApiConfigMutation,
  useStoreApiKeyMutation,
  useTestApiConnectionMutation,
  useUpdateApiConfigMutation,
  useAppSettingsQuery,
  useCreateModelProfileMutation,
  useDeleteModelProfileMutation,
  useModelProfilesQuery,
  useSetWorkflowAssignmentMutation,
  useUpdateAppSettingsMutation,
  useUpdateModelProfileMutation,
  useWorkflowAssignmentsQuery,
} from '@/queries'
import { reportAppError, reportFeedback } from '@/lib/appFeedback'
import { useAppUiStore } from '@/store'
import type { ApiConfig, AppSettings, WorkflowType } from '@/types'

type KeySaveStatus = 'saving' | 'saved' | 'failed'
type ConnectionStatus = {
  status: 'testing' | 'success' | 'error'
  message?: string
}

function getModelProfileCreateErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (
    message.includes('UNIQUE constraint failed: model_profiles.api_config_id, model_profiles.model_id')
  ) {
    return '该连接下已存在相同模型 ID 的模型档案，请直接使用已有档案或换一个模型 ID。'
  }
  return null
}

export function SettingsPage({ forcedOnboarding = false }: { forcedOnboarding?: boolean } = {}) {
  const activeTab = useAppUiStore((state) => state.activeSettingsSection)
  const setActiveTab = useAppUiStore((state) => state.setSettingsSection)

  const { data: apiConfigs = [] } = useApiConfigsQuery()
  const { data: modelProfiles = [] } = useModelProfilesQuery()
  const { data: workflowAssignmentsData = [] } = useWorkflowAssignmentsQuery()
  const { data: appSettings } = useAppSettingsQuery()
  const createApiConfig = useCreateApiConfigMutation()
  const createModelProfile = useCreateModelProfileMutation()
  const deleteApiConfig = useDeleteApiConfigMutation()
  const deleteApiKey = useDeleteApiKeyMutation()
  const deleteModelProfile = useDeleteModelProfileMutation()
  const getApiKey = useGetApiKeyMutation()
  const setWorkflowAssignment = useSetWorkflowAssignmentMutation()
  const setDefaultApiConfig = useSetDefaultApiConfigMutation()
  const storeApiKey = useStoreApiKeyMutation()
  const testApiConnection = useTestApiConnectionMutation()
  const updateApiConfig = useUpdateApiConfigMutation()
  const updateAppSettings = useUpdateAppSettingsMutation()
  const updateModelProfile = useUpdateModelProfileMutation()

  const [selectedApiConfigId, setSelectedApiConfigId] = useState<string | null>(null)
  const [draftApiKey, setDraftApiKey] = useState('')
  const [learningSettings, setLearningSettings] = useState({
    dailyNewCardLimit: appSettings?.dailyNewCardLimit ?? 20,
    reviewTimeLimit: appSettings?.reviewTimeLimit ?? 30,
  })
  const [podcastSettings, setPodcastSettings] = useState({
    podcastTtsProvider: appSettings?.podcastTtsProvider ?? 'auto',
    podcastOpenaiModel: appSettings?.podcastOpenaiModel ?? 'tts-1',
    podcastGoogleTtsModel: appSettings?.podcastGoogleTtsModel ?? 'gemini-2.5-flash-preview-tts',
    podcastOutputFormat: appSettings?.podcastOutputFormat ?? 'mp3',
  })
  const [generalSettings, setGeneralSettings] = useState({
    language: appSettings?.language ?? 'zh-CN',
    theme: appSettings?.theme ?? 'default',
  })
  const [testResultMessage, setTestResultMessage] = useState<string | null>(null)
  const [testResultTone, setTestResultTone] = useState<'success' | 'error' | null>(null)
  const [keySaveStatusByConfigId, setKeySaveStatusByConfigId] = useState<
    Record<string, KeySaveStatus>
  >({})
  const [connectionStatusByConfigId, setConnectionStatusByConfigId] = useState<
    Record<string, ConnectionStatus>
  >({})
  const [workflowSaveStatusByWorkflowType, setWorkflowSaveStatusByWorkflowType] = useState<
    Partial<Record<WorkflowType, 'saving' | 'saved' | 'failed'>>
  >({})

  useEffect(() => {
    return () => {
      setActiveTab('ai')
    }
  }, [setActiveTab])

  useEffect(() => {
    if (!selectedApiConfigId && apiConfigs[0]) {
      setSelectedApiConfigId(apiConfigs[0].id)
    }
  }, [apiConfigs, selectedApiConfigId])

  useEffect(() => {
    if (!appSettings) return
    setLearningSettings({
      dailyNewCardLimit: appSettings.dailyNewCardLimit,
      reviewTimeLimit: appSettings.reviewTimeLimit,
    })
    setPodcastSettings({
      podcastTtsProvider: appSettings.podcastTtsProvider,
      podcastOpenaiModel: appSettings.podcastOpenaiModel,
      podcastGoogleTtsModel: appSettings.podcastGoogleTtsModel,
      podcastOutputFormat: appSettings.podcastOutputFormat,
    })
    setGeneralSettings({
      language: appSettings.language,
      theme: appSettings.theme,
    })
  }, [appSettings])

  const selectedConfig = apiConfigs.find((item) => item.id === selectedApiConfigId) ?? null
  const workflowAssignments = [
    {
      workflowType: 'card_generation',
      label: '卡片生成',
      description: '用于生成学习卡片。',
    },
    {
      workflowType: 'document_embedding',
      label: '文档向量化',
      description: '用于文档嵌入与索引。',
    },
    {
      workflowType: 'knowledge_qa',
      label: '知识问答',
      description: '用于基于文档的问答。',
    },
  ]
    .map((item) => ({
    ...item,
    modelProfileId:
      workflowAssignmentsData.find((assignment) => assignment.workflowType === item.workflowType)
        ?.modelProfileId ?? null,
  })) as Array<{
    workflowType: WorkflowType
    label: string
    description: string
    modelProfileId: string | null
  }>

  const isConfigCredentialUsable = (config: ApiConfig) =>
    config.authMode === 'adc' ||
    config.hasStoredCredential ||
    keySaveStatusByConfigId[config.id] === 'saved'

  const isConfigCredentialSaving = (configId: string) => keySaveStatusByConfigId[configId] === 'saving'

  return (
    <SettingsPageView
      activeTab={activeTab}
      apiConfigs={apiConfigs}
      modelProfiles={modelProfiles}
      workflowAssignments={workflowAssignments}
      forcedOnboarding={forcedOnboarding}
      learningSettings={learningSettings}
      podcastSettings={podcastSettings}
      generalSettings={generalSettings}
      draftApiKey={draftApiKey}
      selectedApiConfigId={selectedApiConfigId}
      isTestingConnection={testApiConnection.isPending}
      testResultMessage={testResultMessage}
      testResultTone={testResultTone}
      keySaveStatusByConfigId={keySaveStatusByConfigId}
      connectionStatusByConfigId={connectionStatusByConfigId}
      workflowSaveStatusByWorkflowType={workflowSaveStatusByWorkflowType}
      onTabChange={setActiveTab}
      onDraftApiKeyChange={(value) => {
        setDraftApiKey(value)
        setTestResultMessage(null)
        setTestResultTone(null)
      }}
      onSelectedApiConfigChange={setSelectedApiConfigId}
      onTestConnection={() => {
        if (!selectedConfig || !draftApiKey.trim()) return
        testApiConnection.mutate(
          {
            configId: selectedConfig.id,
            provider: selectedConfig.provider,
            authMode: selectedConfig.authMode,
            apiKey: draftApiKey,
            baseUrl: selectedConfig.baseUrl,
            model: selectedConfig.model,
          },
          {
            onSuccess: (result) => {
              setTestResultMessage(result.message)
              setTestResultTone(result.success ? 'success' : 'error')
            },
            onError: (error) => {
              setTestResultMessage(error instanceof Error ? error.message : '连接测试失败')
              setTestResultTone('error')
            },
          }
        )
      }}
      onSaveApiKey={() => {
        if (!selectedConfig || !draftApiKey.trim()) return
        const configId = selectedConfig.id
        setKeySaveStatusByConfigId((state) => ({ ...state, [configId]: 'saving' }))
        void storeApiKey
          .mutateAsync({ configId, apiKey: draftApiKey })
          .then(() => {
            setKeySaveStatusByConfigId((state) => ({ ...state, [configId]: 'saved' }))
            setDraftApiKey('')
            reportFeedback({
              scope: 'BYOK',
              title: 'API Key 已保存',
              detail: `${selectedConfig.displayName?.trim() || selectedConfig.name} 已可用于生成任务。`,
              level: 'info',
            })
          })
          .catch((error) => {
            setKeySaveStatusByConfigId((state) => ({ ...state, [configId]: 'failed' }))
            reportAppError('BYOK', error, {
              title: '保存 API Key 失败',
              fallbackDetail: '请检查密钥内容后重试。',
            })
          })
      }}
      onCreateApiConfig={async ({ apiKey, ...draft }) => {
        try {
          const created = await createApiConfig.mutateAsync(draft)
          setSelectedApiConfigId(created.id)
          setDraftApiKey('')
          reportFeedback({
            scope: 'BYOK',
            title: '配置已创建',
            detail: `${created.displayName?.trim() || created.name} 已加入可用模型列表。`,
            level: 'info',
          })
          const trimmedApiKey = apiKey.trim()
          if (trimmedApiKey) {
            setKeySaveStatusByConfigId((state) => ({ ...state, [created.id]: 'saving' }))
            void storeApiKey
              .mutateAsync({ configId: created.id, apiKey: trimmedApiKey })
              .then(() => {
                setKeySaveStatusByConfigId((state) => ({ ...state, [created.id]: 'saved' }))
              })
              .catch((error) => {
                setKeySaveStatusByConfigId((state) => ({ ...state, [created.id]: 'failed' }))
                reportAppError('BYOK', error, {
                  title: 'API Key 保存失败',
                  fallbackDetail: '配置已创建，但密钥没有成功写入。',
                })
              })
          }
          return created
        } catch (error) {
          reportAppError('BYOK', error, {
            title: '保存配置失败',
            fallbackDetail: '请检查供应商、模型和地址设置。',
          })
          throw error
        }
      }}
      onDeleteApiConfig={(configId) => deleteApiConfig.mutate(configId)}
      onLoadApiKey={(configId) => getApiKey.mutateAsync(configId)}
      onSaveApiConfigEdits={async (configId, patch) => {
        const config = apiConfigs.find((item) => item.id === configId)
        if (!config) {
          throw new Error('配置不存在')
        }
        setKeySaveStatusByConfigId((state) => ({ ...state, [configId]: 'saving' }))
        try {
          await updateApiConfig.mutateAsync({
            id: configId,
            data: {
              name: patch.name,
              displayName: patch.displayName,
              baseUrl: patch.baseUrl,
              model: patch.model,
            },
          })
          await storeApiKey.mutateAsync({ configId, apiKey: patch.apiKey })
          setKeySaveStatusByConfigId((state) => ({ ...state, [configId]: 'saved' }))
          reportFeedback({
            scope: 'BYOK',
            title: '配置已更新',
            detail: `${patch.displayName || patch.name} 已保存最新模型信息和密钥。`,
            level: 'info',
          })
        } catch (error) {
          setKeySaveStatusByConfigId((state) => ({ ...state, [configId]: 'failed' }))
          reportAppError('BYOK', error, {
            title: '更新配置失败',
            fallbackDetail: '模型信息或密钥没有成功保存。',
          })
          throw error
        }
      }}
      onTestApiConfigConnection={(configId) => {
        const config = apiConfigs.find((item) => item.id === configId)
        if (!config) return
        if (isConfigCredentialSaving(configId)) {
          const message = 'API Key 正在保存，请稍后再测试连接。'
          setConnectionStatusByConfigId((state) => ({
            ...state,
            [configId]: { status: 'error', message },
          }))
          reportFeedback({
            scope: 'BYOK',
            title: '连接测试已阻止',
            detail: message,
            level: 'error',
          })
          return
        }
        if (!isConfigCredentialUsable(config)) {
          const message = '请先为当前配置保存可用的 API Key。'
          setConnectionStatusByConfigId((state) => ({
            ...state,
            [configId]: { status: 'error', message },
          }))
          reportFeedback({
            scope: 'BYOK',
            title: '连接测试失败',
            detail: message,
            level: 'error',
          })
          return
        }
        setConnectionStatusByConfigId((state) => ({
          ...state,
          [configId]: { status: 'testing' },
        }))
        testApiConnection.mutate(
          {
            configId: config.id,
            provider: config.provider,
            authMode: config.authMode,
            apiKey: null,
            baseUrl: config.baseUrl,
            model: config.model,
          },
          {
            onSuccess: (result) => {
              setConnectionStatusByConfigId((state) => ({
                ...state,
                [configId]: {
                  status: result.success ? 'success' : 'error',
                  message: result.message,
                },
              }))
              if (!result.success) {
                reportFeedback({
                  scope: 'BYOK',
                  title: '连接测试失败',
                  detail: result.message,
                  level: 'error',
                })
              }
            },
            onError: (error) => {
              const message = error instanceof Error ? error.message : '连接测试失败'
              setConnectionStatusByConfigId((state) => ({
                ...state,
                [configId]: { status: 'error', message },
              }))
              reportFeedback({
                scope: 'BYOK',
                title: '连接测试失败',
                detail: message,
                level: 'error',
              })
            },
          }
        )
      }}
      onDeleteApiKey={async (configId) => {
        try {
          await deleteApiKey.mutateAsync(configId)
          reportFeedback({
            scope: 'BYOK',
            title: 'API Key 已删除',
            detail: '当前配置不再持有可用密钥。',
            level: 'info',
          })
        } catch (error) {
          reportAppError('BYOK', error, {
            title: '删除 Key 失败',
            fallbackDetail: '请稍后再试。',
          })
          throw error
        }
      }}
      deletingApiConfigId={deleteApiConfig.isPending ? deleteApiConfig.variables : undefined}
      isCreatingApiConfig={createApiConfig.isPending}
      isDeletingApiKey={deleteApiKey.isPending}
      onCreateModelProfile={async (draft) => {
        try {
          const created = await createModelProfile.mutateAsync(draft)
          reportFeedback({
            scope: 'BYOK',
            title: '模型档案已创建',
            detail: `${created.displayName?.trim() || created.modelId} 已加入当前连接。`,
            level: 'info',
          })
          return created
        } catch (error) {
          const normalizedError = new Error(
            getModelProfileCreateErrorMessage(error) ??
              (error instanceof Error ? error.message : '创建模型档案失败')
          )
          reportAppError('BYOK', normalizedError, {
            title: '创建模型档案失败',
            fallbackDetail: '请检查模型 ID 是否重复，或稍后重试。',
          })
          throw normalizedError
        }
      }}
      onUpdateModelProfile={async (id, patch) => {
        await updateModelProfile.mutateAsync({ id, data: patch })
      }}
      onDeleteModelProfile={(id) => deleteModelProfile.mutateAsync(id)}
      onSetDefaultApiConfig={(configId) => setDefaultApiConfig.mutate(configId)}
      onAssignWorkflow={(workflowType, modelProfileId) => {
        if (!modelProfileId) return
        setWorkflowSaveStatusByWorkflowType((state) => ({ ...state, [workflowType]: 'saving' }))
        void setWorkflowAssignment
          .mutateAsync({ workflowType, modelProfileId })
          .then((assignment) => {
            setWorkflowSaveStatusByWorkflowType((state) => ({
              ...state,
              [workflowType]: 'saved',
            }))
            reportFeedback({
              scope: 'BYOK',
              title: '工作流分配已生效',
              detail: `${assignment.modelProfile?.displayName?.trim() || assignment.modelProfile?.modelId || '所选模型'} 已用于 ${assignment.workflowType}`,
              level: 'info',
            })
          })
          .catch((error) => {
            setWorkflowSaveStatusByWorkflowType((state) => ({
              ...state,
              [workflowType]: 'failed',
            }))
            reportAppError('BYOK', error, {
              title: '工作流分配失败',
              fallbackDetail: '请检查所选模型是否已启用、连接是否可用，并确认模型类型与工作流匹配。',
            })
          })
      }}
      onLearningSettingsChange={(patch) => setLearningSettings((state) => ({ ...state, ...patch }))}
      onPodcastSettingsChange={(patch) => setPodcastSettings((state) => ({ ...state, ...patch }))}
      onGeneralSettingsChange={(patch) => setGeneralSettings((state) => ({ ...state, ...patch }))}
      onSaveLearning={() => updateSettings(updateAppSettings.mutate, learningSettings)}
      onSavePodcast={() => updateSettings(updateAppSettings.mutate, podcastSettings)}
      onSaveGeneral={() => updateSettings(updateAppSettings.mutate, generalSettings)}
    />
  )
}

function updateSettings(
  mutate: (patch: Partial<AppSettings>) => void,
  patch: Partial<AppSettings>
) {
  mutate(patch)
}
