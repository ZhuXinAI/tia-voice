import { existsSync } from 'fs'
import {
  app,
  BrowserWindow,
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
import { createSettingsStore } from '../config/settingsStore'
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
import type { MainAppStatePayload, ThemeMode } from '../ipc/channels'
import { getDebugLogPath, logDebug } from '../logging/debugLogger'
import { createEphemeralSessionStore } from '../orchestration/ephemeralSessionStore'
import { createVoicePipeline } from '../orchestration/voicePipeline'
import { createQwenAsrProvider } from '../providers/asr/QwenAsrProvider'
import { createQwenCleanupProvider } from '../providers/llm/QwenCleanupProvider'
import { createMainAppWindow } from '../windows/createMainAppWindow'
import { createRecordingBarWindow } from '../windows/createRecordingBarWindow'
import { createWindowManager } from '../windows/windowManager'
import { initializeAutoUpdater } from '../updater/autoUpdater'

const SHOW_MAIN_WINDOW_SHORTCUT = 'CommandOrControl+Shift+Space'
const ACCESSIBILITY_PERMISSION_RECHECK_INTERVAL_MS = 30_000
const ACCESSIBILITY_PERMISSION_PROMPT_COOLDOWN_MS = 5 * 60_000
const ACCESSIBILITY_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
let tray: Tray | null = null

type ResolvedIconAsset = {
  icon: NativeImage
  sourcePath: string
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

function buildMainAppState(input: {
  registeredHotkey: TriggerKey | null
  hotkeyReady: boolean
  themeMode: ThemeMode
  providers: { asr: string; llm: string }
  dashscopeConfigured: boolean
  dashscopeKeyLabel: string | null
  onboardingCompleted: boolean
  onboardingVisible: boolean
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
  return {
    hotkeyHint:
      input.hotkeyReady && input.registeredHotkey
        ? buildHotkeyHint(input.registeredHotkey)
        : 'Enable operating-system accessibility permissions to use push-to-talk.',
    registeredHotkey: input.hotkeyReady ? input.registeredHotkey : null,
    registeredHotkeyLabel:
      input.hotkeyReady && input.registeredHotkey
        ? getTriggerKeyLabel(input.registeredHotkey)
        : null,
    providerLabels: {
      asr: input.providers.asr,
      llm: input.providers.llm
    },
    dashscope: {
      configured: input.dashscopeConfigured,
      keyLabel: input.dashscopeKeyLabel
    },
    onboarding: {
      completed: input.onboardingCompleted,
      visible: input.onboardingVisible
    },
    themeMode: input.themeMode,
    voiceBackendStatus:
      input.dashscopeConfigured && input.onboardingCompleted
        ? {
            ready: true,
            label: 'Voice typing ready',
            detail: 'Your DashScope key is configured and ready for voice typing.'
          }
        : input.dashscopeConfigured
          ? {
              ready: false,
              label: 'Finish setup to enable voice typing',
              detail: 'Skip or finish setup to turn on the global voice typing workflow.'
            }
          : {
              ready: false,
              label: 'DashScope key required',
              detail: 'Add your DashScope API key in onboarding or settings to start dictating.'
            },
    history: input.history.map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      title: item.transcript.slice(0, 36) || 'Voice transcription',
      preview: item.cleanedText || item.transcript || '',
      status: item.status,
      errorDetail: item.errorDetail,
      hasAudio: Boolean(item.audio?.fileName)
    }))
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
  const appIcon = resolveIconAsset()
  if (process.platform === 'darwin' && app.dock && !appIcon.icon.isEmpty()) {
    app.dock.setIcon(appIcon.icon)
  }

  const settingsStore = createSettingsStore(env.pushToTalkKey, app.getPath('userData'))
  const startupTriggerKey = resolveStartupTriggerKey({
    configuredHotkey: settingsStore.get().hotkey,
    fallbackHotkey: env.pushToTalkKey
  })
  const windowManager = createWindowManager({
    mainAppWindow,
    recordingBarWindow
  })
  let isQuitting = false
  let hotkeyReady = true
  let registeredTriggerKey: TriggerKey | null = startupTriggerKey
  let onboardingDialogVisible = !settingsStore.isOnboardingComplete()
  let accessibilityDialogVisible = false
  let accessibilityCheckInFlight: Promise<void> | null = null
  let lastAccessibilityPromptAt = 0

  const bringMainWindowToFront = (): void => {
    bringWindowToFront(mainAppWindow)
  }

  const bringPrimaryWindowToFront = (): void => {
    bringMainWindowToFront()
  }

  const shouldEnableGlobalFeatures = (): boolean => {
    return settingsStore.isOnboardingComplete() && settingsStore.hasDashscopeApiKey()
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

  const openAccessibilitySettingsPanel = async (): Promise<void> => {
    const trustedAfterPrompt = checkAccessibilityPermission(true)
    logDebug('accessibility', 'Requested accessibility trust prompt', {
      trustedAfterPrompt
    })
    await shell.openExternal(ACCESSIBILITY_SETTINGS_URL)
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
      }
    })().finally(() => {
      accessibilityCheckInFlight = null
    })

    return accessibilityCheckInFlight
  }

  const handleAppFocusPermissionCheck = (): void => {
    void ensureAccessibilityPermission('focus')
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
    windowManager.setAppState(
      buildMainAppState({
        registeredHotkey: registeredTriggerKey,
        hotkeyReady,
        themeMode: settings.themeMode,
        providers: settings.providers,
        dashscopeConfigured: Boolean(settings.dashscopeApiKey),
        dashscopeKeyLabel: settingsStore.getDashscopeKeyLabel(),
        onboardingCompleted: settingsStore.isOnboardingComplete(),
        onboardingVisible: onboardingDialogVisible,
        history: settings.history
      })
    )
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

  const startDictation = async (source: 'global' | 'onboarding'): Promise<void> => {
    if (source === 'global' && !shouldEnableGlobalFeatures()) {
      logDebug('hotkey', 'Ignored global dictation trigger before setup completed', {
        onboardingCompleted: settingsStore.isOnboardingComplete(),
        dashscopeConfigured: settingsStore.hasDashscopeApiKey()
      })
      return
    }

    if (source === 'onboarding' && !settingsStore.hasDashscopeApiKey()) {
      logDebug('hotkey', 'Ignored onboarding dictation trigger before DashScope key was saved')
      return
    }

    await voicePipeline.beginCapture()
    windowManager.showRecordingBar({
      type: 'start',
      startedAt: Date.now()
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
    asrProvider: createQwenAsrProvider({
      apiKey: resolveDashscopeApiKey,
      baseUrl: env.dashscopeBaseUrl
    }),
    llmProvider: createQwenCleanupProvider({
      apiKey: resolveDashscopeApiKey,
      baseUrl: env.dashscopeBaseUrl
    }),
    actionExecutor: createNutPasteExecutor({
      platform: process.platform
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
        await resolveDashscopeApiKey()
      } catch (error) {
        logDebug('voice-pipeline', 'Failed to resolve DashScope API key before ASR call', error)
        throw error
      }
    }
  })

  logDebug('hotkey', 'Resolved dictation trigger key', {
    triggerKey: startupTriggerKey,
    label: getTriggerKeyLabel(startupTriggerKey)
  })
  const hotkeyService = createGlobalHotkeyService({
    triggerKey: startupTriggerKey,
    hook: uIOhook,
    onStart: async () => startDictation('global'),
    onStop: async () => stopDictation('global')
  })
  let hotkeyServiceStarted = false

  const syncGlobalHotkeyService = (): void => {
    const shouldStart = hotkeyReady && shouldEnableGlobalFeatures()

    if (!shouldStart) {
      if (hotkeyServiceStarted) {
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
    } catch (error) {
      hotkeyReady = false
      registeredTriggerKey = null
      console.error('[hotkey] Failed to start the global hotkey service.', error)
      syncAppState()
      bringPrimaryWindowToFront()
    }
  }

  registerMainIpc({
    getAppState: () => windowManager.getAppState(),
    getChatState: () => windowManager.getChatState(),
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
    getProviderSetup: () => ({
      configured: settingsStore.hasDashscopeApiKey(),
      keyLabel: settingsStore.getDashscopeKeyLabel()
    }),
    saveDashscopeApiKey: (apiKey) => {
      settingsStore.setDashscopeApiKey(apiKey)
      syncAppState()
      syncGlobalHotkeyService()
      void ensureAccessibilityPermission('focus')
      return {
        configured: settingsStore.hasDashscopeApiKey(),
        keyLabel: settingsStore.getDashscopeKeyLabel()
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
    },
    checkAccessibilityPermission: (prompt) => checkAccessibilityPermission(prompt),
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
      sessionStore.clear()
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

    void ensureAccessibilityPermission('interval')
  }, ACCESSIBILITY_PERMISSION_RECHECK_INTERVAL_MS)
  void ensureAccessibilityPermission('startup')

  const showMainWindowHotkeyReady = globalShortcut.register(SHOW_MAIN_WINDOW_SHORTCUT, () => {
    bringPrimaryWindowToFront()
  })

  if (!showMainWindowHotkeyReady) {
    console.error(`[shortcut] Failed to register "${SHOW_MAIN_WINDOW_SHORTCUT}" to open the app.`)
  }

  syncAppState()
  bringMainWindowToFront()
  initializeAutoUpdater()
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
    void ensureAccessibilityPermission('activate')
  })

  app.on('second-instance', () => {
    bringPrimaryWindowToFront()
    void ensureAccessibilityPermission('activate')
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
