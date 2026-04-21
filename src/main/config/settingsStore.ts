import type { TriggerKey } from './env'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  LANGUAGE_PREFERENCES,
  THEME_MODES,
  type LanguagePreference,
  type PostProcessPresetId,
  type ThemeMode
} from '../ipc/channels'
import {
  DEFAULT_POST_PROCESS_PRESET_ID,
  DEFAULT_POST_PROCESS_PRESETS,
  getDefaultPostProcessPreset,
  normalizePostProcessPresetCollection,
  resolveSelectedPostProcessPreset,
  type PostProcessPresetRecord
} from '../providers/llm/postProcessPrompts'

export type ProviderKind = 'dashscope' | 'openai'

export type MicrophonePreference = {
  deviceId: string | null
  label: string | null
}

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
  provider: ProviderKind
  microphone: MicrophonePreference
  languagePreference: LanguagePreference
  themeMode: ThemeMode
  postProcessPreset: PostProcessPresetId
  postProcessPresets: PostProcessPresetRecord[]
  providers: {
    asr: string
    llm: string
  }
  dashscopeApiKey: string | null
  openaiApiKey: string | null
  history: HistoryEntry[]
  onboarding: OnboardingState
}

export type SettingsStore = {
  get(): AppSettings
  setHotkey(hotkey: TriggerKey): void
  getProvider(): ProviderKind
  setProvider(provider: ProviderKind): void
  getMicrophone(): MicrophonePreference
  setMicrophone(preference: MicrophonePreference): void
  appendHistory(entry: HistoryEntry): void
  getHistoryPage(input?: { offset?: number; limit?: number }): {
    items: HistoryEntry[]
    totalCount: number
  }
  setLanguagePreference(languagePreference: LanguagePreference): void
  setThemeMode(themeMode: ThemeMode): void
  getPostProcessPreset(): PostProcessPresetId
  getPostProcessPresets(): PostProcessPresetRecord[]
  getSelectedPostProcessPreset(): PostProcessPresetRecord
  setPostProcessPreset(presetId: PostProcessPresetId): void
  savePostProcessPreset(input: {
    id: string
    name: string
    systemPrompt: string
  }): PostProcessPresetRecord
  resetPostProcessPreset(presetId: string): PostProcessPresetRecord
  createPostProcessPreset(input: { name: string; systemPrompt: string }): PostProcessPresetRecord
  hasDashscopeApiKey(): boolean
  getDashscopeApiKey(): string | null
  getDashscopeKeyLabel(): string | null
  setDashscopeApiKey(apiKey: string): void
  hasOpenAiApiKey(): boolean
  getOpenAiApiKey(): string | null
  getOpenAiKeyLabel(): string | null
  setOpenAiApiKey(apiKey: string): void
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
  provider?: ProviderKind
  microphone?: Partial<MicrophonePreference>
  languagePreference?: LanguagePreference
  themeMode: ThemeMode
  postProcessPreset?: PostProcessPresetId
  postProcessPresets?: PostProcessPresetRecord[]
  providers: {
    asr: string
    llm: string
  }
  dashscopeApiKey?: string | null
  openaiApiKey?: string | null
  history: HistoryEntry[]
  onboarding?: Partial<OnboardingState>
}

const SETTINGS_FILE_NAME = 'settings.json'
const AUDIO_HISTORY_DIR_NAME = 'history-audio'
const MAX_HISTORY_ITEMS = 100
const DEFAULT_HISTORY_PAGE_SIZE = 20

const PROVIDER_MODELS: Record<ProviderKind, AppSettings['providers']> = {
  dashscope: {
    asr: 'qwen3-asr-flash',
    llm: 'qwen-plus'
  },
  openai: {
    asr: 'gpt-4o-mini-transcribe',
    llm: 'gpt-5-mini'
  }
}

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

function normalizeLanguagePreference(value: unknown): LanguagePreference {
  if (typeof value !== 'string') {
    return 'system'
  }

  return LANGUAGE_PREFERENCES.includes(value as LanguagePreference)
    ? (value as LanguagePreference)
    : 'system'
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function normalizeRequiredString(value: unknown, fallback: string): string {
  const normalized = normalizeString(value)
  return normalized ?? fallback
}

function normalizeProvider(
  value: unknown,
  legacyProviders?: Partial<PersistedSettings['providers']>
): ProviderKind {
  if (value === 'openai' || value === 'dashscope') {
    return value
  }

  if (
    legacyProviders?.asr === PROVIDER_MODELS.openai.asr ||
    legacyProviders?.llm === PROVIDER_MODELS.openai.llm
  ) {
    return 'openai'
  }

  return 'dashscope'
}

function getProviderModels(provider: ProviderKind): AppSettings['providers'] {
  return { ...PROVIDER_MODELS[provider] }
}

function normalizeMicrophonePreference(value: unknown): MicrophonePreference {
  return {
    deviceId: normalizeString((value as MicrophonePreference | undefined)?.deviceId),
    label: normalizeString((value as MicrophonePreference | undefined)?.label)
  }
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
    provider: 'dashscope',
    microphone: {
      deviceId: null,
      label: null
    },
    languagePreference: 'system',
    themeMode: 'system',
    postProcessPreset: DEFAULT_POST_PROCESS_PRESET_ID,
    postProcessPresets: DEFAULT_POST_PROCESS_PRESETS.map((preset) => ({ ...preset })),
    providers: getProviderModels('dashscope'),
    dashscopeApiKey: null,
    openaiApiKey: null,
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
      const provider = normalizeProvider(parsed.provider, parsed.providers)
      const history = Array.isArray(parsed.history)
        ? parsed.history.map((item) => normalizeHistoryEntry(item))
        : []
      const postProcessPresets = normalizePostProcessPresetCollection(parsed.postProcessPresets)
      const selectedPostProcessPreset = resolveSelectedPostProcessPreset({
        selectedPresetId: normalizeRequiredString(
          parsed.postProcessPreset,
          DEFAULT_POST_PROCESS_PRESET_ID
        ),
        presets: postProcessPresets
      })

      return {
        hotkey:
          parsed.hotkey === 'AltRight' ||
          parsed.hotkey === 'MetaRight' ||
          parsed.hotkey === 'ControlRight'
            ? parsed.hotkey
            : defaultHotkey,
        provider,
        microphone: normalizeMicrophonePreference(parsed.microphone),
        languagePreference: normalizeLanguagePreference(parsed.languagePreference),
        themeMode: normalizeThemeMode(parsed.themeMode),
        postProcessPreset: selectedPostProcessPreset.id,
        postProcessPresets,
        providers: getProviderModels(provider),
        dashscopeApiKey: normalizeString(parsed.dashscopeApiKey),
        openaiApiKey: normalizeString(parsed.openaiApiKey),
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
      provider: state.provider,
      microphone: {
        deviceId: state.microphone.deviceId,
        label: state.microphone.label
      },
      languagePreference: state.languagePreference,
      themeMode: state.themeMode,
      postProcessPreset: state.postProcessPreset,
      postProcessPresets: state.postProcessPresets.map((preset) => ({ ...preset })),
      providers: getProviderModels(state.provider),
      dashscopeApiKey: state.dashscopeApiKey,
      openaiApiKey: state.openaiApiKey,
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
        providers: getProviderModels(state.provider),
        microphone: { ...state.microphone },
        languagePreference: state.languagePreference,
        postProcessPreset: state.postProcessPreset,
        postProcessPresets: state.postProcessPresets.map((preset) => ({ ...preset })),
        dashscopeApiKey: state.dashscopeApiKey,
        openaiApiKey: state.openaiApiKey,
        history: state.history.map((item) => ({
          ...item,
          audio: item.audio ? { ...item.audio } : undefined
        })),
        onboarding: {
          completed: state.onboarding.completed
        }
      }
    },
    setHotkey(hotkey: TriggerKey): void {
      if (state.hotkey === hotkey) {
        return
      }

      state.hotkey = hotkey
      persistState()
    },
    getProvider(): ProviderKind {
      return state.provider
    },
    setProvider(provider: ProviderKind): void {
      if (state.provider === provider) {
        return
      }

      state.provider = provider
      state.providers = getProviderModels(provider)
      persistState()
    },
    getMicrophone(): MicrophonePreference {
      return {
        ...state.microphone
      }
    },
    setMicrophone(preference: MicrophonePreference): void {
      const nextPreference = normalizeMicrophonePreference(preference)

      if (
        state.microphone.deviceId === nextPreference.deviceId &&
        state.microphone.label === nextPreference.label
      ) {
        return
      }

      state.microphone = nextPreference
      persistState()
    },
    setLanguagePreference(languagePreference: LanguagePreference): void {
      const normalized = normalizeLanguagePreference(languagePreference)
      if (state.languagePreference === normalized) {
        return
      }

      state.languagePreference = normalized
      persistState()
    },
    appendHistory(entry: HistoryEntry): void {
      state.history.unshift(normalizeHistoryEntry(entry))
      state.history = trimHistoryWithCleanup(state.history, audioHistoryDirPath)
      persistState()
    },
    getHistoryPage(input = {}): { items: HistoryEntry[]; totalCount: number } {
      const offset =
        typeof input.offset === 'number' && Number.isFinite(input.offset) && input.offset > 0
          ? Math.floor(input.offset)
          : 0
      const limit =
        typeof input.limit === 'number' && Number.isFinite(input.limit) && input.limit > 0
          ? Math.floor(input.limit)
          : DEFAULT_HISTORY_PAGE_SIZE
      const sortedHistory = [...state.history].sort((a, b) => b.createdAt - a.createdAt)
      const items = sortedHistory.slice(offset, offset + limit).map((item) => ({
        ...item,
        audio: item.audio ? { ...item.audio } : undefined
      }))

      return {
        items,
        totalCount: sortedHistory.length
      }
    },
    setThemeMode(themeMode: ThemeMode): void {
      const normalized = normalizeThemeMode(themeMode)
      if (state.themeMode === normalized) {
        return
      }

      state.themeMode = normalized
      persistState()
    },
    getPostProcessPreset(): PostProcessPresetId {
      return state.postProcessPreset
    },
    getPostProcessPresets(): PostProcessPresetRecord[] {
      return state.postProcessPresets.map((preset) => ({ ...preset }))
    },
    getSelectedPostProcessPreset(): PostProcessPresetRecord {
      return {
        ...resolveSelectedPostProcessPreset({
          selectedPresetId: state.postProcessPreset,
          presets: state.postProcessPresets
        })
      }
    },
    setPostProcessPreset(presetId: PostProcessPresetId): void {
      const nextPreset = resolveSelectedPostProcessPreset({
        selectedPresetId: normalizeRequiredString(presetId, DEFAULT_POST_PROCESS_PRESET_ID),
        presets: state.postProcessPresets
      })
      if (state.postProcessPreset === nextPreset.id) {
        return
      }

      state.postProcessPreset = nextPreset.id
      persistState()
    },
    savePostProcessPreset(input): PostProcessPresetRecord {
      const presetIndex = state.postProcessPresets.findIndex((preset) => preset.id === input.id)
      if (presetIndex < 0) {
        throw new Error('Post-process preset not found.')
      }

      const previousPreset = state.postProcessPresets[presetIndex]
      const nextPreset: PostProcessPresetRecord = {
        ...previousPreset,
        name: normalizeRequiredString(input.name, previousPreset.name),
        systemPrompt: normalizeRequiredString(input.systemPrompt, previousPreset.systemPrompt)
      }

      state.postProcessPresets[presetIndex] = nextPreset
      persistState()
      return { ...nextPreset }
    },
    resetPostProcessPreset(presetId): PostProcessPresetRecord {
      const presetIndex = state.postProcessPresets.findIndex((preset) => preset.id === presetId)
      if (presetIndex < 0) {
        throw new Error('Post-process preset not found.')
      }

      const defaultPreset = getDefaultPostProcessPreset(presetId)
      if (!defaultPreset) {
        throw new Error('Only built-in presets can be reset.')
      }

      state.postProcessPresets[presetIndex] = defaultPreset
      persistState()
      return { ...defaultPreset }
    },
    createPostProcessPreset(input): PostProcessPresetRecord {
      const name = normalizeRequiredString(input.name, 'New preset')
      const systemPrompt = normalizeRequiredString(
        input.systemPrompt,
        'Preserve meaning while following these instructions.'
      )
      const nextPreset: PostProcessPresetRecord = {
        id: crypto.randomUUID(),
        name,
        systemPrompt,
        builtIn: false
      }

      state.postProcessPresets = [...state.postProcessPresets, nextPreset]
      state.postProcessPreset = nextPreset.id
      persistState()
      return { ...nextPreset }
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
    hasOpenAiApiKey(): boolean {
      return Boolean(state.openaiApiKey)
    },
    getOpenAiApiKey(): string | null {
      return state.openaiApiKey
    },
    getOpenAiKeyLabel(): string | null {
      return maskApiKey(state.openaiApiKey)
    },
    setOpenAiApiKey(apiKey: string): void {
      const normalizedApiKey = normalizeString(apiKey)
      if (!normalizedApiKey) {
        throw new Error('OpenAI API key is required.')
      }

      if (state.openaiApiKey === normalizedApiKey) {
        return
      }

      state.openaiApiKey = normalizedApiKey
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
