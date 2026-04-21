import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

import type { AutoUpdateStatePayload } from '../ipc/channels'
import { logDebug } from '../logging/debugLogger'

const INITIAL_CHECK_DELAY_MS = 15_000
const PERIODIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

let hasInitialized = false
let notifyStateChange: ((state: AutoUpdateStatePayload) => void) | null = null

let autoUpdateState: AutoUpdateStatePayload = {
  status: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: null,
  releaseDate: null,
  lastCheckedAt: null,
  downloadProgressPercent: null,
  message: null
}

function setAutoUpdateState(nextState: AutoUpdateStatePayload): AutoUpdateStatePayload {
  autoUpdateState = nextState
  notifyStateChange?.(autoUpdateState)
  return autoUpdateState
}

function updateAutoUpdateState(
  patch:
    | Partial<AutoUpdateStatePayload>
    | ((current: AutoUpdateStatePayload) => AutoUpdateStatePayload)
): AutoUpdateStatePayload {
  const nextState =
    typeof patch === 'function' ? patch(autoUpdateState) : { ...autoUpdateState, ...patch }
  return setAutoUpdateState({
    ...nextState,
    currentVersion: app.getVersion()
  })
}

function formatVersion(version: string | null): string | null {
  if (!version) {
    return null
  }

  return version.startsWith('v') ? version : `v${version}`
}

function buildUnsupportedState(): AutoUpdateStatePayload {
  return {
    status: 'unsupported',
    currentVersion: app.getVersion(),
    availableVersion: null,
    releaseDate: null,
    lastCheckedAt: null,
    downloadProgressPercent: null,
    message: 'Automatic updates are only available in packaged builds.'
  }
}

function buildUpdateAvailableMessage(
  version: string | null,
  progressPercent: number | null
): string {
  const versionLabel = formatVersion(version) ?? 'A new version'
  if (progressPercent === null) {
    return `${versionLabel} is available and downloading in the background.`
  }

  const roundedProgress = Math.max(0, Math.min(100, Math.round(progressPercent)))
  return `${versionLabel} is downloading in the background (${roundedProgress}%).`
}

function buildDownloadedMessage(version: string | null): string {
  const versionLabel = formatVersion(version) ?? 'The latest update'
  return `${versionLabel} is ready to install. Restart TIA Voice to finish the update.`
}

function wireAutoUpdaterLogging(): void {
  autoUpdater.on('checking-for-update', () => {
    logDebug('updater', 'Checking for updates')
    updateAutoUpdateState({
      status: 'checking',
      lastCheckedAt: Date.now(),
      downloadProgressPercent: null,
      message: 'Checking for updates...'
    })
  })

  autoUpdater.on('update-available', (info) => {
    logDebug('updater', 'Update available', {
      version: info.version,
      releaseDate: info.releaseDate
    })
    updateAutoUpdateState({
      status: 'update-available',
      availableVersion: info.version,
      releaseDate: info.releaseDate,
      downloadProgressPercent: 0,
      message: buildUpdateAvailableMessage(info.version, 0)
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    logDebug('updater', 'Update download progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
    updateAutoUpdateState((current) => ({
      ...current,
      status: 'update-available',
      downloadProgressPercent: progress.percent,
      message: buildUpdateAvailableMessage(current.availableVersion, progress.percent)
    }))
  })

  autoUpdater.on('update-downloaded', (info) => {
    logDebug('updater', 'Update downloaded', {
      version: info.version,
      releaseDate: info.releaseDate
    })
    updateAutoUpdateState({
      status: 'update-downloaded',
      availableVersion: info.version,
      releaseDate: info.releaseDate,
      downloadProgressPercent: 100,
      message: buildDownloadedMessage(info.version)
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    logDebug('updater', 'No update available', {
      version: info.version,
      releaseDate: info.releaseDate
    })
    updateAutoUpdateState({
      status: 'up-to-date',
      availableVersion: null,
      releaseDate: info.releaseDate,
      downloadProgressPercent: null,
      message: `TIA Voice is up to date on ${formatVersion(info.version) ?? app.getVersion()}.`
    })
  })

  autoUpdater.on('error', (error) => {
    logDebug('updater', 'Auto-updater error', {
      errorMessage: error?.message ?? String(error)
    })
    updateAutoUpdateState({
      status: 'error',
      downloadProgressPercent: null,
      message: error?.message ?? 'Unable to check for updates right now.'
    })
  })
}

async function runCheckForUpdates(): Promise<AutoUpdateStatePayload> {
  if (!app.isPackaged) {
    return setAutoUpdateState(buildUnsupportedState())
  }

  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    logDebug('updater', 'Update check failed', {
      errorMessage: error instanceof Error ? error.message : String(error)
    })
    updateAutoUpdateState({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unable to check for updates right now.'
    })
  }

  return autoUpdateState
}

function scheduleUpdateChecks(): void {
  setTimeout(() => {
    void runCheckForUpdates()
  }, INITIAL_CHECK_DELAY_MS)

  setInterval(() => {
    void runCheckForUpdates()
  }, PERIODIC_CHECK_INTERVAL_MS)
}

export function getAutoUpdateState(): AutoUpdateStatePayload {
  return autoUpdateState
}

export async function checkForUpdates(): Promise<AutoUpdateStatePayload> {
  return runCheckForUpdates()
}

export async function restartToUpdate(): Promise<void> {
  if (autoUpdateState.status !== 'update-downloaded') {
    return
  }

  logDebug('updater', 'Restarting application to install downloaded update', {
    version: autoUpdateState.availableVersion
  })
  autoUpdater.quitAndInstall()
}

export function initializeAutoUpdater(input?: {
  onStateChange?: (state: AutoUpdateStatePayload) => void
}): void {
  if (input?.onStateChange) {
    notifyStateChange = input.onStateChange
  }

  if (hasInitialized) {
    notifyStateChange?.(autoUpdateState)
    return
  }
  hasInitialized = true

  if (!app.isPackaged) {
    logDebug('updater', 'Skipping auto-updater initialization in development mode')
    setAutoUpdateState(buildUnsupportedState())
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  logDebug('updater', 'Initialized auto-updater using packaged provider configuration')
  wireAutoUpdaterLogging()
  scheduleUpdateChecks()
  notifyStateChange?.(autoUpdateState)
}
