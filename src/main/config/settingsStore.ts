import type { TriggerKey } from './env'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { THEME_MODES, type ThemeMode } from '../ipc/channels'

export type HistoryEntry = {
  id: string
  createdAt: number
  transcript: string
  cleanedText: string
  status: 'pending' | 'completed' | 'failed'
  errorDetail?: string
  audio?: {
    fileName: string
    mimeType: string
    durationMs: number
    sizeBytes: number
  }
}

export type OnboardingState = {
  completed: boolean
}

export type AppSettings = {
  hotkey: TriggerKey
  themeMode: ThemeMode
  providers: {
    asr: string
    llm: string
  }
  dashscopeApiKey: string | null
  history: HistoryEntry[]
  onboarding: OnboardingState
}

export type SettingsStore = {
  get(): AppSettings
  appendHistory(entry: HistoryEntry): void
  setThemeMode(themeMode: ThemeMode): void
  hasDashscopeApiKey(): boolean
  getDashscopeApiKey(): string | null
  getDashscopeKeyLabel(): string | null
  setDashscopeApiKey(apiKey: string): void
  isOnboardingComplete(): boolean
  markOnboardingComplete(): void
  clearOnboardingCompletion(): void
  updateHistoryEntry(entryId: string, patch: Partial<HistoryEntry>): void
  getHistoryEntry(entryId: string): HistoryEntry | null
  saveAudioClip(
    entryId: string,
    input: {
      mimeType: string
      buffer: Uint8Array
      durationMs: number
      sizeBytes?: number
    }
  ): Promise<HistoryEntry['audio'] | null>
  readAudioClip(entryId: string): Promise<{
    mimeType: string
    buffer: Uint8Array
    durationMs: number
    sizeBytes: number
  } | null>
}

type PersistedSettings = {
  hotkey: TriggerKey
  themeMode: ThemeMode
  providers: {
    asr: string
    llm: string
  }
  dashscopeApiKey?: string | null
  history: HistoryEntry[]
  onboarding?: Partial<OnboardingState>
}

const SETTINGS_FILE_NAME = 'settings.json'
const AUDIO_HISTORY_DIR_NAME = 'history-audio'
const MAX_HISTORY_ITEMS = 100

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true })
}

function resolveExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('webm')) {
    return '.webm'
  }
  if (normalized.includes('mp4')) {
    return '.mp4'
  }
  if (normalized.includes('wav')) {
    return '.wav'
  }
  if (normalized.includes('mpeg')) {
    return '.mp3'
  }
  return '.bin'
}

function sanitizeFileNamePart(value: string): string {
  return value.replace(/[^a-z0-9-_]/gi, '-').slice(0, 64)
}

function normalizeHistoryEntry(entry: Partial<HistoryEntry> & { id: string }): HistoryEntry {
  return {
    id: entry.id,
    createdAt:
      typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)
        ? entry.createdAt
        : Date.now(),
    transcript: typeof entry.transcript === 'string' ? entry.transcript : '',
    cleanedText: typeof entry.cleanedText === 'string' ? entry.cleanedText : '',
    status:
      entry.status === 'pending' || entry.status === 'completed' || entry.status === 'failed'
        ? entry.status
        : 'completed',
    errorDetail: typeof entry.errorDetail === 'string' ? entry.errorDetail : undefined,
    audio:
      entry.audio &&
      typeof entry.audio.fileName === 'string' &&
      typeof entry.audio.mimeType === 'string' &&
      typeof entry.audio.durationMs === 'number' &&
      typeof entry.audio.sizeBytes === 'number'
        ? {
            fileName: entry.audio.fileName,
            mimeType: entry.audio.mimeType,
            durationMs: entry.audio.durationMs,
            sizeBytes: entry.audio.sizeBytes
          }
        : undefined
  }
}

function normalizeThemeMode(value: unknown): ThemeMode {
  if (typeof value !== 'string') {
    return 'system'
  }

  return THEME_MODES.includes(value as ThemeMode) ? (value as ThemeMode) : 'system'
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function normalizeOnboardingState(value: unknown): OnboardingState {
  const legacyCompletedUserIds = Array.isArray(
    (value as { completedUserIds?: unknown } | undefined)?.completedUserIds
  )

  return {
    completed: (value as OnboardingState | undefined)?.completed === true || legacyCompletedUserIds
  }
}

function maskApiKey(value: string | null): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (trimmed.length <= 8) {
    return 'Saved locally'
  }

  return `Saved locally ••••${trimmed.slice(-4)}`
}

function trimHistoryWithCleanup(history: HistoryEntry[], audioDirPath: string): HistoryEntry[] {
  if (history.length <= MAX_HISTORY_ITEMS) {
    return history
  }

  const removed = history.slice(MAX_HISTORY_ITEMS)
  for (const item of removed) {
    if (!item.audio?.fileName) {
      continue
    }

    const path = join(audioDirPath, item.audio.fileName)
    try {
      unlinkSync(path)
    } catch {
      // best-effort cleanup only
    }
  }

  return history.slice(0, MAX_HISTORY_ITEMS)
}

export function createSettingsStore(
  defaultHotkey: TriggerKey,
  storageRoot = process.cwd()
): SettingsStore {
  const settingsPath = join(storageRoot, SETTINGS_FILE_NAME)
  const audioHistoryDirPath = join(storageRoot, AUDIO_HISTORY_DIR_NAME)
  ensureDirectory(storageRoot)
  ensureDirectory(audioHistoryDirPath)

  const defaults: AppSettings = {
    hotkey: defaultHotkey,
    themeMode: 'system',
    providers: {
      asr: 'qwen3-asr-flash',
      llm: 'qwen-plus'
    },
    dashscopeApiKey: null,
    history: [],
    onboarding: {
      completed: false
    }
  }

  function loadInitialState(): AppSettings {
    if (!existsSync(settingsPath)) {
      return defaults
    }

    try {
      const raw = readFileSync(settingsPath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<PersistedSettings>
      const history = Array.isArray(parsed.history)
        ? parsed.history.map((item) => normalizeHistoryEntry(item))
        : []

      return {
        hotkey:
          parsed.hotkey === 'AltRight' || parsed.hotkey === 'MetaRight'
            ? parsed.hotkey
            : defaultHotkey,
        themeMode: normalizeThemeMode(parsed.themeMode),
        providers: {
          asr:
            typeof parsed.providers?.asr === 'string' && parsed.providers.asr.trim() !== ''
              ? parsed.providers.asr
              : defaults.providers.asr,
          llm:
            typeof parsed.providers?.llm === 'string' && parsed.providers.llm.trim() !== ''
              ? parsed.providers.llm
              : defaults.providers.llm
        },
        dashscopeApiKey: normalizeString(parsed.dashscopeApiKey),
        history,
        onboarding: normalizeOnboardingState(parsed.onboarding)
      }
    } catch {
      return defaults
    }
  }

  const state: AppSettings = {
    ...loadInitialState()
  }

  function persistState(): void {
    const payload: PersistedSettings = {
      hotkey: state.hotkey,
      themeMode: state.themeMode,
      providers: {
        asr: state.providers.asr,
        llm: state.providers.llm
      },
      dashscopeApiKey: state.dashscopeApiKey,
      history: state.history,
      onboarding: {
        completed: state.onboarding.completed
      }
    }

    writeFileSync(settingsPath, JSON.stringify(payload, null, 2), 'utf8')
  }

  return {
    get(): AppSettings {
      return {
        ...state,
        providers: { ...state.providers },
        dashscopeApiKey: state.dashscopeApiKey,
        history: state.history.map((item) => ({
          ...item,
          audio: item.audio ? { ...item.audio } : undefined
        })),
        onboarding: {
          completed: state.onboarding.completed
        }
      }
    },
    appendHistory(entry: HistoryEntry): void {
      state.history.unshift(normalizeHistoryEntry(entry))
      state.history = trimHistoryWithCleanup(state.history, audioHistoryDirPath)
      persistState()
    },
    setThemeMode(themeMode: ThemeMode): void {
      const normalized = normalizeThemeMode(themeMode)
      if (state.themeMode === normalized) {
        return
      }

      state.themeMode = normalized
      persistState()
    },
    hasDashscopeApiKey(): boolean {
      return Boolean(state.dashscopeApiKey)
    },
    getDashscopeApiKey(): string | null {
      return state.dashscopeApiKey
    },
    getDashscopeKeyLabel(): string | null {
      return maskApiKey(state.dashscopeApiKey)
    },
    setDashscopeApiKey(apiKey: string): void {
      const normalizedApiKey = normalizeString(apiKey)
      if (!normalizedApiKey) {
        throw new Error('DashScope API key is required.')
      }

      if (state.dashscopeApiKey === normalizedApiKey) {
        return
      }

      state.dashscopeApiKey = normalizedApiKey
      persistState()
    },
    isOnboardingComplete(): boolean {
      return state.onboarding.completed
    },
    markOnboardingComplete(): void {
      if (state.onboarding.completed) {
        return
      }

      state.onboarding.completed = true
      persistState()
    },
    clearOnboardingCompletion(): void {
      if (!state.onboarding.completed) {
        return
      }

      state.onboarding.completed = false
      persistState()
    },
    updateHistoryEntry(entryId: string, patch: Partial<HistoryEntry>): void {
      const index = state.history.findIndex((item) => item.id === entryId)
      if (index < 0) {
        return
      }

      const previous = state.history[index]
      const next = normalizeHistoryEntry({
        ...previous,
        ...patch,
        id: previous.id
      })

      state.history[index] = next
      persistState()
    },
    getHistoryEntry(entryId: string): HistoryEntry | null {
      const entry = state.history.find((item) => item.id === entryId)
      if (!entry) {
        return null
      }

      return {
        ...entry,
        audio: entry.audio ? { ...entry.audio } : undefined
      }
    },
    async saveAudioClip(
      entryId: string,
      input: {
        mimeType: string
        buffer: Uint8Array
        durationMs: number
        sizeBytes?: number
      }
    ): Promise<HistoryEntry['audio'] | null> {
      const entry = state.history.find((item) => item.id === entryId)
      if (!entry) {
        return null
      }

      const extension = resolveExtension(input.mimeType)
      const safeId = sanitizeFileNamePart(entryId)
      const fileName = `${safeId}-${Date.now()}${extension}`
      const filePath = join(audioHistoryDirPath, fileName)
      await writeFile(filePath, Buffer.from(input.buffer))

      const audio = {
        fileName,
        mimeType: input.mimeType,
        durationMs: input.durationMs,
        sizeBytes: input.sizeBytes ?? input.buffer.byteLength
      }

      entry.audio = audio
      persistState()
      return audio
    },
    async readAudioClip(entryId: string): Promise<{
      mimeType: string
      buffer: Uint8Array
      durationMs: number
      sizeBytes: number
    } | null> {
      const entry = state.history.find((item) => item.id === entryId)
      if (!entry?.audio) {
        return null
      }

      const filePath = join(audioHistoryDirPath, entry.audio.fileName)
      try {
        const content = await readFile(filePath)
        return {
          mimeType: entry.audio.mimeType,
          buffer: new Uint8Array(content),
          durationMs: entry.audio.durationMs,
          sizeBytes: entry.audio.sizeBytes
        }
      } catch {
        return null
      }
    }
  }
}
