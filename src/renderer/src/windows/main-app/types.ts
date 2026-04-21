import type {
  MainAppState as PreloadMainAppState,
  TiaHistoryDebugEntry as PreloadHistoryDebugEntry
} from '../../../../preload/index'

export type MainAppState = PreloadMainAppState
export type MainAppHistoryEntry = MainAppState['history'][number]
export type TiaHistoryDebugEntry = PreloadHistoryDebugEntry
export type DashscopeSetupState = MainAppState['dashscope']
export type SettingsSection = 'general' | 'providers' | 'permissions' | 'about'

export type DictionaryPhrase = {
  id: string
  phrase: string
  replacement: string
  notes: string
}
