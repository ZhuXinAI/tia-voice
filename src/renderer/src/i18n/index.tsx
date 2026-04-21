/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from 'react'

import type { AppLanguage } from '../../../shared/i18n/config'
import { getIntlLocale } from '../../../shared/i18n/config'

type TranslationParams = Record<string, string | number | null | undefined>
type TranslationValue = string | ((params: TranslationParams) => string)
type TranslationTable = Record<string, TranslationValue>

const MESSAGES: Record<AppLanguage, TranslationTable> = {
  en: {
    'app.workspace': 'Workspace',
    'nav.home': 'Home',
    'nav.dictionary': 'Dictionary',
    'nav.presets': 'Presets',
    'nav.settings': 'Settings',
    'sidebar.desktopAssistant': 'Desktop assistant',
    'sidebar.update': 'Update',
    'sidebar.restarting': 'Restarting…',
    'sidebar.navigation': 'Navigation',
    'sidebar.permissionsAttention': 'Permissions need attention',
    'sidebar.warning': 'Warning',
    'sidebar.permissionsMissingTitle': 'Voice typing is missing permission access',
    'sidebar.permissionsMissingBody':
      'Open Permissions in Settings and enable Accessibility plus Microphone in macOS.',
    'sidebar.fixPermissions': 'Fix permissions',
    'sidebar.provider': 'Provider',
    'sidebar.noApiKey': 'No API key saved yet',
    'sidebar.postProcessPreset': 'PostProcess preset',
    'sidebar.manageKey': 'Manage key',
    'sidebar.addKey': 'Add key',
    'home.totalWordsSpoken': 'Total words spoken',
    'home.averageWpm': 'Average WPM',
    'home.transcriptions': 'Transcriptions',
    'home.transcriptionHistory': 'Transcription history',
    'home.transcriptionHistoryDetail': ({ historyCount, totalCount }) =>
      `Showing the ${historyCount} most recent of ${totalCount} transcriptions with retry actions for failed entries.`,
    'common.showAll': 'Show All',
    'history.empty': 'No voice history yet. Your next cleaned transcription will appear here.',
    'history.openDetails': ({ title }) => `Open details for ${title}`,
    'history.retry': 'Retry',
    'history.retrying': 'Retrying…',
    'history.status.completed': 'Completed',
    'history.status.pending': 'Pending',
    'history.status.failed': 'Failed',
    'history.fullTitle': 'Full transcription history',
    'history.fullDescription': ({ totalCount }) =>
      `Browse all ${totalCount} saved transcriptions. Each page shows 10 records.`,
    'history.loading': 'Loading history…',
    'history.page': ({ current, total }) => `Page ${current} of ${total}`,
    'common.previous': 'Previous',
    'common.next': 'Next',
    'historyDebug.title': 'Transcription details',
    'historyDebug.description': 'Saved audio, raw ASR, and processed output.',
    'historyDebug.loading': 'Loading debug details…',
    'historyDebug.audioPlayback': 'Audio playback',
    'historyDebug.noAudio': 'No audio clip saved for this item.',
    'historyDebug.rawTranscript': 'Raw transcript',
    'historyDebug.noRawTranscript': 'No raw transcript captured.',
    'historyDebug.processed': 'LLM processed',
    'historyDebug.noProcessed': 'No processed output captured.',
    'historyDebug.errorDetail': 'Error detail',
    'historyDebug.noDetails': 'This history item no longer has debug details.',
    'dictionary.title': 'Pronunciation dictionary',
    'dictionary.description':
      'Teach the PostProcess model how to normalize brand names, acronyms, and special phrases.',
    'dictionary.spokenPhrase': 'Spoken phrase',
    'dictionary.spokenPlaceholder': 'e.g. build mine',
    'dictionary.normalizedOutput': 'Normalized output',
    'dictionary.normalizedPlaceholder': 'e.g. BuildMind',
    'dictionary.notes': 'Optional instruction notes',
    'dictionary.notesPlaceholder': 'Add handling details that help LLM PostProcess.',
    'dictionary.addRule': 'Add phrase rule',
    'dictionary.entriesTitle': 'Current dictionary entries',
    'dictionary.entriesDescription':
      'These rules will be used to stabilize transcription PostProcess output.',
    'dictionary.spoken': 'Spoken',
    'dictionary.output': 'Output',
    'presets.badge': 'Presets shape the PostProcess prompt',
    'presets.heroTitle':
      'Tune the instruction layer that sits between the base prompt and the live context.',
    'presets.heroBody':
      'Pick a preset for everyday use, rewrite its instructions when the output needs a different tone, and add new presets for other writing styles or workflows.',
    'presets.layer.base': '1 Base prompt',
    'presets.layer.preset': '2 Preset prompt',
    'presets.layer.context': '3 Remaining context',
    'presets.libraryTitle': 'Preset library',
    'presets.libraryDescription':
      'Click a preset to make it active. Use edit to adjust its prompt or reset built-ins to their defaults.',
    'presets.newPreset': 'New preset',
    'presets.builtIn': 'Built-in',
    'presets.editPresetAria': ({ name }) => `Edit preset ${name}`,
    'presets.editPreset': 'Edit preset',
    'presetEditor.newTitle': 'New preset',
    'presetEditor.fallbackTitle': 'Preset',
    'presetEditor.newDescription': 'Create a new PostProcess instruction set.',
    'presetEditor.editDescription':
      'Adjust the prompt used for this preset, or reset the built-in wording back to default.',
    'presetEditor.promptOrder': 'Prompt order',
    'presetEditor.promptOrderBody':
      'Base prompt, then this preset prompt, then the remaining transcript and selected-text context.',
    'presetEditor.name': 'Preset name',
    'presetEditor.namePlaceholder': 'e.g. Customer support',
    'presetEditor.prompt': 'Preset prompt',
    'presetEditor.promptPlaceholder': 'Describe how the PostProcess pass should shape the text.',
    'presetEditor.reset': 'Reset to default',
    'presetEditor.save': 'Save changes',
    'presetEditor.create': 'Create preset',
    'settings.title': 'Settings',
    'settings.description': 'Configure general and system preferences.',
    'settings.general': 'General',
    'settings.providers': 'Providers',
    'settings.permissions': 'Permissions',
    'settings.language': 'Language',
    'settings.about': 'About',
    'settings.generalTitle': 'General',
    'settings.generalBody': 'Shortcut and input device behavior for dictation.',
    'settings.theme': 'Theme',
    'settings.shortcuts': 'Shortcuts',
    'settings.microphone': 'Microphone',
    'settings.systemDefaultMic': 'System default microphone',
    'settings.saving': 'Saving…',
    'settings.providersTitle': 'Providers',
    'settings.providersBody':
      'Choose the voice stack you want TIA Voice to use, then save the matching API key locally on this device.',
    'settings.permissionsTitle': 'Permissions',
    'settings.permissionsBody':
      'TIA Voice re-checks these whenever the app window becomes active so missing macOS permissions stay visible.',
    'settings.permissionStatus': 'Permission status',
    'settings.permissionSummaryBlocked':
      'TIA Voice is still blocked from full voice typing until both permissions are enabled.',
    'settings.permissionSummaryReady': 'All required permissions are enabled for voice typing.',
    'settings.permissionSummaryAria': 'Permission summary',
    'settings.onboardingTools': 'Onboarding test tools',
    'settings.onboardingToolsBody':
      'Clear onboarding completion so the app starts at setup again next time.',
    'settings.resetOnboarding': 'Reset onboarding cache',
    'settings.resetting': 'Resetting…',
    'settings.languageTitle': 'Language',
    'settings.languageBody':
      'Choose how TIA Voice renders labels, onboarding copy, and settings throughout the app.',
    'settings.languageCurrent': ({ language }) => `Current app language: ${language}`,
    'settings.languageResolved': ({ language }) =>
      `System default is currently resolving to ${language}.`,
    'settings.languageDirect': 'This language is currently active throughout the app.',
    'settings.languageSystem': 'Use system default',
    'settings.languageSystemDetail':
      'Follow your macOS preferred language and fall back to English when unsupported.',
    'settings.languageEnglish': 'English',
    'settings.languageSimplified': 'Simplified Chinese',
    'settings.languageTraditional': 'Traditional Chinese',
    'settings.active': 'Active',
    'settings.usingNow': 'Using now',
    'settings.providerActive': 'Active provider',
    'settings.providerActiveBody':
      'Switching providers updates both transcription and PostProcess models.',
    'settings.providerActiveBadge': 'Active',
    'settings.switching': 'Switching…',
    'settings.dashscopeKey': 'DashScope API key',
    'settings.localKeyStorage':
      'Your key is stored locally on this device and used directly by the desktop app.',
    'settings.replaceSavedKey': 'Replace saved key',
    'settings.enterNewDashscopeKey': 'Enter a new DashScope API key',
    'settings.enterDashscopeKey': 'Enter your DashScope API key',
    'settings.status': 'Status',
    'settings.models': 'Models',
    'settings.saveKey': 'Save key',
    'settings.updateKey': 'Update key',
    'settings.openAiKey': 'OpenAI API key',
    'settings.openAiKeyBody':
      'OpenAI uses the AI SDK integration for `gpt-4o-mini-transcribe` and `gpt-5-mini`.',
    'settings.enterNewOpenAiKey': 'Enter a new OpenAI API key',
    'settings.enterOpenAiKey': 'Enter your OpenAI API key',
    'settings.readyForVoiceTyping': 'Ready for voice typing',
    'settings.openAiReady': 'OpenAI beta is ready for voice typing',
    'settings.openSetupGuide': 'Open setup guide',
    'settings.macosPath': ({ section }) =>
      `macOS path: System Settings > Privacy & Security > ${section}`,
    'about.title': 'About',
    'about.body': 'Version details, release status, and desktop update controls.',
    'about.productBody':
      'Voice dictation, PostProcess, and desktop assistant controls for your Mac workflow.',
    'about.version': 'Version',
    'about.updateStatus': 'Update Status',
    'about.lastChecked': 'Last Checked',
    'about.notYet': 'Not yet',
    'about.restartToUpdate': 'Restart to update',
    'about.checkForUpdates': 'Check for updates',
    'about.checking': 'Checking...',
    'about.releaseNotes': 'Release notes',
    'about.repository': 'Repository',
    'about.updateBadge':
      'Packaged builds check the latest GitHub release automatically. When a download finishes, the app shows an Update badge in the sidebar header so you can restart into the new version when it suits you.',
    'about.status.checking': 'Checking for updates...',
    'about.status.downloading': ({ version }) =>
      version ? `${version} is downloading now.` : 'A new update is downloading now.',
    'about.status.ready': ({ version }) =>
      version ? `${version} is ready to install.` : 'An update is ready to install.',
    'about.status.current': 'TIA Voice is up to date.',
    'about.status.unsupported': 'Automatic updates are unavailable in development builds.',
    'about.status.error': 'Unable to check for updates right now.',
    'about.status.idle': 'TIA Voice checks GitHub releases automatically after launch.',
    'onboarding.dialogTitle': 'Setup TIA Voice',
    'onboarding.dialogBody': 'Add your DashScope key, grant permission, and try voice typing.',
    'onboarding.gettingStarted': 'Getting Started',
    'onboarding.step': ({ current, total }) => `Step ${current} of ${total}`,
    'onboarding.skip': 'Skip',
    'onboarding.skipping': 'Skipping…',
    'onboarding.heroBody':
      'Open source voice typing for your desktop, powered by your own DashScope key.',
    'onboarding.dashscopeKey': 'DashScope API key',
    'onboarding.enterDashscopeKey': 'Enter your DashScope API key',
    'onboarding.dashscopeKeyBody':
      'We store your key locally on this device and use it directly for ASR and PostProcess.',
    'onboarding.saveContinue': 'Save and continue',
    'onboarding.saveKey': 'Saving key…',
    'onboarding.accessibilityTitle': 'Allow Accessibility Permission',
    'onboarding.accessibilityBody':
      'TIA Voice needs Accessibility permission for global hotkey listening. We will keep checking while this window stays open.',
    'onboarding.accessibilityGranted': 'Accessibility granted.',
    'onboarding.waitingPermission': 'Waiting for permission...',
    'onboarding.openAccessibility': 'Open Accessibility Settings',
    'onboarding.recheckPermission': 'Re-check permission',
    'onboarding.microphoneTitle': 'Allow Microphone Permission',
    'onboarding.microphoneBody':
      'TIA Voice also needs microphone access before dictation can start.',
    'onboarding.microphoneGranted': 'Microphone granted.',
    'onboarding.requestMic': 'Request Microphone Permission',
    'onboarding.firstDictationTitle': 'Try Your First Dictation',
    'onboarding.firstDictationBody':
      'Say something like “This is the first sentence I spoke using TIA Voice”.',
    'onboarding.currentShortcut': 'Current dictation shortcut:',
    'onboarding.unavailable': 'Unavailable',
    'onboarding.recordingBar': 'The recording bar will appear while you hold it down.',
    'onboarding.practicePlaceholder': 'This is the first sentence I spoke using TIA Voice',
    'common.nextStep': 'Next',
    'onboarding.editWithVoiceTitle': 'Edit Text with Voice',
    'onboarding.editWithVoiceBody':
      'Select the text below and say “Update this part of text into a serious email.”',
    'common.allSet': 'All set',
    'common.saving': 'Saving…',
    'chat.status': 'TIA status',
    'chat.thinkingTitle': 'Interpreting your request',
    'chat.doneTitle': 'Ready to use',
    'chat.errorTitle': 'Something needs attention',
    'chat.idleTitle': 'Waiting for voice input',
    'chat.thinkingBody': 'The ASR and PostProcess pipeline is running.',
    'chat.idleBody': 'Hold the push-to-talk key to start a new voice capture.'
  },
  'zh-CN': {},
  'zh-TW': {}
}

MESSAGES['zh-CN'] = {
  ...MESSAGES.en,
  'app.workspace': '工作区',
  'nav.home': '主页',
  'nav.dictionary': '词典',
  'nav.presets': '预设',
  'nav.settings': '设置',
  'sidebar.desktopAssistant': '桌面助手',
  'sidebar.update': '更新',
  'sidebar.restarting': '正在重启…',
  'sidebar.navigation': '导航',
  'sidebar.permissionsAttention': '权限需要处理',
  'sidebar.warning': '提醒',
  'sidebar.permissionsMissingTitle': '语音输入缺少权限',
  'sidebar.permissionsMissingBody': '打开设置里的权限页，并在 macOS 中启用辅助功能和麦克风。',
  'sidebar.fixPermissions': '修复权限',
  'sidebar.provider': '提供方',
  'sidebar.noApiKey': '还没有保存 API 密钥',
  'sidebar.postProcessPreset': 'PostProcess 预设',
  'sidebar.manageKey': '管理密钥',
  'sidebar.addKey': '添加密钥',
  'home.totalWordsSpoken': '累计说出字数',
  'home.averageWpm': '平均每分钟词数',
  'home.transcriptions': '转写次数',
  'home.transcriptionHistory': '转写历史',
  'home.transcriptionHistoryDetail': ({ historyCount, totalCount }) =>
    `显示最近 ${historyCount} 条，共 ${totalCount} 条转写记录；失败项可直接重试。`,
  'history.retry': '重试',
  'history.retrying': '重试中…',
  'history.status.completed': '已完成',
  'history.status.pending': '处理中',
  'history.status.failed': '失败',
  'common.showAll': '查看全部',
  'settings.title': '设置',
  'settings.description': '配置通用和系统偏好。',
  'settings.general': '通用',
  'settings.providers': '提供方',
  'settings.permissions': '权限',
  'settings.language': '语言',
  'settings.about': '关于',
  'settings.generalTitle': '通用',
  'settings.generalBody': '配置快捷键和输入设备行为。',
  'settings.theme': '主题',
  'settings.shortcuts': '快捷键',
  'settings.microphone': '麦克风',
  'settings.systemDefaultMic': '系统默认麦克风',
  'settings.saving': '保存中…',
  'settings.permissionsTitle': '权限',
  'settings.permissionsBody': '每次应用窗口重新激活时，TIA Voice 都会重新检查这些权限。',
  'settings.languageTitle': '语言',
  'settings.languageBody': '选择 TIA Voice 在整个应用中的显示语言。',
  'settings.languageCurrent': ({ language }) => `当前应用语言：${language}`,
  'settings.languageResolved': ({ language }) => `当前系统默认语言会解析为 ${language}。`,
  'settings.languageDirect': '当前整个应用都在使用这门语言。',
  'settings.languageSystem': '跟随系统',
  'settings.languageSystemDetail': '遵循 macOS 首选语言；若不受支持则回退到英文。',
  'settings.languageEnglish': 'English',
  'settings.languageSimplified': '简体中文',
  'settings.languageTraditional': '繁體中文',
  'settings.active': '当前',
  'settings.usingNow': '正在使用',
  'about.title': '关于',
  'about.body': '版本信息、发布状态和桌面更新控制。',
  'about.version': '版本',
  'about.updateStatus': '更新状态',
  'about.lastChecked': '上次检查',
  'about.notYet': '尚未检查',
  'about.restartToUpdate': '重启更新',
  'about.checkForUpdates': '检查更新',
  'about.checking': '检查中...',
  'about.releaseNotes': '发行说明',
  'about.repository': '仓库',
  'onboarding.dialogTitle': '设置 TIA Voice',
  'onboarding.dialogBody': '添加 DashScope 密钥、授予权限并试用语音输入。',
  'onboarding.gettingStarted': '快速开始',
  'onboarding.skip': '跳过',
  'onboarding.skipping': '跳过中…',
  'common.previous': '上一步',
  'common.next': '下一步',
  'common.nextStep': '下一步',
  'common.allSet': '完成',
  'common.saving': '保存中…',
  'chat.status': 'TIA 状态',
  'chat.thinkingTitle': '正在理解你的请求',
  'chat.doneTitle': '可以使用了',
  'chat.errorTitle': '需要处理一些问题',
  'chat.idleTitle': '等待语音输入'
}

MESSAGES['zh-TW'] = {
  ...MESSAGES.en,
  'app.workspace': '工作區',
  'nav.home': '首頁',
  'nav.dictionary': '詞典',
  'nav.presets': '預設',
  'nav.settings': '設定',
  'sidebar.desktopAssistant': '桌面助理',
  'sidebar.update': '更新',
  'sidebar.restarting': '重新啟動中…',
  'sidebar.navigation': '導覽',
  'sidebar.permissionsAttention': '權限需要處理',
  'sidebar.warning': '提醒',
  'sidebar.permissionsMissingTitle': '語音輸入缺少權限',
  'sidebar.permissionsMissingBody': '打開設定中的權限頁，並在 macOS 內開啟輔助使用與麥克風。',
  'sidebar.fixPermissions': '修復權限',
  'sidebar.provider': '供應方',
  'sidebar.noApiKey': '尚未儲存 API 金鑰',
  'sidebar.postProcessPreset': 'PostProcess 預設',
  'sidebar.manageKey': '管理金鑰',
  'sidebar.addKey': '加入金鑰',
  'home.totalWordsSpoken': '累計說出字數',
  'home.averageWpm': '平均每分鐘詞數',
  'home.transcriptions': '轉寫次數',
  'home.transcriptionHistory': '轉寫歷史',
  'home.transcriptionHistoryDetail': ({ historyCount, totalCount }) =>
    `顯示最近 ${historyCount} 筆，共 ${totalCount} 筆轉寫紀錄；失敗項目可直接重試。`,
  'history.retry': '重試',
  'history.retrying': '重試中…',
  'history.status.completed': '已完成',
  'history.status.pending': '處理中',
  'history.status.failed': '失敗',
  'common.showAll': '查看全部',
  'settings.title': '設定',
  'settings.description': '設定一般與系統偏好。',
  'settings.general': '一般',
  'settings.providers': '供應方',
  'settings.permissions': '權限',
  'settings.language': '語言',
  'settings.about': '關於',
  'settings.generalTitle': '一般',
  'settings.generalBody': '設定快捷鍵與輸入裝置行為。',
  'settings.theme': '主題',
  'settings.shortcuts': '快捷鍵',
  'settings.microphone': '麥克風',
  'settings.systemDefaultMic': '系統預設麥克風',
  'settings.saving': '儲存中…',
  'settings.permissionsTitle': '權限',
  'settings.permissionsBody': '每次 app 視窗重新啟用時，TIA Voice 都會重新檢查這些權限。',
  'settings.languageTitle': '語言',
  'settings.languageBody': '選擇 TIA Voice 在整個應用中的顯示語言。',
  'settings.languageCurrent': ({ language }) => `目前 app 語言：${language}`,
  'settings.languageResolved': ({ language }) => `目前系統預設語言會解析成 ${language}。`,
  'settings.languageDirect': '目前整個應用都在使用這門語言。',
  'settings.languageSystem': '跟隨系統',
  'settings.languageSystemDetail': '遵循 macOS 偏好語言；若不支援則回退到英文。',
  'settings.languageEnglish': 'English',
  'settings.languageSimplified': '簡體中文',
  'settings.languageTraditional': '繁體中文',
  'settings.active': '目前',
  'settings.usingNow': '正在使用',
  'about.title': '關於',
  'about.body': '版本資訊、發佈狀態與桌面更新控制。',
  'about.version': '版本',
  'about.updateStatus': '更新狀態',
  'about.lastChecked': '上次檢查',
  'about.notYet': '尚未檢查',
  'about.restartToUpdate': '重新啟動更新',
  'about.checkForUpdates': '檢查更新',
  'about.checking': '檢查中...',
  'about.releaseNotes': '版本說明',
  'about.repository': '儲存庫',
  'onboarding.dialogTitle': '設定 TIA Voice',
  'onboarding.dialogBody': '加入 DashScope 金鑰、授予權限並試用語音輸入。',
  'onboarding.gettingStarted': '快速開始',
  'onboarding.skip': '略過',
  'onboarding.skipping': '略過中…',
  'common.previous': '上一步',
  'common.next': '下一步',
  'common.nextStep': '下一步',
  'common.allSet': '完成',
  'common.saving': '儲存中…',
  'chat.status': 'TIA 狀態',
  'chat.thinkingTitle': '正在理解你的請求',
  'chat.doneTitle': '可以使用了',
  'chat.errorTitle': '有些地方需要注意',
  'chat.idleTitle': '等待語音輸入'
}

type I18nValue = {
  language: AppLanguage
  locale: string
  t: (key: string, params?: TranslationParams) => string
  formatNumber: (value: number) => string
  formatDateTime: (value: number | Date, options?: Intl.DateTimeFormatOptions) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider(props: {
  language: AppLanguage
  children: React.ReactNode
}): React.JSX.Element {
  const { language, children } = props

  const value = useMemo<I18nValue>(() => {
    const locale = getIntlLocale(language)
    const messages = MESSAGES[language]
    const fallback = MESSAGES.en

    return {
      language,
      locale,
      t: (key, params = {}) => {
        const entry = messages[key] ?? fallback[key]
        if (!entry) {
          return key
        }

        return typeof entry === 'function' ? entry(params) : entry
      },
      formatNumber: (value) => new Intl.NumberFormat(locale).format(value),
      formatDateTime: (value, options) => new Intl.DateTimeFormat(locale, options).format(value)
    }
  }, [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) {
    throw new Error('useI18n must be used inside I18nProvider.')
  }

  return value
}
