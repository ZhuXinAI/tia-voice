import type { PermissionStatus } from '../ipc/channels'

type MicrophonePermissionSnapshot = {
  granted: boolean
  status: PermissionStatus
}

export function createMicrophonePermissionState(input: {
  platform: NodeJS.Platform
  getStatus: () => PermissionStatus
  askForAccess: () => Promise<boolean>
}): {
  getSnapshot: () => MicrophonePermissionSnapshot
  check: (prompt: boolean) => Promise<boolean>
  confirmGranted: () => void
} {
  let inferredGranted = false

  const reconcileInferredGrant = (status: PermissionStatus): void => {
    if (status === 'granted') {
      inferredGranted = true
      return
    }

    if (status !== 'not-determined') {
      inferredGranted = false
    }
  }

  const getSnapshot = (): MicrophonePermissionSnapshot => {
    if (input.platform !== 'darwin') {
      return {
        granted: true,
        status: 'granted'
      }
    }

    const nativeStatus = input.getStatus()
    reconcileInferredGrant(nativeStatus)

    const granted =
      nativeStatus === 'granted' || (nativeStatus === 'not-determined' && inferredGranted)
    return {
      granted,
      status: granted ? 'granted' : nativeStatus
    }
  }

  return {
    getSnapshot,
    async check(prompt) {
      const snapshot = getSnapshot()
      if (snapshot.granted || input.platform !== 'darwin') {
        return true
      }

      if (!prompt || snapshot.status !== 'not-determined') {
        return false
      }

      const grantedAfterPrompt = await input.askForAccess()
      if (grantedAfterPrompt) {
        inferredGranted = true
      }

      return grantedAfterPrompt
    },
    confirmGranted() {
      if (input.platform === 'darwin') {
        inferredGranted = true
      }
    }
  }
}
