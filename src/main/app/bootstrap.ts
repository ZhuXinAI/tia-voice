import { existsSync } from 'fs'
import {
  app,
  BrowserWindow,
  clipboard as electronClipboard,
  dialog,
  Menu,
  Tray,
  globalShortcut,
  nativeImage,
  systemPreferences,
  shell,
  type NativeImage
} from 'electron'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { uIOhook } from 'uiohook-napi'

import { createNutPasteExecutor } from '../actions/NutPasteExecutor'
import { createSettingsStore, type ProviderKind } from '../config/settingsStore'
import { loadAppEnv, type TriggerKey } from '../config/env'
import { createNoopContextProvider } from '../context/NoopContextProvider'
import { createSelectionHookContextProvider } from '../context/SelectionHookContextProvider'
import type { ContextSelection } from '../context/types'
import { createAppHotkeyService } from '../hotkeys/globalHotkeyService'
import {
  buildHotkeyHint,
  getTriggerKeyLabel,
  resolveStartupTriggerKey
} from '../hotkeys/triggerKey'
import { registerMainIpc } from '../ipc/registerMainIpc'
import type {
  AppLanguage,
  HistoryPagePayload,
  LanguagePreference,
  MainAppStatePayload,
  AppInfoPayload,
  PermissionKind,
  PermissionStatePayload,
  PermissionStatus,
  TtsStatePayload,
  ThemeMode
} from '../ipc/channels'
import { getDebugLogPath, logDebug } from '../logging/debugLogger'
import { createEphemeralSessionStore } from '../orchestration/ephemeralSessionStore'
import { createQuestionAnswerPipeline } from '../orchestration/questionAnswerPipeline'
import { createVoicePipeline } from '../orchestration/voicePipeline'
import { createOpenAiAsrProvider } from '../providers/asr/OpenAiAsrProvider'
import { createQwenAsrProvider } from '../providers/asr/QwenAsrProvider'
import {
  createOpenAiCleanupProvider,
  createOpenAiQuestionAnswerProvider
} from '../providers/llm/OpenAiCleanupProvider'
import {
  createQwenCleanupProvider,
  createQwenQuestionAnswerProvider
} from '../providers/llm/QwenCleanupProvider'
import { createCosyVoiceTtsProvider } from '../providers/tts/CosyVoiceTtsProvider'
import type { PostProcessPresetRecord } from '../providers/llm/postProcessPrompts'
import { createMainAppWindow } from '../windows/createMainAppWindow'
import { createQuestionBarWindow } from '../windows/createQuestionBarWindow'
import { createRecordingBarWindow } from '../windows/createRecordingBarWindow'
import { createTtsPlayerWindow } from '../windows/createTtsPlayerWindow'
import { createWindowManager, loadRendererWindow } from '../windows/windowManager'
import {
  checkForUpdates as checkForAutoUpdates,
  getAutoUpdateState,
  initializeAutoUpdater,
  restartToUpdate as restartToInstallUpdate
} from '../updater/autoUpdater'
import { createMicrophonePermissionState } from './microphonePermissionState'
import { resolveAppLanguage } from '../../shared/i18n/config'
import type { DictionaryEntryRecord } from '../../shared/dictionary'
import type { TtsSource } from '../../shared/tts'

const SHOW_MAIN_WINDOW_SHORTCUT = 'CommandOrControl+Shift+Space'
const QUESTION_CAPTURE_SHORTCUT = 'Control+T'
const ACCESSIBILITY_PERMISSION_RECHECK_INTERVAL_MS = 30_000
const ACCESSIBILITY_PERMISSION_PROMPT_COOLDOWN_MS = 5 * 60_000
const HISTORY_PAGE_SIZE = 10
const ACCESSIBILITY_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
const MICROPHONE_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
const DEFAULT_TTS_STATE: TtsStatePayload = {
  status: 'idle',
  sessionId: null,
  source: null,
  text: '',
  audioUrl: null,
  audioExpiresAt: null,
  segments: [],
  voice: null,
  model: null,
  createdAt: null,
  error: null
}
let tray: Tray | null = null

const PROVIDER_LABELS: Record<ProviderKind, { name: string; missingKeyLabel: string }> = {
  dashscope: {
    name: 'DashScope',
    missingKeyLabel: 'DashScope key required'
  },
  openai: {
    name: 'OpenAI',
    missingKeyLabel: 'OpenAI key required'
  }
}

type ResolvedIconAsset = {
  icon: NativeImage
  sourcePath: string
}

type PermissionSnapshot = {
  kind: PermissionKind
  granted: boolean
  status: PermissionStatus
}

type AppPermissionSnapshot = {
  hasMissing: boolean
  accessibility: PermissionSnapshot
  microphone: PermissionSnapshot
}

function bringWindowToFront(window: BrowserWindow): void {
  if (window.isDestroyed()) {
    return
  }

  if (window.isMinimized()) {
    window.restore()
  }

  if (!window.isVisible()) {
    window.show()
  }

  window.focus()
}

function summarizeContextSelection(selection: ContextSelection | null): Record<string, unknown> {
  return {
    hasSelection: Boolean(selection),
    sourceApp: selection?.sourceApp ?? null,
    textLength: selection?.text.length ?? 0,
    hasBounds: Boolean(selection?.bounds)
  }
}

function resolveIconAsset(): ResolvedIconAsset {
  const appPath = app.getAppPath()
  const iconCandidates = [
    join(process.resourcesPath, 'tray.png'),
    join(process.resourcesPath, 'resources', 'tray.png'),
    join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'tray.png'),
    join(appPath, 'resources', 'tray.png'),
    join(appPath, '..', 'app.asar.unpacked', 'resources', 'tray.png'),
    join(__dirname, '../../resources', 'tray.png'),
    join(process.cwd(), 'resources', 'tray.png'),
    join(process.cwd(), 'build', 'tray.png')
  ]

  for (const iconPath of iconCandidates) {
    if (!existsSync(iconPath)) {
      continue
    }

    const icon = nativeImage.createFromPath(iconPath)
    if (!icon.isEmpty()) {
      return { icon, sourcePath: iconPath }
    }
  }

  return {
    icon: nativeImage.createFromPath(process.execPath),
    sourcePath: process.execPath
  }
}

function resolveTrayIcon(): ResolvedIconAsset {
  const resolved = resolveIconAsset()
  if (process.platform !== 'darwin') {
    return resolved
  }

  const trayIcon = resolved.icon.resize({ width: 24, height: 24 })
  trayIcon.setTemplateImage(true)
  return {
    icon: trayIcon,
    sourcePath: resolved.sourcePath
  }
}

function getPreferredSystemLocales(): string[] {
  try {
    const preferred = app.getPreferredSystemLanguages?.()
    if (Array.isArray(preferred) && preferred.length > 0) {
      return preferred
    }
  } catch (error) {
    logDebug('app', 'Unable to read preferred system languages', { error })
  }

  try {
    const locale = app.getLocale()
    if (typeof locale === 'string' && locale.trim() !== '') {
      return [locale]
    }
  } catch (error) {
    logDebug('app', 'Unable to read app locale', { error })
  }

  return ['en']
}

function translatePermissionLabel(
  language: AppLanguage,
  snapshot: PermissionSnapshot
): {
  label: string
  description: string
  ctaLabel: string
} {
  if (language === 'zh-CN') {
    if (snapshot.kind === 'accessibility') {
      return snapshot.granted
        ? {
            label: '辅助功能权限已开启',
            description: 'TIA Voice 现在可以监听全局按住说话快捷键。',
            ctaLabel: '打开辅助功能设置'
          }
        : {
            label: '需要辅助功能权限',
            description:
              '请在系统设置中开启辅助功能权限，授权后 TIA Voice 才能响应按住说话快捷键。',
            ctaLabel: '打开辅助功能设置'
          }
    }

    return snapshot.granted
      ? {
          label: '麦克风权限已开启',
          description: 'TIA Voice 现在可以访问麦克风进行语音输入。',
          ctaLabel: '打开麦克风设置'
        }
      : {
          label: snapshot.status === 'not-determined' ? '麦克风权限待确认' : '需要麦克风权限',
          description: '请在系统设置中开启麦克风权限，授权后 TIA Voice 才能接收语音输入。',
          ctaLabel: snapshot.status === 'not-determined' ? '请求麦克风权限' : '打开麦克风设置'
        }
  }

  if (language === 'zh-TW') {
    if (snapshot.kind === 'accessibility') {
      return snapshot.granted
        ? {
            label: '輔助使用權限已開啟',
            description: 'TIA Voice 現在可以監聽全域按住說話快捷鍵。',
            ctaLabel: '打開輔助使用設定'
          }
        : {
            label: '需要輔助使用權限',
            description:
              '請在系統設定中開啟輔助使用權限，授權後 TIA Voice 才能回應全域按住說話快捷鍵。',
            ctaLabel: '打開輔助使用設定'
          }
    }

    return snapshot.granted
      ? {
          label: '麥克風權限已開啟',
          description: 'TIA Voice 現在可以存取麥克風進行語音輸入。',
          ctaLabel: '打開麥克風設定'
        }
      : {
          label: snapshot.status === 'not-determined' ? '麥克風權限待確認' : '需要麥克風權限',
          description: '請在系統設定中開啟麥克風權限，授權後 TIA Voice 才能接收語音輸入。',
          ctaLabel: snapshot.status === 'not-determined' ? '請求麥克風權限' : '打開麥克風設定'
        }
  }

  if (snapshot.kind === 'accessibility') {
    return snapshot.granted
      ? {
          label: 'Accessibility enabled',
          description: 'TIA Voice can listen for the global push-to-talk key.',
          ctaLabel: 'Open Accessibility Settings'
        }
      : {
          label: 'Accessibility required',
          description:
            'Enable Accessibility in System Settings so TIA Voice can listen for your global push-to-talk key.',
          ctaLabel: 'Open Accessibility Settings'
        }
  }

  return snapshot.granted
    ? {
        label: 'Microphone enabled',
        description: 'TIA Voice can access the microphone for dictation.',
        ctaLabel: 'Open Microphone Settings'
      }
    : {
        label:
          snapshot.status === 'not-determined'
            ? 'Microphone permission pending'
            : 'Microphone required',
        description: 'Enable microphone access in System Settings so TIA Voice can capture speech.',
        ctaLabel:
          snapshot.status === 'not-determined'
            ? 'Request Microphone Permission'
            : 'Open Microphone Settings'
      }
}

function buildPermissionState(
  snapshot: PermissionSnapshot,
  language: AppLanguage
): PermissionStatePayload {
  const translated = translatePermissionLabel(language, snapshot)

  if (snapshot.kind === 'accessibility') {
    return {
      kind: snapshot.kind,
      granted: snapshot.granted,
      status: snapshot.status,
      ...translated
    }
  }

  return {
    kind: snapshot.kind,
    granted: snapshot.granted,
    status: snapshot.status,
    ...translated
  }
}

function getAccessibilityPermissionSnapshot(): PermissionSnapshot {
  return {
    kind: 'accessibility',
    granted: checkAccessibilityPermission(false),
    status: checkAccessibilityPermission(false) ? 'granted' : 'denied'
  }
}

function countWords(text: string): number {
  const tokens = text.trim().match(/[\p{L}\p{N}'-]+/gu)
  return tokens?.length ?? 0
}

function toHistoryListItem(input: {
  id: string
  createdAt: number
  cleanedText: string
  transcript: string
  status: 'pending' | 'completed' | 'failed'
  errorDetail?: string
  audio?: { fileName: string }
}): MainAppStatePayload['history'][number] {
  return {
    id: input.id,
    createdAt: input.createdAt,
    title: input.transcript.slice(0, 36) || 'Voice transcription',
    preview: input.cleanedText || input.transcript || '',
    status: input.status,
    errorDetail: input.errorDetail,
    hasAudio: Boolean(input.audio?.fileName)
  }
}

function buildHistoryPage(input: {
  items: Array<{
    id: string
    createdAt: number
    cleanedText: string
    transcript: string
    status: 'pending' | 'completed' | 'failed'
    errorDetail?: string
    audio?: { fileName: string }
  }>
  totalCount: number
}): HistoryPagePayload {
  return {
    items: input.items.map(toHistoryListItem),
    totalCount: input.totalCount
  }
}

function toQuestionHistoryListItem(input: {
  id: string
  createdAt: number
  question: string
  answer: string
  selectedText: string | null
  sourceApp: string | null
  status: 'pending' | 'completed' | 'failed'
  errorDetail?: string
}): MainAppStatePayload['questionHistory'][number] {
  return {
    id: input.id,
    createdAt: input.createdAt,
    question: input.question,
    answer: input.answer,
    selectedText: input.selectedText,
    sourceApp: input.sourceApp,
    status: input.status,
    errorDetail: input.errorDetail
  }
}

function buildQuestionHistoryPage(input: {
  items: Array<{
    id: string
    createdAt: number
    question: string
    answer: string
    selectedText: string | null
    sourceApp: string | null
    status: 'pending' | 'completed' | 'failed'
    errorDetail?: string
  }>
  totalCount: number
}): {
  items: MainAppStatePayload['questionHistory']
  totalCount: number
} {
  return {
    items: input.items.map(toQuestionHistoryListItem),
    totalCount: input.totalCount
  }
}

function buildMainAppState(input: {
  appInfo: AppInfoPayload
  registeredHotkey: TriggerKey | null
  hotkeyReady: boolean
  selectedProvider: ProviderKind
  selectedMicrophone: {
    deviceId: string | null
    label: string | null
  }
  languagePreference: LanguagePreference
  resolvedLanguage: AppLanguage
  themeMode: ThemeMode
  autoTextToSpeechEnabled: boolean
  dictionaryEntries: DictionaryEntryRecord[]
  postProcessPreset: import('../ipc/channels').PostProcessPresetId
  postProcessPresets: PostProcessPresetRecord[]
  providers: { asr: string; llm: string }
  dashscopeModels: { asr: string; llm: string }
  openAiModels: { asr: string; llm: string }
  dashscopeAvailableLlmModels: string[]
  openAiAvailableLlmModels: string[]
  providerConfigured: boolean
  providerKeyLabel: string | null
  dashscopeKeyLabel: string | null
  openAiKeyLabel: string | null
  onboardingCompleted: boolean
  onboardingVisible: boolean
  permissions: AppPermissionSnapshot
  autoUpdate: MainAppStatePayload['autoUpdate']
  history: Array<{
    id: string
    createdAt: number
    cleanedText: string
    transcript: string
    status: 'pending' | 'completed' | 'failed'
    errorDetail?: string
    audio?: { fileName: string }
  }>
  questionHistory: Array<{
    id: string
    createdAt: number
    question: string
    answer: string
    selectedText: string | null
    sourceApp: string | null
    status: 'pending' | 'completed' | 'failed'
    errorDetail?: string
  }>
}): MainAppStatePayload {
  const historyByTime = [...input.history].sort((a, b) => b.createdAt - a.createdAt)
  const questionHistoryByTime = [...input.questionHistory].sort((a, b) => b.createdAt - a.createdAt)
  const wordsSpoken = historyByTime.reduce(
    (sum, item) => sum + countWords(item.cleanedText || item.transcript || ''),
    0
  )
  const averageWpm = (() => {
    if (historyByTime.length < 2 || wordsSpoken === 0) {
      return null
    }

    const oldestCreatedAt = historyByTime[historyByTime.length - 1]?.createdAt ?? 0
    const newestCreatedAt = historyByTime[0]?.createdAt ?? 0
    const elapsedMs = newestCreatedAt - oldestCreatedAt
    if (elapsedMs <= 0) {
      return null
    }

    return Math.max(1, Math.round(wordsSpoken / (elapsedMs / 60000)))
  })()
  const providerLabel = PROVIDER_LABELS[input.selectedProvider]
  const missingPermissionLabels =
    input.resolvedLanguage === 'zh-CN'
      ? ['辅助功能', '麦克风']
      : input.resolvedLanguage === 'zh-TW'
        ? ['輔助使用', '麥克風']
        : ['Accessibility', 'Microphone']
  const missingPermissions = [
    input.permissions.accessibility.granted ? null : missingPermissionLabels[0],
    input.permissions.microphone.granted ? null : missingPermissionLabels[1]
  ].filter(Boolean) as string[]

  return {
    appInfo: input.appInfo,
    language: {
      preference: input.languagePreference,
      resolved: input.resolvedLanguage
    },
    hotkeyHint:
      input.hotkeyReady && input.registeredHotkey
        ? buildHotkeyHint(input.registeredHotkey)
        : input.resolvedLanguage === 'zh-CN'
          ? '请先开启系统辅助功能权限，才能使用按住说话。'
          : input.resolvedLanguage === 'zh-TW'
            ? '請先開啟系統輔助使用權限，才能使用按住說話。'
            : 'Enable operating-system accessibility permissions to use push-to-talk.',
    registeredHotkey: input.hotkeyReady ? input.registeredHotkey : null,
    registeredHotkeyLabel:
      input.hotkeyReady && input.registeredHotkey
        ? getTriggerKeyLabel(input.registeredHotkey)
        : null,
    selectedProvider: input.selectedProvider,
    microphone: {
      selectedDeviceId: input.selectedMicrophone.deviceId,
      selectedDeviceLabel: input.selectedMicrophone.label
    },
    providerLabels: {
      asr: input.providers.asr,
      llm: input.providers.llm
    },
    dashscope: {
      configured:
        input.selectedProvider === 'dashscope'
          ? input.providerConfigured
          : Boolean(input.dashscopeKeyLabel),
      keyLabel: input.dashscopeKeyLabel,
      asrModel: input.dashscopeModels.asr,
      llmModel: input.dashscopeModels.llm,
      availableLlmModels: [...input.dashscopeAvailableLlmModels]
    },
    openai: {
      configured:
        input.selectedProvider === 'openai'
          ? input.providerConfigured
          : Boolean(input.openAiKeyLabel),
      keyLabel: input.openAiKeyLabel,
      asrModel: input.openAiModels.asr,
      llmModel: input.openAiModels.llm,
      availableLlmModels: [...input.openAiAvailableLlmModels]
    },
    onboarding: {
      completed: input.onboardingCompleted,
      visible: input.onboardingVisible
    },
    themeMode: input.themeMode,
    features: {
      autoTextToSpeech: input.autoTextToSpeechEnabled
    },
    dictionaryEntries: input.dictionaryEntries.map((entry) => ({ ...entry })),
    postProcessPreset: input.postProcessPreset,
    postProcessPresets: input.postProcessPresets.map((preset) => ({ ...preset })),
    voiceBackendStatus:
      input.providerConfigured && input.onboardingCompleted && !input.permissions.hasMissing
        ? {
            ready: true,
            label:
              input.resolvedLanguage === 'zh-CN'
                ? '语音输入已就绪'
                : input.resolvedLanguage === 'zh-TW'
                  ? '語音輸入已就緒'
                  : 'Voice typing ready',
            detail:
              input.resolvedLanguage === 'zh-CN'
                ? `${providerLabel.name} 已配置完成，可以开始语音输入。`
                : input.resolvedLanguage === 'zh-TW'
                  ? `${providerLabel.name} 已設定完成，可以開始語音輸入。`
                  : `${providerLabel.name} is configured and ready for voice typing.`
          }
        : input.providerConfigured && input.onboardingCompleted
          ? {
              ready: false,
              label:
                input.resolvedLanguage === 'zh-CN'
                  ? '需要权限'
                  : input.resolvedLanguage === 'zh-TW'
                    ? '需要權限'
                    : 'Permissions required',
              detail:
                input.resolvedLanguage === 'zh-CN'
                  ? `请在系统设置中启用${missingPermissions.join('和')}，以完成语音输入设置。`
                  : input.resolvedLanguage === 'zh-TW'
                    ? `請在系統設定中開啟${missingPermissions.join('與')}，以完成語音輸入設定。`
                    : `Enable ${missingPermissions.join(' and ')} in System Settings to finish voice typing setup.`
            }
          : input.providerConfigured
            ? {
                ready: false,
                label:
                  input.resolvedLanguage === 'zh-CN'
                    ? '完成设置即可开始语音输入'
                    : input.resolvedLanguage === 'zh-TW'
                      ? '完成設定即可開始語音輸入'
                      : 'Finish setup to enable voice typing',
                detail:
                  input.resolvedLanguage === 'zh-CN'
                    ? '跳过新手引导或完成设置后，即可开始使用全局语音输入。'
                    : input.resolvedLanguage === 'zh-TW'
                      ? '略過新手引導或完成設定後，即可開始使用全域語音輸入。'
                      : 'Skip or finish setup to turn on the global voice typing workflow.'
              }
            : {
                ready: false,
                label:
                  input.resolvedLanguage === 'zh-CN'
                    ? input.selectedProvider === 'openai'
                      ? '需要 OpenAI 密钥'
                      : '需要 DashScope 密钥'
                    : input.resolvedLanguage === 'zh-TW'
                      ? input.selectedProvider === 'openai'
                        ? '需要 OpenAI 金鑰'
                        : '需要 DashScope 金鑰'
                      : providerLabel.missingKeyLabel,
                detail:
                  input.resolvedLanguage === 'zh-CN'
                    ? `请在新手引导或设置中添加你的 ${providerLabel.name} API 密钥，然后开始语音输入。`
                    : input.resolvedLanguage === 'zh-TW'
                      ? `請在新手引導或設定中加入你的 ${providerLabel.name} API 金鑰，然後開始語音輸入。`
                      : `Add your ${providerLabel.name} API key in onboarding or settings to start dictating.`
              },
    historySummary: {
      totalCount: historyByTime.length,
      wordsSpoken,
      averageWpm
    },
    questionHistorySummary: {
      totalCount: questionHistoryByTime.length
    },
    permissions: {
      hasMissing: input.permissions.hasMissing,
      accessibility: buildPermissionState(input.permissions.accessibility, input.resolvedLanguage),
      microphone: buildPermissionState(input.permissions.microphone, input.resolvedLanguage)
    },
    autoUpdate: input.autoUpdate,
    history: historyByTime.slice(0, HISTORY_PAGE_SIZE).map(toHistoryListItem),
    questionHistory: questionHistoryByTime
      .slice(0, HISTORY_PAGE_SIZE)
      .map(toQuestionHistoryListItem)
  }
}

function checkAccessibilityPermission(prompt: boolean): boolean {
  if (process.platform !== 'darwin') {
    return true
  }

  try {
    return systemPreferences.isTrustedAccessibilityClient(prompt)
  } catch (error) {
    logDebug('accessibility', 'Unable to read accessibility permission state', { error, prompt })
    return false
  }
}

export async function bootstrapApplication(): Promise<void> {
  const env = loadAppEnv({ platform: process.platform, env: process.env })

  app.setName('TIA Voice')
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
  await app.whenReady()
  logDebug('app', 'Application ready', {
    logPath: getDebugLogPath(),
    platform: process.platform,
    defaultApp: process.defaultApp,
    argv: process.argv
  })

  electronApp.setAppUserModelId('com.buildmind.tia-voice')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const preloadPath = join(__dirname, '../preload/index.js')
  const [mainAppWindow, recordingBarWindow, questionBarWindow, ttsPlayerWindow] = await Promise.all(
    [
      createMainAppWindow(preloadPath, { showOnReady: false, load: false }),
      createRecordingBarWindow(preloadPath, { load: false }),
      createQuestionBarWindow(preloadPath, { load: false }),
      createTtsPlayerWindow(preloadPath, { load: false })
    ]
  )
  const microphonePermissionState = createMicrophonePermissionState({
    platform: process.platform,
    getStatus: () => systemPreferences.getMediaAccessStatus('microphone'),
    askForAccess: () => systemPreferences.askForMediaAccess('microphone')
  })
  const appIcon = resolveIconAsset()
  if (process.platform === 'darwin' && app.dock && !appIcon.icon.isEmpty()) {
    app.dock.setIcon(appIcon.icon)
  }

  const settingsStore = createSettingsStore(env.pushToTalkKey, app.getPath('userData'))
  let activeTriggerKey = resolveStartupTriggerKey({
    configuredHotkey: settingsStore.get().hotkey,
    fallbackHotkey: env.pushToTalkKey
  })
  const windowManager = createWindowManager({
    mainAppWindow,
    recordingBarWindow,
    questionBarWindow,
    ttsPlayerWindow
  })
  let isQuitting = false
  let hotkeyReady = true
  let registeredTriggerKey: TriggerKey | null = activeTriggerKey
  let onboardingDialogVisible = !settingsStore.isOnboardingComplete()
  let accessibilityDialogVisible = false
  let accessibilityCheckInFlight: Promise<void> | null = null
  let lastAccessibilityPromptAt = 0
  let microphoneDialogVisible = false
  let microphoneCheckInFlight: Promise<void> | null = null
  let lastMicrophonePromptAt = 0

  const getMicrophonePermissionSnapshot = (): PermissionSnapshot => {
    try {
      const snapshot = microphonePermissionState.getSnapshot()
      return {
        kind: 'microphone',
        granted: snapshot.granted,
        status: snapshot.status
      }
    } catch (error) {
      logDebug('microphone', 'Unable to read microphone permission state', { error })
      return {
        kind: 'microphone',
        granted: false,
        status: 'unknown'
      }
    }
  }

  const getAppPermissionSnapshot = (): AppPermissionSnapshot => {
    const accessibility = getAccessibilityPermissionSnapshot()
    const microphone = getMicrophonePermissionSnapshot()

    return {
      hasMissing: !accessibility.granted || !microphone.granted,
      accessibility,
      microphone
    }
  }

  const bringMainWindowToFront = (): void => {
    bringWindowToFront(mainAppWindow)
  }

  const bringPrimaryWindowToFront = (): void => {
    bringMainWindowToFront()
  }

  const getSelectedProvider = (): ProviderKind => settingsStore.getProvider()

  const isProviderConfigured = (provider: ProviderKind): boolean => {
    return provider === 'openai'
      ? settingsStore.hasOpenAiApiKey()
      : settingsStore.hasDashscopeApiKey()
  }

  const hasActiveProviderKey = (): boolean => {
    return isProviderConfigured(getSelectedProvider())
  }

  const shouldEnableGlobalFeatures = (): boolean => {
    return settingsStore.isOnboardingComplete() && hasActiveProviderKey()
  }

  const resolveAccessibilityDialogWindow = (): BrowserWindow | null => {
    if (!mainAppWindow.isDestroyed()) {
      return mainAppWindow
    }

    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow && !focusedWindow.isDestroyed()) {
      return focusedWindow
    }

    const firstFocusableWindow = BrowserWindow.getAllWindows().find(
      (window) => !window.isDestroyed() && window.isFocusable()
    )
    return firstFocusableWindow ?? null
  }

  const openPermissionSettingsPanel = async (permission: PermissionKind): Promise<void> => {
    const url =
      permission === 'accessibility' ? ACCESSIBILITY_SETTINGS_URL : MICROPHONE_SETTINGS_URL
    await shell.openExternal(url)
  }

  const openAccessibilitySettingsPanel = async (): Promise<void> => {
    const trustedAfterPrompt = checkAccessibilityPermission(true)
    logDebug('accessibility', 'Requested accessibility trust prompt', {
      trustedAfterPrompt
    })
    await openPermissionSettingsPanel('accessibility')
  }

  const showAccessibilityPermissionDialog = async (): Promise<void> => {
    const dialogOptions = {
      type: 'warning' as const,
      buttons: ['Open Accessibility Settings', 'Not now'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      title: 'Accessibility Permission Required',
      message: 'TIA Voice needs Accessibility permission',
      detail:
        'Please grant TIA Voice access in System Settings > Privacy & Security > Accessibility so push-to-talk can work.'
    }

    const parentWindow = resolveAccessibilityDialogWindow()
    const result = parentWindow
      ? await dialog.showMessageBox(parentWindow, dialogOptions)
      : await dialog.showMessageBox(dialogOptions)

    if (result.response !== 0) {
      return
    }

    await openAccessibilitySettingsPanel()
  }

  const ensureAccessibilityPermission = (
    trigger: 'startup' | 'focus' | 'activate' | 'interval'
  ): Promise<void> => {
    if (process.platform !== 'darwin') {
      return Promise.resolve()
    }

    if (accessibilityCheckInFlight) {
      return accessibilityCheckInFlight
    }

    accessibilityCheckInFlight = (async () => {
      if (!shouldEnableGlobalFeatures()) {
        logDebug('accessibility', 'Skipped accessibility permission prompt until setup is ready', {
          trigger
        })
        return
      }

      const granted = checkAccessibilityPermission(false)
      logDebug('accessibility', 'Checked accessibility permission state', { trigger, granted })

      if (granted || accessibilityDialogVisible) {
        return
      }

      const now = Date.now()
      if (now - lastAccessibilityPromptAt < ACCESSIBILITY_PERMISSION_PROMPT_COOLDOWN_MS) {
        logDebug('accessibility', 'Skipped accessibility permission prompt due cooldown', {
          trigger,
          cooldownMs: ACCESSIBILITY_PERMISSION_PROMPT_COOLDOWN_MS
        })
        return
      }

      if (onboardingDialogVisible) {
        logDebug(
          'accessibility',
          'Skipped global accessibility prompt while onboarding dialog is visible',
          { trigger }
        )
        return
      }

      accessibilityDialogVisible = true
      lastAccessibilityPromptAt = now
      try {
        await showAccessibilityPermissionDialog()
      } catch (error) {
        logDebug('accessibility', 'Failed to prompt for accessibility permission', {
          trigger,
          error
        })
      } finally {
        accessibilityDialogVisible = false
        syncAppState()
      }
    })().finally(() => {
      accessibilityCheckInFlight = null
    })

    return accessibilityCheckInFlight
  }

  const showMicrophonePermissionDialog = async (): Promise<void> => {
    const dialogOptions = {
      type: 'warning' as const,
      buttons: ['Open Microphone Settings', 'Not now'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      title: 'Microphone Permission Required',
      message: 'TIA Voice needs microphone permission',
      detail:
        'Please grant TIA Voice access in System Settings > Privacy & Security > Microphone so dictation can work.'
    }

    const parentWindow = resolveAccessibilityDialogWindow()
    const result = parentWindow
      ? await dialog.showMessageBox(parentWindow, dialogOptions)
      : await dialog.showMessageBox(dialogOptions)

    if (result.response !== 0) {
      return
    }

    await openPermissionSettingsPanel('microphone')
  }

  const ensureMicrophonePermission = (
    trigger: 'startup' | 'focus' | 'activate' | 'interval'
  ): Promise<void> => {
    if (process.platform !== 'darwin') {
      return Promise.resolve()
    }

    if (microphoneCheckInFlight) {
      return microphoneCheckInFlight
    }

    microphoneCheckInFlight = (async () => {
      if (!shouldEnableGlobalFeatures()) {
        logDebug('microphone', 'Skipped microphone permission prompt until setup is ready', {
          trigger
        })
        return
      }

      const granted = await checkMicrophonePermission(false)
      logDebug('microphone', 'Checked microphone permission state', { trigger, granted })

      if (granted || microphoneDialogVisible) {
        return
      }

      const now = Date.now()
      if (now - lastMicrophonePromptAt < ACCESSIBILITY_PERMISSION_PROMPT_COOLDOWN_MS) {
        logDebug('microphone', 'Skipped microphone permission prompt due cooldown', {
          trigger,
          cooldownMs: ACCESSIBILITY_PERMISSION_PROMPT_COOLDOWN_MS
        })
        return
      }

      if (onboardingDialogVisible) {
        logDebug('microphone', 'Skipped microphone prompt while onboarding dialog is visible', {
          trigger
        })
        return
      }

      microphoneDialogVisible = true
      lastMicrophonePromptAt = now
      try {
        const grantedAfterPrompt = await checkMicrophonePermission(true)
        logDebug('microphone', 'Requested microphone access prompt', {
          trigger,
          grantedAfterPrompt
        })

        if (grantedAfterPrompt) {
          return
        }

        await showMicrophonePermissionDialog()
      } catch (error) {
        logDebug('microphone', 'Failed to prompt for microphone permission', {
          trigger,
          error
        })
      } finally {
        microphoneDialogVisible = false
        syncAppState()
      }
    })().finally(() => {
      microphoneCheckInFlight = null
    })

    return microphoneCheckInFlight
  }

  const handleAppFocusPermissionCheck = (): void => {
    syncAppState()
    void ensureAccessibilityPermission('focus')
    void ensureMicrophonePermission('focus')
  }

  const syncApplicationBarVisibility = (): void => {
    const isMainWindowVisible = !mainAppWindow.isDestroyed() && mainAppWindow.isVisible()

    if (!mainAppWindow.isDestroyed()) {
      mainAppWindow.setSkipTaskbar(!isMainWindowVisible)
    }

    if (process.platform === 'darwin' && app.dock) {
      if (isMainWindowVisible) {
        void app.dock.show()
      } else {
        app.dock.hide()
      }
    }
  }

  const setupTray = (): void => {
    tray?.destroy()
    const trayIcon = resolveTrayIcon()
    if (trayIcon.icon.isEmpty()) {
      logDebug('tray', 'Failed to initialize tray because icon image is empty', {
        sourcePath: trayIcon.sourcePath
      })
      return
    }

    try {
      tray = new Tray(trayIcon.icon)
    } catch (error) {
      logDebug('tray', 'Failed to initialize tray icon', {
        sourcePath: trayIcon.sourcePath,
        error
      })
      console.error('[tray] Failed to create tray icon.', error)
      return
    }

    logDebug('tray', 'Tray icon initialized', {
      sourcePath: trayIcon.sourcePath,
      platform: process.platform,
      isTemplate: process.platform === 'darwin',
      size: trayIcon.icon.getSize()
    })
    tray.setToolTip('TIA Voice')
    tray.on('click', () => {
      bringPrimaryWindowToFront()
    })
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Open TIA Voice',
          accelerator: SHOW_MAIN_WINDOW_SHORTCUT,
          click: () => {
            bringPrimaryWindowToFront()
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            isQuitting = true
            app.quit()
          }
        }
      ])
    )
  }

  const syncAppState = (): void => {
    const settings = settingsStore.get()
    const selectedProvider = settings.provider
    const resolvedLanguage = resolveAppLanguage(
      settings.languagePreference,
      getPreferredSystemLocales()
    )
    windowManager.setAppState(
      buildMainAppState({
        appInfo: {
          name: app.getName(),
          version: app.getVersion()
        },
        registeredHotkey: registeredTriggerKey,
        hotkeyReady,
        selectedProvider,
        selectedMicrophone: settings.microphone,
        languagePreference: settings.languagePreference,
        resolvedLanguage,
        themeMode: settings.themeMode,
        autoTextToSpeechEnabled: settings.features.autoTextToSpeech,
        dictionaryEntries: settings.dictionaryEntries,
        postProcessPreset: settings.postProcessPreset,
        postProcessPresets: settings.postProcessPresets,
        providers: settingsStore.getProviderModels(selectedProvider),
        dashscopeModels: settingsStore.getProviderModels('dashscope'),
        openAiModels: settingsStore.getProviderModels('openai'),
        dashscopeAvailableLlmModels: settingsStore.getAvailableLlmModels('dashscope'),
        openAiAvailableLlmModels: settingsStore.getAvailableLlmModels('openai'),
        providerConfigured: isProviderConfigured(selectedProvider),
        providerKeyLabel:
          selectedProvider === 'openai'
            ? settingsStore.getOpenAiKeyLabel()
            : settingsStore.getDashscopeKeyLabel(),
        dashscopeKeyLabel: settingsStore.getDashscopeKeyLabel(),
        openAiKeyLabel: settingsStore.getOpenAiKeyLabel(),
        onboardingCompleted: settingsStore.isOnboardingComplete(),
        onboardingVisible: onboardingDialogVisible,
        permissions: getAppPermissionSnapshot(),
        autoUpdate: getAutoUpdateState(),
        history: settings.history,
        questionHistory: settings.questionHistory
      })
    )
  }

  const checkMicrophonePermission = async (prompt: boolean): Promise<boolean> => {
    try {
      const granted = await microphonePermissionState.check(prompt)
      if (granted) {
        syncAppState()
      }
      return granted
    } catch (error) {
      logDebug('microphone', 'Unable to read microphone permission state', { error, prompt })
      return false
    }
  }

  const contextProvider = (() => {
    try {
      return createSelectionHookContextProvider({
        platform: process.platform
      })
    } catch (error) {
      console.error('[context] Falling back to noop context provider.', error)
      logDebug('context', 'Falling back to noop context provider', {
        errorMessage: error instanceof Error ? error.message : String(error)
      })
      return createNoopContextProvider()
    }
  })()
  const sessionStore = createEphemeralSessionStore()
  const resolveDashscopeApiKey = async (): Promise<string> => {
    const apiKey = settingsStore.getDashscopeApiKey()
    if (!apiKey) {
      throw new Error('DashScope API key is unavailable.')
    }

    return apiKey
  }
  const resolveOpenAiApiKey = async (): Promise<string> => {
    const apiKey = settingsStore.getOpenAiApiKey()
    if (!apiKey) {
      throw new Error('OpenAI API key is unavailable.')
    }

    return apiKey
  }
  const getCurrentProviderKeyResolver = (): (() => Promise<string>) => {
    return getSelectedProvider() === 'openai' ? resolveOpenAiApiKey : resolveDashscopeApiKey
  }
  const qwenAsrProvider = createQwenAsrProvider({
    apiKey: resolveDashscopeApiKey,
    baseUrl: env.dashscopeBaseUrl
  })
  const openAiAsrProvider = createOpenAiAsrProvider({
    apiKey: resolveOpenAiApiKey
  })
  const qwenCleanupProvider = createQwenCleanupProvider({
    apiKey: resolveDashscopeApiKey,
    baseUrl: env.dashscopeBaseUrl,
    model: () => settingsStore.getProviderModels('dashscope').llm,
    postProcessPreset: () => settingsStore.getSelectedPostProcessPreset()
  })
  const openAiCleanupProvider = createOpenAiCleanupProvider({
    apiKey: resolveOpenAiApiKey,
    model: () => settingsStore.getProviderModels('openai').llm,
    postProcessPreset: () => settingsStore.getSelectedPostProcessPreset()
  })
  const qwenQuestionProvider = createQwenQuestionAnswerProvider({
    apiKey: resolveDashscopeApiKey,
    baseUrl: env.dashscopeBaseUrl,
    model: () => settingsStore.getProviderModels('dashscope').llm
  })
  const openAiQuestionAnswerProvider = createOpenAiQuestionAnswerProvider({
    apiKey: resolveOpenAiApiKey,
    model: () => settingsStore.getProviderModels('openai').llm
  })
  const cosyVoiceTtsProvider = createCosyVoiceTtsProvider({
    apiKey: resolveDashscopeApiKey,
    baseUrl: env.dashscopeApiBaseUrl
  })
  const getCurrentAsrProvider = (): ReturnType<typeof createQwenAsrProvider> => {
    return getSelectedProvider() === 'openai' ? openAiAsrProvider : qwenAsrProvider
  }
  const getCurrentLlmProvider = (): ReturnType<typeof createQwenCleanupProvider> => {
    return getSelectedProvider() === 'openai' ? openAiCleanupProvider : qwenCleanupProvider
  }

  const getCurrentQuestionAnswerProvider = ():
    | ReturnType<typeof createQwenQuestionAnswerProvider>
    | ReturnType<typeof createOpenAiQuestionAnswerProvider> => {
    return getSelectedProvider() === 'openai' ? openAiQuestionAnswerProvider : qwenQuestionProvider
  }

  const captureQuestionContext = async (): Promise<ContextSelection | null> => {
    if (contextProvider.captureSelection) {
      return contextProvider.captureSelection({
        allowAnySource: true
      })
    }

    const snapshot = await contextProvider.captureSnapshot()
    const text = snapshot.selectedText?.trim()
    if (!text) {
      return null
    }

    return {
      text,
      sourceApp: null,
      bounds: null,
      capturedAt: snapshot.capturedAt
    }
  }

  const startTextToSpeech = async (input: { text: string; source: TtsSource }): Promise<void> => {
    const text = input.text.trim()
    if (!text) {
      throw new Error('Text-to-speech requires non-empty text.')
    }

    if (!settingsStore.hasDashscopeApiKey()) {
      throw new Error('Add a DashScope API key before using text-to-speech.')
    }

    const createdAt = Date.now()
    const sessionId = `tts-${createdAt}`
    windowManager.setTtsState({
      ...DEFAULT_TTS_STATE,
      status: 'loading',
      sessionId,
      source: input.source,
      text,
      createdAt
    })

    try {
      const result = await cosyVoiceTtsProvider.synthesize({ text })
      windowManager.setTtsState({
        status: 'ready',
        sessionId,
        source: input.source,
        text,
        audioUrl: result.audioUrl,
        audioExpiresAt: result.audioExpiresAt,
        segments: result.segments,
        voice: result.voice,
        model: result.model,
        createdAt,
        error: null
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Text-to-speech failed.'
      logDebug('tts', 'Text-to-speech request failed', {
        error,
        source: input.source
      })
      windowManager.setTtsState({
        ...DEFAULT_TTS_STATE,
        status: 'error',
        sessionId,
        source: input.source,
        text,
        createdAt,
        error: message
      })
      throw error instanceof Error ? error : new Error(message)
    }
  }

  const stopTextToSpeech = async (): Promise<void> => {
    windowManager.hideTtsPlayer()
  }

  type DictationCapturePhase = 'idle' | 'starting' | 'recording' | 'processing'
  type QuestionCapturePhase = 'idle' | 'starting' | 'recording' | 'processing' | 'answer' | 'error'
  type QuestionCaptureSource = 'uiohook' | 'global-shortcut'
  let dictationCapturePhase: DictationCapturePhase = 'idle'
  let dictationCaptureStopRequested = false
  let questionCapturePhase: QuestionCapturePhase = 'idle'
  let questionCaptureStopRequested = false
  let activeQuestionContext: { selectedText: string | null; sourceApp: string | null } | null = null
  let lastQuestionShortcutAt = 0

  const isQuestionCaptureBusy = (): boolean =>
    questionCapturePhase === 'starting' ||
    questionCapturePhase === 'recording' ||
    questionCapturePhase === 'processing'

  const isDictationCaptureBusy = (): boolean => dictationCapturePhase !== 'idle'

  const startDictation = async (source: 'global' | 'onboarding'): Promise<void> => {
    if (source === 'global' && !shouldEnableGlobalFeatures()) {
      logDebug('hotkey', 'Ignored global dictation trigger before setup completed', {
        onboardingCompleted: settingsStore.isOnboardingComplete(),
        selectedProvider: getSelectedProvider(),
        providerConfigured: hasActiveProviderKey()
      })
      return
    }

    if (source === 'onboarding' && !hasActiveProviderKey()) {
      logDebug('hotkey', 'Ignored onboarding dictation trigger before provider key was saved', {
        selectedProvider: getSelectedProvider()
      })
      return
    }

    if (isQuestionCaptureBusy()) {
      logDebug('hotkey', 'Ignored dictation trigger while question capture is active', {
        source,
        questionCapturePhase
      })
      return
    }

    if (isDictationCaptureBusy()) {
      logDebug('hotkey', 'Ignored dictation trigger while dictation is active', {
        source,
        dictationCapturePhase
      })
      return
    }

    dictationCapturePhase = 'starting'
    dictationCaptureStopRequested = false

    let didBeginCapture = false
    try {
      didBeginCapture = await voicePipeline.beginCapture()
    } catch (error) {
      dictationCapturePhase = 'idle'
      throw error
    }

    if (!didBeginCapture) {
      dictationCapturePhase = 'idle'
      return
    }

    if (dictationCaptureStopRequested) {
      dictationCaptureStopRequested = false
      dictationCapturePhase = 'idle'
      voicePipeline.cancelCapture()
      return
    }

    windowManager.showRecordingBar({
      type: 'start',
      startedAt: Date.now(),
      deviceId: settingsStore.getMicrophone().deviceId
    })
    dictationCapturePhase = 'recording'
  }

  const stopDictation = async (source: 'global' | 'onboarding'): Promise<void> => {
    void source

    if (dictationCapturePhase === 'starting') {
      dictationCaptureStopRequested = true
      return
    }

    if (dictationCapturePhase !== 'recording' || !recordingBarWindow.isVisible()) {
      return
    }

    dictationCapturePhase = 'processing'
    windowManager.stopRecordingBar()
  }

  const cancelQuestionCapture = (source: 'renderer' | 'internal' = 'renderer'): void => {
    questionCapturePhase = 'idle'
    questionCaptureStopRequested = false
    activeQuestionContext = null
    questionAnswerPipeline.cancelCapture()
    windowManager.resetQuestionBar()
    logDebug('question-answer', 'Canceled question capture', { source })
  }

  const startQuestionCapture = async (source: QuestionCaptureSource = 'uiohook'): Promise<void> => {
    if (questionCapturePhase === 'starting' || questionCapturePhase === 'recording') {
      logDebug('question-answer', 'Ignored question trigger while capture is already active', {
        source,
        questionCapturePhase
      })
      return
    }

    if (questionCapturePhase === 'processing') {
      logDebug('question-answer', 'Ignored question trigger while response is processing', {
        source
      })
      return
    }

    if (isDictationCaptureBusy()) {
      logDebug('question-answer', 'Ignored question trigger while dictation is active', {
        source,
        dictationCapturePhase
      })
      return
    }

    if (!shouldEnableGlobalFeatures()) {
      logDebug('question-answer', 'Ignored question trigger before setup completed', {
        source,
        onboardingCompleted: settingsStore.isOnboardingComplete(),
        selectedProvider: getSelectedProvider(),
        providerConfigured: hasActiveProviderKey()
      })
      return
    }

    questionCapturePhase = 'starting'
    questionCaptureStopRequested = false

    let selection: ContextSelection | null = null
    try {
      selection = await captureQuestionContext()
    } catch (error) {
      logDebug('question-answer', 'Failed to capture selected text for question', { error })
    }

    logDebug('question-answer', 'Starting question capture', {
      shortcut: QUESTION_CAPTURE_SHORTCUT,
      source,
      selection: summarizeContextSelection(selection)
    })

    const questionContext = {
      selectedText: selection?.text ?? null,
      sourceApp: selection?.sourceApp ?? null
    }
    const didBeginCapture = await questionAnswerPipeline.beginCapture(questionContext)
    if (!didBeginCapture) {
      questionCapturePhase = 'idle'
      activeQuestionContext = null
      return
    }
    activeQuestionContext = questionContext

    if (questionCaptureStopRequested) {
      cancelQuestionCapture('internal')
      questionCaptureStopRequested = false
      return
    }

    windowManager.showQuestionBar({
      type: 'start',
      startedAt: Date.now(),
      deviceId: settingsStore.getMicrophone().deviceId
    })

    questionCapturePhase = 'recording'

    if (questionCaptureStopRequested) {
      questionCaptureStopRequested = false
      await stopQuestionCapture()
    }
  }

  const stopQuestionCapture = async (): Promise<void> => {
    if (questionCapturePhase === 'starting') {
      questionCaptureStopRequested = true
      return
    }

    if (questionCapturePhase !== 'recording' || !questionBarWindow.isVisible()) {
      return
    }

    questionCapturePhase = 'processing'
    windowManager.showQuestionPending({
      type: 'pending',
      stage: 'transcribing',
      selectedText: activeQuestionContext?.selectedText ?? null,
      sourceApp: activeQuestionContext?.sourceApp ?? null,
      question: null
    })
    windowManager.stopQuestionBar()
  }

  const toggleQuestionCapture = async (source: QuestionCaptureSource): Promise<void> => {
    const now = Date.now()
    if (now - lastQuestionShortcutAt < 250) {
      logDebug('question-answer', 'Ignored duplicate question shortcut event', {
        source,
        questionCapturePhase
      })
      return
    }
    lastQuestionShortcutAt = now

    if (questionCapturePhase === 'starting' || questionCapturePhase === 'recording') {
      await stopQuestionCapture()
      return
    }

    if (questionCapturePhase === 'processing') {
      return
    }

    await startQuestionCapture(source)
  }

  const voicePipeline = createVoicePipeline({
    contextProvider,
    sessionStore,
    asrProvider: {
      transcribe: (artifact) => getCurrentAsrProvider().transcribe(artifact)
    },
    llmProvider: {
      transform: (request) => getCurrentLlmProvider().transform(request)
    },
    actionExecutor: createNutPasteExecutor({
      platform: process.platform,
      clipboard: {
        clear: async () => {
          electronClipboard.clear()
        },
        setContent: async (text) => {
          electronClipboard.writeText(text)
        }
      }
    }),
    getPostProcessPreset: () => settingsStore.getSelectedPostProcessPreset(),
    getDictionaryEntries: () => settingsStore.getDictionaryEntries(),
    historyStore: {
      appendHistory: (entry) => {
        settingsStore.appendHistory(entry)
        syncAppState()
      },
      updateHistoryEntry: (entryId, patch) => {
        settingsStore.updateHistoryEntry(entryId, patch)
        syncAppState()
      },
      getHistoryEntry: (entryId) => settingsStore.getHistoryEntry(entryId),
      saveAudioClip: (entryId, input) => settingsStore.saveAudioClip(entryId, input),
      readAudioClip: (entryId) => settingsStore.readAudioClip(entryId)
    },
    notifyChatWindow: (state) => {
      windowManager.setChatState(state)
    },
    hideRecordingBar: () => {
      windowManager.hideRecordingBar()
    },
    prepareBeforeTranscribe: async () => {
      try {
        await getCurrentProviderKeyResolver()()
      } catch (error) {
        logDebug('voice-pipeline', 'Failed to resolve provider API key before ASR call', {
          selectedProvider: getSelectedProvider(),
          error
        })
        throw error
      }
    }
  })

  const questionAnswerPipeline = createQuestionAnswerPipeline({
    asrProvider: {
      transcribe: (artifact) => getCurrentAsrProvider().transcribe(artifact)
    },
    questionAnswerProvider: {
      answer: (request) => getCurrentQuestionAnswerProvider().answer(request)
    },
    getDictionaryEntries: () => settingsStore.getDictionaryEntries(),
    historyStore: {
      appendQuestionHistory: (entry) => {
        settingsStore.appendQuestionHistory(entry)
        syncAppState()
      },
      updateQuestionHistoryEntry: (entryId, patch) => {
        settingsStore.updateQuestionHistoryEntry(entryId, patch)
        syncAppState()
      }
    },
    hideQuestionBar: () => {
      questionCapturePhase = 'idle'
      activeQuestionContext = null
      windowManager.resetQuestionBar()
    },
    showQuestionPending: (pendingInput) => {
      questionCapturePhase = 'processing'
      windowManager.showQuestionPending({
        type: 'pending',
        ...pendingInput
      })
    },
    showQuestionAnswer: (answerInput) => {
      questionCapturePhase = 'answer'
      activeQuestionContext = null
      windowManager.showQuestionAnswer(answerInput)
    },
    showQuestionError: (detail) => {
      questionCapturePhase = 'error'
      activeQuestionContext = null
      windowManager.showQuestionError(detail)
    },
    prepareBeforeTranscribe: async () => {
      await getCurrentProviderKeyResolver()()
    },
    onReadAloudRequested: async (text) => {
      await startTextToSpeech({ text, source: 'question-answer' })
    },
    onAnswerCompleted: async (answer) => {
      if (!settingsStore.isAutoTextToSpeechEnabled()) {
        return
      }

      try {
        await startTextToSpeech({ text: answer, source: 'question-answer' })
      } catch (error) {
        logDebug('question-answer', 'Auto text-to-speech failed after answer completion', {
          error
        })
      }
    }
  })

  logDebug('hotkey', 'Resolved dictation trigger key', {
    triggerKey: activeTriggerKey,
    label: getTriggerKeyLabel(activeTriggerKey)
  })
  const createHotkeyService = (triggerKey: TriggerKey): ReturnType<typeof createAppHotkeyService> =>
    createAppHotkeyService({
      triggerKey,
      hook: uIOhook,
      onDictationStart: async () => startDictation('global'),
      onDictationStop: async () => stopDictation('global'),
      onQuestionStart: async () => toggleQuestionCapture('uiohook'),
      onQuestionStop: async () => undefined,
      onQuestionKeyEvent: (event) => {
        logDebug('hotkey', 'Observed question hotkey key event', {
          shortcut: QUESTION_CAPTURE_SHORTCUT,
          phase: event.phase,
          keycode: event.keycode,
          ctrlKey: event.ctrlKey,
          rawCtrlKey: event.rawCtrlKey,
          trackedCtrlKey: event.trackedCtrlKey
        })
      }
    })
  let hotkeyService = createHotkeyService(activeTriggerKey)
  let hotkeyServiceStarted = false

  const rebuildGlobalHotkeyService = (): void => {
    if (hotkeyServiceStarted) {
      hotkeyService.stop()
      hotkeyServiceStarted = false
    }

    hotkeyService = createHotkeyService(activeTriggerKey)
    hotkeyReady = true
    registeredTriggerKey = activeTriggerKey
  }

  const syncGlobalHotkeyService = (): void => {
    const shouldStart = hotkeyReady && shouldEnableGlobalFeatures()

    if (!shouldStart) {
      if (hotkeyServiceStarted) {
        logDebug('hotkey', 'Stopping global hotkey service', {
          triggerKey: registeredTriggerKey
        })
        hotkeyService.stop()
        hotkeyServiceStarted = false
      }
      return
    }

    if (hotkeyServiceStarted) {
      return
    }

    try {
      hotkeyService.start()
      hotkeyServiceStarted = true
      logDebug('hotkey', 'Started global hotkey service', {
        triggerKey: activeTriggerKey,
        platform: process.platform
      })
    } catch (error) {
      hotkeyReady = false
      registeredTriggerKey = null
      logDebug('hotkey', 'Failed to start the global hotkey service', {
        triggerKey: activeTriggerKey,
        platform: process.platform,
        error
      })
      console.error('[hotkey] Failed to start the global hotkey service.', error)
      syncAppState()
      bringPrimaryWindowToFront()
    }
  }

  registerMainIpc({
    getAppState: () => windowManager.getAppState(),
    getChatState: () => windowManager.getChatState(),
    getTtsState: () => windowManager.getTtsState(),
    getHistoryPage: (input) => {
      const page = settingsStore.getHistoryPage(input)
      return buildHistoryPage(page)
    },
    getQuestionHistoryPage: (input) => {
      const page = settingsStore.getQuestionHistoryPage(input)
      return buildQuestionHistoryPage(page)
    },
    getHistoryEntryDebug: async (entryId) => {
      const entry = settingsStore.getHistoryEntry(entryId)
      if (!entry) {
        return null
      }

      const audio = await settingsStore.readAudioClip(entryId)

      return {
        id: entry.id,
        createdAt: entry.createdAt,
        status: entry.status,
        llmProcessing: entry.llmProcessing,
        transcript: entry.transcript,
        cleanedText: entry.cleanedText,
        errorDetail: entry.errorDetail,
        audio: audio
          ? {
              bytes: audio.buffer,
              mimeType: audio.mimeType,
              durationMs: audio.durationMs,
              sizeBytes: audio.sizeBytes
            }
          : undefined
      }
    },
    finishRecording: async (artifact) => {
      dictationCapturePhase = 'processing'
      try {
        await voicePipeline.finishRecording(artifact)
      } finally {
        dictationCapturePhase = 'idle'
        dictationCaptureStopRequested = false
      }
    },
    finishQuestionRecording: async (artifact) => {
      questionCapturePhase = 'processing'
      await questionAnswerPipeline.finishRecording(artifact)
    },
    cancelQuestionRecording: () => {
      cancelQuestionCapture('renderer')
    },
    retryHistoryEntry: async (entryId) => {
      await voicePipeline.retryHistoryEntry(entryId)
      syncAppState()
    },
    startDictation,
    stopDictation,
    startTextToSpeech,
    stopTextToSpeech,
    setThemeMode: (themeMode) => {
      settingsStore.setThemeMode(themeMode)
      syncAppState()
    },
    setLanguage: (language) => {
      settingsStore.setLanguagePreference(language)
      syncAppState()
    },
    setAutoTextToSpeechEnabled: (enabled) => {
      settingsStore.setAutoTextToSpeechEnabled(enabled)
      syncAppState()
    },
    saveDictionaryEntry: (input) => {
      const entry = settingsStore.saveDictionaryEntry(input)
      syncAppState()
      return entry
    },
    deleteDictionaryEntry: (entryId) => {
      settingsStore.deleteDictionaryEntry(entryId)
      syncAppState()
    },
    setPostProcessPreset: (presetId) => {
      settingsStore.setPostProcessPreset(presetId)
      syncAppState()
    },
    savePostProcessPreset: (input) => {
      const preset = settingsStore.savePostProcessPreset(input)
      syncAppState()
      return preset
    },
    resetPostProcessPreset: (presetId) => {
      const preset = settingsStore.resetPostProcessPreset(presetId)
      syncAppState()
      return preset
    },
    createPostProcessPreset: (input) => {
      const preset = settingsStore.createPostProcessPreset(input)
      syncAppState()
      return preset
    },
    setHotkey: (hotkey) => {
      settingsStore.setHotkey(hotkey)
      activeTriggerKey = hotkey
      rebuildGlobalHotkeyService()
      syncGlobalHotkeyService()
      syncAppState()
    },
    setMicrophone: (value) => {
      settingsStore.setMicrophone(value)
      syncAppState()
    },
    setProvider: (provider) => {
      settingsStore.setProvider(provider)
      syncGlobalHotkeyService()
      syncAppState()
      void ensureAccessibilityPermission('focus')
      void ensureMicrophonePermission('focus')
    },
    setProviderLlmModel: (provider, model) => {
      settingsStore.setProviderLlmModel(provider, model)
      syncAppState()
    },
    getProviderSetup: () => ({
      configured: hasActiveProviderKey(),
      keyLabel:
        getSelectedProvider() === 'openai'
          ? settingsStore.getOpenAiKeyLabel()
          : settingsStore.getDashscopeKeyLabel()
    }),
    saveDashscopeApiKey: (apiKey) => {
      settingsStore.setDashscopeApiKey(apiKey)
      syncAppState()
      syncGlobalHotkeyService()
      void ensureAccessibilityPermission('focus')
      void ensureMicrophonePermission('focus')
      return {
        configured: settingsStore.hasDashscopeApiKey(),
        keyLabel: settingsStore.getDashscopeKeyLabel()
      }
    },
    saveOpenAiApiKey: (apiKey) => {
      settingsStore.setOpenAiApiKey(apiKey)
      syncAppState()
      syncGlobalHotkeyService()
      void ensureAccessibilityPermission('focus')
      void ensureMicrophonePermission('focus')
      return {
        configured: settingsStore.hasOpenAiApiKey(),
        keyLabel: settingsStore.getOpenAiKeyLabel()
      }
    },
    completeOnboarding: () => {
      settingsStore.markOnboardingComplete()
      onboardingDialogVisible = false
      syncAppState()
      syncGlobalHotkeyService()
      logDebug('onboarding', 'Dismissed onboarding dialog')
      bringMainWindowToFront()
      void ensureAccessibilityPermission('focus')
      void ensureMicrophonePermission('focus')
    },
    checkAccessibilityPermission: (prompt) => checkAccessibilityPermission(prompt),
    checkMicrophonePermission: (prompt) => checkMicrophonePermission(prompt),
    reportMicrophonePermissionGranted: () => {
      microphonePermissionState.confirmGranted()
      logDebug('microphone', 'Accepted renderer-confirmed microphone access grant')
      syncAppState()
    },
    openPermissionSettings: async (permission) => {
      if (permission === 'microphone') {
        const grantedAfterPrompt = await checkMicrophonePermission(true)
        logDebug('microphone', 'Handled explicit microphone permission request', {
          grantedAfterPrompt
        })

        syncAppState()
        if (grantedAfterPrompt) {
          return
        }
      }

      await openPermissionSettingsPanel(permission)
      syncAppState()
    },
    checkForUpdates: async () => {
      const nextState = await checkForAutoUpdates()
      syncAppState()
      return nextState
    },
    restartToUpdate: async () => {
      await restartToInstallUpdate()
    },
    resetOnboarding: () => {
      if (!is.dev) {
        logDebug('onboarding', 'Ignored reset onboarding request outside development mode')
        return
      }

      settingsStore.clearOnboardingCompletion()
      onboardingDialogVisible = true
      syncAppState()
      syncGlobalHotkeyService()
    },
    showOnboardingWindow: () => {
      onboardingDialogVisible = true
      syncAppState()
      bringMainWindowToFront()
    },
    reportRecordingFailure: (detail) => {
      dictationCapturePhase = 'idle'
      dictationCaptureStopRequested = false
      voicePipeline.cancelCapture()
      windowManager.hideRecordingBar()
      windowManager.setChatState({
        phase: 'error',
        detail
      })
      console.error('[voice] Recording capture failed before pipeline processing.', detail)
      logDebug('voice-pipeline', 'Recording capture failed before pipeline processing', { detail })
    },
    reportQuestionRecordingFailure: (detail) => {
      questionCapturePhase = 'idle'
      questionCaptureStopRequested = false
      activeQuestionContext = null
      questionAnswerPipeline.cancelCapture()
      windowManager.resetQuestionBar()
      console.error(
        '[question-answer] Recording capture failed before pipeline processing.',
        detail
      )
      logDebug('question-answer', 'Recording capture failed before pipeline processing', { detail })
    }
  })

  syncAppState()
  await Promise.all([
    loadRendererWindow(mainAppWindow, 'main-app'),
    loadRendererWindow(recordingBarWindow, 'recording-bar'),
    loadRendererWindow(questionBarWindow, 'question-bar'),
    loadRendererWindow(ttsPlayerWindow, 'tts-player')
  ])

  mainAppWindow.on('show', syncApplicationBarVisibility)
  mainAppWindow.on('hide', syncApplicationBarVisibility)
  syncApplicationBarVisibility()

  setupTray()
  app.on('browser-window-focus', handleAppFocusPermissionCheck)
  mainAppWindow.on('focus', handleAppFocusPermissionCheck)
  const accessibilityPermissionInterval = setInterval(() => {
    if (!BrowserWindow.getFocusedWindow()) {
      return
    }

    syncAppState()
    void ensureAccessibilityPermission('interval')
    void ensureMicrophonePermission('interval')
  }, ACCESSIBILITY_PERMISSION_RECHECK_INTERVAL_MS)
  void ensureAccessibilityPermission('startup')
  void ensureMicrophonePermission('startup')

  const showMainWindowHotkeyReady = globalShortcut.register(SHOW_MAIN_WINDOW_SHORTCUT, () => {
    bringPrimaryWindowToFront()
  })

  if (!showMainWindowHotkeyReady) {
    console.error(`[shortcut] Failed to register "${SHOW_MAIN_WINDOW_SHORTCUT}" to open the app.`)
  }

  const questionCaptureShortcutReady = globalShortcut.register(QUESTION_CAPTURE_SHORTCUT, () => {
    logDebug('hotkey', 'Question capture global shortcut fired', {
      shortcut: QUESTION_CAPTURE_SHORTCUT
    })
    void toggleQuestionCapture('global-shortcut')
  })

  if (!questionCaptureShortcutReady) {
    console.error(`[shortcut] Failed to register "${QUESTION_CAPTURE_SHORTCUT}" for Q&A capture.`)
    logDebug('hotkey', 'Failed to register question capture global shortcut', {
      shortcut: QUESTION_CAPTURE_SHORTCUT
    })
  }

  initializeAutoUpdater({
    onStateChange: () => {
      syncAppState()
    }
  })
  syncAppState()
  bringMainWindowToFront()
  syncGlobalHotkeyService()

  mainAppWindow.on('close', (event) => {
    if (isQuitting) {
      return
    }

    event.preventDefault()
    mainAppWindow.hide()
  })

  app.on('activate', () => {
    bringPrimaryWindowToFront()
    syncAppState()
    void ensureAccessibilityPermission('activate')
    void ensureMicrophonePermission('activate')
  })

  app.on('second-instance', () => {
    bringPrimaryWindowToFront()
    syncAppState()
    void ensureAccessibilityPermission('activate')
    void ensureMicrophonePermission('activate')
  })

  app.on('before-quit', () => {
    isQuitting = true
    clearInterval(accessibilityPermissionInterval)
    app.off('browser-window-focus', handleAppFocusPermissionCheck)
    mainAppWindow.off('focus', handleAppFocusPermissionCheck)
    if (hotkeyServiceStarted) {
      hotkeyService.stop()
    }
    globalShortcut.unregister(QUESTION_CAPTURE_SHORTCUT)
    globalShortcut.unregister(SHOW_MAIN_WINDOW_SHORTCUT)
    windowManager.closeAllWindows()
    tray?.destroy()
    tray = null
    contextProvider.cleanup?.()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('web-contents-created', (_, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })
  })
}
