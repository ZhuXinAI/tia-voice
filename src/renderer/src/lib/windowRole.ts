export type WindowRole = 'main-app' | 'recording-bar' | 'chat' | 'selection-toolbar' | 'tts-player'

export function getWindowRoleFromLocation(search = window.location.search): WindowRole {
  const params = new URLSearchParams(search)
  const role = params.get('window')

  if (
    role === 'recording-bar' ||
    role === 'chat' ||
    role === 'selection-toolbar' ||
    role === 'tts-player' ||
    role === 'main-app'
  ) {
    return role
  }

  return 'main-app'
}
