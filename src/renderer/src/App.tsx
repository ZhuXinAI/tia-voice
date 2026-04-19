import { useEffect } from 'react'

import MainAppWindow from './windows/MainAppWindow'
import ChatWindow from './windows/ChatWindow'
import RecordingBarWindow from './windows/RecordingBarWindow'
import { getWindowRoleFromLocation, type WindowRole } from './lib/windowRole'

export default function App(props: { initialWindowRole?: WindowRole }): React.JSX.Element {
  const role = props.initialWindowRole ?? getWindowRoleFromLocation()

  useEffect(() => {
    document.body.dataset.windowRole = role
    return () => {
      delete document.body.dataset.windowRole
    }
  }, [role])

  if (role === 'recording-bar') {
    return <RecordingBarWindow />
  }

  if (role === 'chat') {
    return <ChatWindow />
  }

  return <MainAppWindow />
}
