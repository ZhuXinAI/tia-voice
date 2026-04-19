import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

import { logDebug } from '../logging/debugLogger'
const INITIAL_CHECK_DELAY_MS = 15_000
const PERIODIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

let hasInitialized = false

function wireAutoUpdaterLogging(): void {
  autoUpdater.on('checking-for-update', () => {
    logDebug('updater', 'Checking for updates')
  })

  autoUpdater.on('update-available', (info) => {
    logDebug('updater', 'Update available', {
      version: info.version,
      releaseDate: info.releaseDate
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    logDebug('updater', 'No update available', {
      version: info.version,
      releaseDate: info.releaseDate
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    logDebug('updater', 'Update download progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    logDebug('updater', 'Update downloaded', {
      version: info.version,
      releaseDate: info.releaseDate
    })
  })

  autoUpdater.on('error', (error) => {
    logDebug('updater', 'Auto-updater error', {
      errorMessage: error?.message ?? String(error)
    })
  })
}

function scheduleUpdateChecks(): void {
  const runCheck = async (): Promise<void> => {
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      logDebug('updater', 'Update check failed', {
        errorMessage: error instanceof Error ? error.message : String(error)
      })
    }
  }

  setTimeout(() => {
    void runCheck()
  }, INITIAL_CHECK_DELAY_MS)

  setInterval(() => {
    void runCheck()
  }, PERIODIC_CHECK_INTERVAL_MS)
}

export function initializeAutoUpdater(): void {
  if (hasInitialized) {
    return
  }
  hasInitialized = true

  if (!app.isPackaged) {
    logDebug('updater', 'Skipping auto-updater initialization in development mode')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  logDebug('updater', 'Initialized auto-updater using packaged provider configuration')
  wireAutoUpdaterLogging()
  scheduleUpdateChecks()
}
