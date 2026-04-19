import { ipcMain } from 'electron'

import { IPC_CHANNELS, THEME_MODES, type ThemeMode } from './channels'
import type { RecordingArtifact } from '../recording/types'
import { getDebugLogPath, logDebug } from '../logging/debugLogger'

export function registerMainIpc(input: {
  getAppState: () => unknown
  getChatState: () => unknown
  getHistoryEntryDebug: (entryId: string) => Promise<unknown>
  finishRecording: (artifact: RecordingArtifact) => Promise<void>
  reportRecordingFailure: (detail: string) => void
  retryHistoryEntry: (entryId: string) => Promise<void>
  startDictation: (source: 'global' | 'onboarding') => Promise<void>
  stopDictation: (source: 'global' | 'onboarding') => Promise<void>
  setThemeMode: (themeMode: ThemeMode) => void
  getProviderSetup: () => { configured: boolean; keyLabel: string | null }
  saveDashscopeApiKey: (apiKey: string) => { configured: boolean; keyLabel: string | null }
  completeOnboarding: () => void
  checkAccessibilityPermission: (prompt: boolean) => boolean
  resetOnboarding: () => void
  showOnboardingWindow: () => void
}): void {
  ipcMain.removeHandler(IPC_CHANNELS.app.getState)
  ipcMain.removeHandler(IPC_CHANNELS.chat.getState)
  ipcMain.removeHandler(IPC_CHANNELS.app.getHistoryEntryDebug)
  ipcMain.removeHandler(IPC_CHANNELS.recording.complete)
  ipcMain.removeHandler(IPC_CHANNELS.recording.failed)
  ipcMain.removeHandler(IPC_CHANNELS.app.retryHistory)
  ipcMain.removeHandler(IPC_CHANNELS.app.startDictation)
  ipcMain.removeHandler(IPC_CHANNELS.app.stopDictation)
  ipcMain.removeHandler(IPC_CHANNELS.app.setThemeMode)
  ipcMain.removeHandler(IPC_CHANNELS.app.getProviderSetup)
  ipcMain.removeHandler(IPC_CHANNELS.app.saveDashscopeApiKey)
  ipcMain.removeHandler(IPC_CHANNELS.app.completeOnboarding)
  ipcMain.removeHandler(IPC_CHANNELS.app.checkAccessibilityPermission)
  ipcMain.removeHandler(IPC_CHANNELS.app.resetOnboarding)
  ipcMain.removeHandler(IPC_CHANNELS.app.showOnboardingWindow)
  ipcMain.removeHandler(IPC_CHANNELS.debug.getLogPath)
  ipcMain.handle(IPC_CHANNELS.debug.getLogPath, () => getDebugLogPath())

  ipcMain.removeAllListeners(IPC_CHANNELS.debug.log)
  ipcMain.on(
    IPC_CHANNELS.debug.log,
    (_event, payload: { message?: unknown; details?: unknown } | undefined) => {
      const message =
        typeof payload?.message === 'string' && payload.message.trim() !== ''
          ? payload.message
          : 'Renderer debug event'
      logDebug('renderer', message, payload?.details)
    }
  )

  ipcMain.handle(IPC_CHANNELS.app.getState, () => input.getAppState())
  ipcMain.handle(IPC_CHANNELS.chat.getState, () => input.getChatState())
  ipcMain.handle(IPC_CHANNELS.app.getHistoryEntryDebug, async (_event, entryId: unknown) => {
    if (typeof entryId !== 'string' || entryId.trim() === '') {
      return null
    }

    return input.getHistoryEntryDebug(entryId)
  })
  ipcMain.handle(IPC_CHANNELS.recording.complete, async (_event, artifact: RecordingArtifact) => {
    await input.finishRecording({
      ...artifact,
      buffer:
        artifact.buffer instanceof Uint8Array ? artifact.buffer : new Uint8Array(artifact.buffer)
    })
  })
  ipcMain.handle(IPC_CHANNELS.recording.failed, async (_event, detail: string) => {
    input.reportRecordingFailure(detail)
  })
  ipcMain.handle(IPC_CHANNELS.app.retryHistory, async (_event, entryId: string) => {
    await input.retryHistoryEntry(entryId)
  })
  ipcMain.handle(IPC_CHANNELS.app.startDictation, async (_event, source: unknown) => {
    await input.startDictation(source === 'onboarding' ? 'onboarding' : 'global')
  })
  ipcMain.handle(IPC_CHANNELS.app.stopDictation, async (_event, source: unknown) => {
    await input.stopDictation(source === 'onboarding' ? 'onboarding' : 'global')
  })
  ipcMain.handle(IPC_CHANNELS.app.setThemeMode, (_event, themeMode: unknown) => {
    if (typeof themeMode !== 'string' || !THEME_MODES.includes(themeMode as ThemeMode)) {
      return
    }

    input.setThemeMode(themeMode as ThemeMode)
  })
  ipcMain.handle(IPC_CHANNELS.app.getProviderSetup, () => {
    return input.getProviderSetup()
  })
  ipcMain.handle(IPC_CHANNELS.app.saveDashscopeApiKey, (_event, apiKey: unknown) => {
    if (typeof apiKey !== 'string') {
      throw new Error('DashScope API key is required.')
    }

    return input.saveDashscopeApiKey(apiKey)
  })
  ipcMain.handle(IPC_CHANNELS.app.completeOnboarding, () => {
    input.completeOnboarding()
  })
  ipcMain.handle(IPC_CHANNELS.app.checkAccessibilityPermission, (_event, prompt: unknown) => {
    return input.checkAccessibilityPermission(Boolean(prompt))
  })
  ipcMain.handle(IPC_CHANNELS.app.resetOnboarding, () => {
    input.resetOnboarding()
  })
  ipcMain.handle(IPC_CHANNELS.app.showOnboardingWindow, () => {
    input.showOnboardingWindow()
  })
}
