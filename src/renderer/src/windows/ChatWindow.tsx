import { useEffect, useState } from 'react'
import { useI18n } from '@renderer/i18n'
import { ThinkingIndicator } from '../components/ThinkingIndicator'
import { getChatState, subscribeToChatState } from '../lib/ipc'
import type { TiaChatState } from '../../../preload/index'

export default function ChatWindow(): React.JSX.Element {
  const [state, setState] = useState<TiaChatState>({ phase: 'idle' })
  const { t } = useI18n()

  useEffect(() => {
    void getChatState().then(setState)
    return subscribeToChatState(setState)
  }, [])

  return (
    <aside className="chat-window" data-testid="chat-window">
      <ThinkingIndicator phase={state.phase} />
      <div className="chat-window__body">
        <p className="chat-window__label">{t('chat.status')}</p>
        <h2>
          {state.phase === 'thinking'
            ? t('chat.thinkingTitle')
            : state.phase === 'done'
              ? t('chat.doneTitle')
              : state.phase === 'error'
                ? t('chat.errorTitle')
                : t('chat.idleTitle')}
        </h2>
        <p className="chat-window__text">
          {state.detail ??
            state.text ??
            (state.phase === 'thinking' ? t('chat.thinkingBody') : t('chat.idleBody'))}
        </p>
      </div>
    </aside>
  )
}
