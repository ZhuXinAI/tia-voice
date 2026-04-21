import { useCallback, useEffect, useState } from 'react'

export type AudioInputOption = {
  deviceId: string | null
  label: string
}

function formatDeviceLabel(device: MediaDeviceInfo, index: number): string {
  const trimmedLabel = device.label.trim()
  if (trimmedLabel) {
    return trimmedLabel
  }

  return `Microphone ${index + 1}`
}

function buildAudioInputOptions(devices: MediaDeviceInfo[]): AudioInputOption[] {
  const audioInputs = devices
    .filter((device) => device.kind === 'audioinput')
    .map((device, index) => ({
      deviceId: device.deviceId || null,
      label: formatDeviceLabel(device, index)
    }))

  return [{ deviceId: null, label: 'System default microphone' }, ...audioInputs]
}

export function useAudioInputs() {
  const [audioInputs, setAudioInputs] = useState<AudioInputOption[]>([
    {
      deviceId: null,
      label: 'System default microphone'
    }
  ])

  const refreshAudioInputs = useCallback(async (): Promise<void> => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.enumerateDevices !== 'function'
    ) {
      return
    }

    const devices = await navigator.mediaDevices.enumerateDevices()
    setAudioInputs(buildAudioInputOptions(devices))
  }, [])

  useEffect(() => {
    void refreshAudioInputs()

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.addEventListener !== 'function'
    ) {
      return () => undefined
    }

    const handleDeviceChange = (): void => {
      void refreshAudioInputs()
    }

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
  }, [refreshAudioInputs])

  return {
    audioInputs,
    refreshAudioInputs
  }
}
