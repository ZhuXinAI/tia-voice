export type WindowRole =
  | 'main-app'
  | 'recording-bar'
  | 'meeting-capture'
  | 'live-caption-config'
  | 'live-caption-overlay'
  | 'question-bar'
  | 'chat'
  | 'tts-player'

export function getWindowRoleFromLocation(search = window.location.search): WindowRole {
  const params = new URLSearchParams(search)
  const role = params.get('window')

  if (
    role === 'recording-bar' ||
    role === 'meeting-capture' ||
    role === 'live-caption-config' ||
    role === 'live-caption-overlay' ||
    role === 'question-bar' ||
    role === 'chat' ||
    role === 'tts-player' ||
    role === 'main-app'
  ) {
    return role
  }

  return 'main-app'
}
