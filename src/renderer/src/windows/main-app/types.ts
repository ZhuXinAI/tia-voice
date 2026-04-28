import type {
  MainAppState as PreloadMainAppState,
  TiaHistoryDebugEntry as PreloadHistoryDebugEntry
} from '../../../../preload/index'

export type MainAppState = PreloadMainAppState
export type MainAppHistoryEntry = MainAppState['history'][number]
export type TiaHistoryDebugEntry = PreloadHistoryDebugEntry
export type DashscopeSetupState = MainAppState['dashscope']
export type SettingsSection = 'general' | 'providers' | 'permissions' | 'language' | 'about'

export type DictionaryPhrase = MainAppState['dictionaryEntries'][number]
