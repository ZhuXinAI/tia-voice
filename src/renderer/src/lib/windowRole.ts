export type WindowRole =
  | 'main-app'
  | 'recording-bar'
  | 'question-bar'
  | 'chat'
  | 'tts-player'

export function getWindowRoleFromLocation(search = window.location.search): WindowRole {
  const params = new URLSearchParams(search)
  const role = params.get('window')

  if (
    role === 'recording-bar' ||
    role === 'question-bar' ||
    role === 'chat' ||
    role === 'tts-player' ||
    role === 'main-app'
  ) {
    return role
  }

  return 'main-app'
}
