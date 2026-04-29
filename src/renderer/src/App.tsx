import { useEffect } from 'react'
import { I18nProvider } from './i18n'
import { getNavigatorPreferredLocales, resolveAppLanguage } from '../../shared/i18n/config'

import MainAppWindow from './windows/MainAppWindow'
import ChatWindow from './windows/ChatWindow'
import RecordingBarWindow from './windows/RecordingBarWindow'
import QuestionBarWindow from './windows/QuestionBarWindow'
import TtsPlayerWindow from './windows/TtsPlayerWindow'
import { getWindowRoleFromLocation, type WindowRole } from './lib/windowRole'

export default function App(props: { initialWindowRole?: WindowRole }): React.JSX.Element {
  const role = props.initialWindowRole ?? getWindowRoleFromLocation()
  const fallbackLanguage = resolveAppLanguage('system', getNavigatorPreferredLocales())

  useEffect(() => {
    document.body.dataset.windowRole = role
    return () => {
      delete document.body.dataset.windowRole
    }
  }, [role])

  if (role === 'recording-bar') {
    return (
      <I18nProvider language={fallbackLanguage}>
        <RecordingBarWindow />
      </I18nProvider>
    )
  }

  if (role === 'question-bar') {
    return (
      <I18nProvider language={fallbackLanguage}>
        <QuestionBarWindow />
      </I18nProvider>
    )
  }

  if (role === 'chat') {
    return (
      <I18nProvider language={fallbackLanguage}>
        <ChatWindow />
      </I18nProvider>
    )
  }

  if (role === 'tts-player') {
    return (
      <I18nProvider language={fallbackLanguage}>
        <TtsPlayerWindow />
      </I18nProvider>
    )
  }

  return (
    <I18nProvider language={fallbackLanguage}>
      <MainAppWindow />
    </I18nProvider>
  )
}
