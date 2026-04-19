import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

import { logDebug } from '../logging/debugLogger'

type AutoUpdateFeedConfig = {
  url?: unknown
}

const FEED_CONFIG_FILE = 'auto-update-feed.json'
const INITIAL_CHECK_DELAY_MS = 15_000
const PERIODIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

let hasInitialized = false

function normalizeUrl(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed === '') {
    return null
  }

  try {
    const parsed = new URL(trimmed)
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

function resolveFeedUrlFromFile(): string | null {
  const candidates = [
    join(process.resourcesPath, FEED_CONFIG_FILE),
    join(process.resourcesPath, 'resources', FEED_CONFIG_FILE),
    join(app.getAppPath(), 'resources', FEED_CONFIG_FILE),
    join(process.cwd(), 'resources', FEED_CONFIG_FILE)
  ]

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue
    }

    try {
      const raw = readFileSync(candidate, 'utf8')
      const parsed = JSON.parse(raw) as AutoUpdateFeedConfig
      if (typeof parsed.url !== 'string') {
        continue
      }

      const normalized = normalizeUrl(parsed.url)
      if (normalized) {
        logDebug('updater', 'Resolved auto-update feed URL from config file', {
          path: candidate
        })
        return normalized
      }
    } catch (error) {
      logDebug('updater', 'Failed to parse auto-update feed config file', {
        path: candidate,
        error
      })
    }
  }

  return null
}

function resolveFeedUrl(): string | null {
  const envUrl = process.env.TIA_AUTO_UPDATE_URL
  if (typeof envUrl === 'string') {
    const normalizedFromEnv = normalizeUrl(envUrl)
    if (normalizedFromEnv) {
      logDebug('updater', 'Resolved auto-update feed URL from environment variable', {
        variable: 'TIA_AUTO_UPDATE_URL'
      })
      return normalizedFromEnv
    }
  }

  return resolveFeedUrlFromFile()
}

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

  const feedUrl = resolveFeedUrl()
  if (!feedUrl) {
    logDebug('updater', 'Auto-updater feed URL is not configured; skipping initialization')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  try {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: feedUrl
    })
  } catch (error) {
    logDebug('updater', 'Failed to configure auto-updater feed URL', {
      feedUrl,
      errorMessage: error instanceof Error ? error.message : String(error)
    })
    return
  }

  logDebug('updater', 'Initialized auto-updater', { feedUrl })
  wireAutoUpdaterLogging()
  scheduleUpdateChecks()
}
