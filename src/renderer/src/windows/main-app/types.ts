import type {
  MeetingDetailPayload as PreloadMeetingDetail,
  MeetingHistoryEntry as PreloadMeetingHistoryEntry,
  MeetingHistoryPagePayload as PreloadMeetingHistoryPage,
  MainAppState as PreloadMainAppState,
  TiaHistoryDebugEntry as PreloadHistoryDebugEntry
} from '../../../../preload/index'

export type MainAppState = PreloadMainAppState
export type MainAppHistoryEntry = MainAppState['history'][number]
export type TiaHistoryDebugEntry = PreloadHistoryDebugEntry
export type MeetingHistoryEntry = PreloadMeetingHistoryEntry
export type MeetingHistoryPage = PreloadMeetingHistoryPage
export type MeetingDetail = PreloadMeetingDetail
export type DashscopeSetupState = MainAppState['dashscope']
export type SettingsSection = 'general' | 'providers' | 'permissions' | 'language' | 'about'

export type DictionaryPhrase = MainAppState['dictionaryEntries'][number]
