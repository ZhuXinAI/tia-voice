import { mkdirSync, appendFileSync } from 'fs'
import { app } from 'electron'
import { join } from 'path'

const DEBUG_LOG_FILE_NAME = 'tia-voice-debug.log'

let cachedLogPath: string | null = null
let warnedAboutLogWriteFailure = false

function resolveDebugLogPath(): string {
  if (cachedLogPath) {
    return cachedLogPath
  }

  let userDataPath: string
  try {
    userDataPath = app.getPath('userData')
  } catch {
    userDataPath = process.cwd()
  }

  const logsDir = join(userDataPath, 'logs')
  mkdirSync(logsDir, { recursive: true })
  cachedLogPath = join(logsDir, DEBUG_LOG_FILE_NAME)
  return cachedLogPath
}

function serializeDetails(details: unknown): string {
  if (details === undefined) {
    return ''
  }

  if (details instanceof Error) {
    const payload = {
      name: details.name,
      message: details.message,
      stack: details.stack
    }
    return JSON.stringify(payload)
  }

  if (typeof details === 'string') {
    return details
  }

  try {
    return JSON.stringify(details)
  } catch {
    return String(details)
  }
}

export function getDebugLogPath(): string {
  return resolveDebugLogPath()
}

export function logDebug(scope: string, message: string, details?: unknown): void {
  const timestamp = new Date().toISOString()
  const detailText = serializeDetails(details)
  const line = detailText
    ? `[${timestamp}] [${scope}] ${message} ${detailText}`
    : `[${timestamp}] [${scope}] ${message}`

  console.info(line)

  try {
    appendFileSync(resolveDebugLogPath(), `${line}\n`, { encoding: 'utf8' })
  } catch (error) {
    if (warnedAboutLogWriteFailure) {
      return
    }

    warnedAboutLogWriteFailure = true
    console.warn('[debug-log] Failed to write debug log file.', error)
  }
}
