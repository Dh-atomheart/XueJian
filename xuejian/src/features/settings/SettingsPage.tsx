import { useEffect, useMemo, useState } from 'react'
import { SettingsPage as SettingsPageView, type SettingsWorkflowAssignment } from '@/components/pages/settings-page'
import {
  useApiConfigsQuery,
  useSetDefaultApiConfigMutation,
  useSetWorkflowAssignmentMutation,
  useStoreApiKeyMutation,
  useTestApiConnectionMutation,
  useWorkflowAssignmentsQuery,
} from '@/queries/apiConfigs'
import { useAppSettingsQuery, useUpdateAppSettingsMutation } from '@/queries/settings'
import { useAppUiStore } from '@/store'
import type { AppSettings } from '@/types'
import { WORKFLOW_DEFINITIONS } from './byok'

export function SettingsPage() {
  const activeTab = useAppUiStore((state) => state.activeSettingsSection)
  const setActiveTab = useAppUiStore((state) => state.setSettingsSection)

  const { data: apiConfigs = [] } = useApiConfigsQuery()
  const { data: workflowAssignments = [] } = useWorkflowAssignmentsQuery()
  const { data: appSettings } = useAppSettingsQuery()
  const setDefaultApiConfig = useSetDefaultApiConfigMutation()
  const storeApiKey = useStoreApiKeyMutation()
  const testApiConnection = useTestApiConnectionMutation()
  const setWorkflowAssignment = useSetWorkflowAssignmentMutation()
  const updateAppSettings = useUpdateAppSettingsMutation()

  const [selectedApiConfigId, setSelectedApiConfigId] = useState<string | null>(null)
  const [draftApiKey, setDraftApiKey] = useState('')
  const [learningSettings, setLearningSettings] = useState({
    dailyNewCardLimit: appSettings?.dailyNewCardLimit ?? 20,
    reviewTimeLimit: appSettings?.reviewTimeLimit ?? 30,
  })
  const [podcastSettings, setPodcastSettings] = useState({
    podcastTtsProvider: appSettings?.podcastTtsProvider ?? 'auto',
    podcastOpenaiModel: appSettings?.podcastOpenaiModel ?? 'tts-1',
    podcastOutputFormat: appSettings?.podcastOutputFormat ?? 'mp3',
  })
  const [generalSettings, setGeneralSettings] = useState({
    language: appSettings?.language ?? 'zh-CN',
    theme: appSettings?.theme ?? 'default',
  })
  const [testResultMessage, setTestResultMessage] = useState<string | null>(null)
  const [testResultTone, setTestResultTone] = useState<'success' | 'error' | null>(null)

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
      podcastOutputFormat: appSettings.podcastOutputFormat,
    })
    setGeneralSettings({
      language: appSettings.language,
      theme: appSettings.theme,
    })
  }, [appSettings])

  const assignmentMap = new Map(workflowAssignments.map((item) => [item.workflowType, item.apiConfigId]))

  const workflowRows = useMemo<SettingsWorkflowAssignment[]>(
    () =>
      WORKFLOW_DEFINITIONS.map((item) => ({
        workflowType: item.type,
        label: item.name,
        description: item.description,
        apiConfigId: assignmentMap.get(item.type) ?? null,
      })),
    [assignmentMap]
  )

  const selectedConfig = apiConfigs.find((item) => item.id === selectedApiConfigId) ?? null

  return (
    <SettingsPageView
      activeTab={activeTab}
      apiConfigs={apiConfigs}
      workflowAssignments={workflowRows}
      learningSettings={learningSettings}
      podcastSettings={podcastSettings}
      generalSettings={generalSettings}
      draftApiKey={draftApiKey}
      selectedApiConfigId={selectedApiConfigId}
      isTestingConnection={testApiConnection.isPending}
      testResultMessage={testResultMessage}
      testResultTone={testResultTone}
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
        storeApiKey.mutate({ configId: selectedConfig.id, apiKey: draftApiKey })
      }}
      onSetDefaultApiConfig={(configId) => setDefaultApiConfig.mutate(configId)}
      onAssignWorkflow={(workflowType, apiConfigId) => {
        if (!apiConfigId) return
        setWorkflowAssignment.mutate({ workflowType, apiConfigId })
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
