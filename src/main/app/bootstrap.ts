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
import { createGlobalHotkeyService } from '../hotkeys/globalHotkeyService'
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
  ThemeMode
} from '../ipc/channels'
import { getDebugLogPath, logDebug } from '../logging/debugLogger'
import { createEphemeralSessionStore } from '../orchestration/ephemeralSessionStore'
import { createVoicePipeline } from '../orchestration/voicePipeline'
import { createOpenAiAsrProvider } from '../providers/asr/OpenAiAsrProvider'
import { createQwenAsrProvider } from '../providers/asr/QwenAsrProvider'
import { createOpenAiCleanupProvider } from '../providers/llm/OpenAiCleanupProvider'
import { createQwenCleanupProvider } from '../providers/llm/QwenCleanupProvider'
import type { PostProcessPresetRecord } from '../providers/llm/postProcessPrompts'
import { createMainAppWindow } from '../windows/createMainAppWindow'
import { createRecordingBarWindow } from '../windows/createRecordingBarWindow'
import { createWindowManager } from '../windows/windowManager'
import {
  checkForUpdates as checkForAutoUpdates,
  getAutoUpdateState,
  initializeAutoUpdater,
  restartToUpdate as restartToInstallUpdate
} from '../updater/autoUpdater'
import { createMicrophonePermissionState } from './microphonePermissionState'
import { resolveAppLanguage } from '../../shared/i18n/config'

const SHOW_MAIN_WINDOW_SHORTCUT = 'CommandOrControl+Shift+Space'
const ACCESSIBILITY_PERMISSION_RECHECK_INTERVAL_MS = 30_000
const ACCESSIBILITY_PERMISSION_PROMPT_COOLDOWN_MS = 5 * 60_000
const HISTORY_PAGE_SIZE = 10
const ACCESSIBILITY_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
const MICROPHONE_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
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
            label: '已启用辅助功能权限',
            description: 'TIA Voice 现在可以监听全局按住说话快捷键。',
            ctaLabel: '打开辅助功能设置'
          }
        : {
            label: '需要辅助功能权限',
            description:
              '请在系统设置中启用辅助功能权限，这样 TIA Voice 才能监听全局按住说话快捷键。',
            ctaLabel: '打开辅助功能设置'
          }
    }

    return snapshot.granted
      ? {
          label: '已启用麦克风权限',
          description: 'TIA Voice 现在可以访问麦克风进行语音输入。',
          ctaLabel: '打开麦克风设置'
        }
      : {
          label: snapshot.status === 'not-determined' ? '麦克风权限待确认' : '需要麦克风权限',
          description: '请在系统设置中启用麦克风权限，这样 TIA Voice 才能采集语音。',
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
              '請在系統設定中開啟輔助使用權限，這樣 TIA Voice 才能監聽全域按住說話快捷鍵。',
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
          description: '請在系統設定中開啟麥克風權限，這樣 TIA Voice 才能擷取語音。',
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
  postProcessPreset: import('../ipc/channels').PostProcessPresetId
  postProcessPresets: PostProcessPresetRecord[]
  providers: { asr: string; llm: string }
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
}): MainAppStatePayload {
  const historyByTime = [...input.history].sort((a, b) => b.createdAt - a.createdAt)
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
          ? '请先启用系统辅助功能权限，才能使用按住说话。'
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
      keyLabel: input.dashscopeKeyLabel
    },
    openai: {
      configured:
        input.selectedProvider === 'openai'
          ? input.providerConfigured
          : Boolean(input.openAiKeyLabel),
      keyLabel: input.openAiKeyLabel
    },
    onboarding: {
      completed: input.onboardingCompleted,
      visible: input.onboardingVisible
    },
    themeMode: input.themeMode,
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
                    ? '完成设置以启用语音输入'
                    : input.resolvedLanguage === 'zh-TW'
                      ? '完成設定以啟用語音輸入'
                      : 'Finish setup to enable voice typing',
                detail:
                  input.resolvedLanguage === 'zh-CN'
                    ? '跳过或完成引导后，即可启用全局语音输入工作流。'
                    : input.resolvedLanguage === 'zh-TW'
                      ? '略過或完成引導後，即可啟用全域語音輸入流程。'
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
                    ? `请在引导或设置中添加你的 ${providerLabel.name} API 密钥，然后开始语音输入。`
                    : input.resolvedLanguage === 'zh-TW'
                      ? `請在引導或設定中加入你的 ${providerLabel.name} API 金鑰，然後開始語音輸入。`
                      : `Add your ${providerLabel.name} API key in onboarding or settings to start dictating.`
              },
    historySummary: {
      totalCount: historyByTime.length,
      wordsSpoken,
      averageWpm
    },
    permissions: {
      hasMissing: input.permissions.hasMissing,
      accessibility: buildPermissionState(input.permissions.accessibility, input.resolvedLanguage),
      microphone: buildPermissionState(input.permissions.microphone, input.resolvedLanguage)
    },
    autoUpdate: input.autoUpdate,
    history: historyByTime.slice(0, HISTORY_PAGE_SIZE).map(toHistoryListItem)
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
  const [mainAppWindow, recordingBarWindow] = await Promise.all([
    createMainAppWindow(preloadPath, { showOnReady: false }),
    createRecordingBarWindow(preloadPath)
  ])
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
    recordingBarWindow
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
        postProcessPreset: settings.postProcessPreset,
        postProcessPresets: settings.postProcessPresets,
        providers: settings.providers,
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
        history: settings.history
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
    postProcessPreset: () => settingsStore.getSelectedPostProcessPreset()
  })
  const openAiCleanupProvider = createOpenAiCleanupProvider({
    apiKey: resolveOpenAiApiKey,
    postProcessPreset: () => settingsStore.getSelectedPostProcessPreset()
  })
  const getCurrentAsrProvider = (): ReturnType<typeof createQwenAsrProvider> => {
    return getSelectedProvider() === 'openai' ? openAiAsrProvider : qwenAsrProvider
  }
  const getCurrentLlmProvider = (): ReturnType<typeof createQwenCleanupProvider> => {
    return getSelectedProvider() === 'openai' ? openAiCleanupProvider : qwenCleanupProvider
  }

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

    const didBeginCapture = await voicePipeline.beginCapture()
    if (!didBeginCapture) {
      return
    }

    windowManager.showRecordingBar({
      type: 'start',
      startedAt: Date.now(),
      deviceId: settingsStore.getMicrophone().deviceId
    })
  }

  const stopDictation = async (source: 'global' | 'onboarding'): Promise<void> => {
    void source

    if (!recordingBarWindow.isVisible()) {
      return
    }

    windowManager.stopRecordingBar()
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
        setContent: async (text) => {
          electronClipboard.writeText(text)
        },
        getContent: async () => electronClipboard.readText()
      }
    }),
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

  logDebug('hotkey', 'Resolved dictation trigger key', {
    triggerKey: activeTriggerKey,
    label: getTriggerKeyLabel(activeTriggerKey)
  })
  const createHotkeyService = (
    triggerKey: TriggerKey
  ): ReturnType<typeof createGlobalHotkeyService> =>
    createGlobalHotkeyService({
      triggerKey,
      hook: uIOhook,
      onStart: async () => startDictation('global'),
      onStop: async () => stopDictation('global')
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
    getHistoryPage: (input) => {
      const page = settingsStore.getHistoryPage(input)
      return buildHistoryPage(page)
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
    finishRecording: (artifact) => voicePipeline.finishRecording(artifact),
    retryHistoryEntry: async (entryId) => {
      await voicePipeline.retryHistoryEntry(entryId)
      syncAppState()
    },
    startDictation,
    stopDictation,
    setThemeMode: (themeMode) => {
      settingsStore.setThemeMode(themeMode)
      syncAppState()
    },
    setLanguage: (language) => {
      settingsStore.setLanguagePreference(language)
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
      voicePipeline.cancelCapture()
      windowManager.hideRecordingBar()
      windowManager.setChatState({
        phase: 'error',
        detail
      })
      console.error('[voice] Recording capture failed before pipeline processing.', detail)
      logDebug('voice-pipeline', 'Recording capture failed before pipeline processing', { detail })
    }
  })

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
    globalShortcut.unregister(SHOW_MAIN_WINDOW_SHORTCUT)
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
