import { useEffect, useState } from 'react'
import { ThinkingIndicator } from '../components/ThinkingIndicator'
import { getChatState, subscribeToChatState } from '../lib/ipc'
import type { TiaChatState } from '../../../preload/index'

export default function ChatWindow(): React.JSX.Element {
  const [state, setState] = useState<TiaChatState>({ phase: 'idle' })

  useEffect(() => {
    void getChatState().then(setState)
    return subscribeToChatState(setState)
  }, [])

  return (
    <aside className="chat-window" data-testid="chat-window">
      <ThinkingIndicator phase={state.phase} />
      <div className="chat-window__body">
        <p className="chat-window__label">TIA status</p>
        <h2>
          {state.phase === 'thinking'
            ? 'Interpreting your request'
            : state.phase === 'done'
              ? 'Ready to use'
              : state.phase === 'error'
                ? 'Something needs attention'
                : 'Waiting for voice input'}
        </h2>
        <p className="chat-window__text">
          {state.detail ??
            state.text ??
            (state.phase === 'thinking'
              ? 'The ASR and PostProcess pipeline is running.'
              : 'Hold the push-to-talk key to start a new voice capture.')}
        </p>
      </div>
    </aside>
  )
}
