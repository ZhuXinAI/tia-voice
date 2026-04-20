import { checkMicrophonePermission, openPermissionSettings } from './ipc'

export async function probeMicrophoneAccess(): Promise<boolean> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    return false
  }

  let stream: MediaStream | null = null

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    return true
  } catch {
    return false
  } finally {
    stream?.getTracks().forEach((track) => track.stop())
  }
}

export async function requestMicrophonePermission(): Promise<boolean> {
  if (await probeMicrophoneAccess()) {
    return true
  }

  await openPermissionSettings('microphone')
  return checkMicrophonePermission(false)
}
