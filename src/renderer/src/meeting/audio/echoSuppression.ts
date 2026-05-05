export type EchoSuppressionState = {
  lastSystemAt: number | null
  lastSystemRms: number
}

const SYSTEM_ACTIVITY_WINDOW_MS = 250
const SYSTEM_RMS_FLOOR = 0.015
const MICROPHONE_SPEECH_FLOOR = 0.035
const MICROPHONE_BLEED_RATIO = 0.28

export function createEchoSuppressionState(): EchoSuppressionState {
  return {
    lastSystemAt: null,
    lastSystemRms: 0
  }
}

export function calculateRms(channels: Float32Array[]): number {
  let sum = 0
  let sampleCount = 0

  for (const channel of channels) {
    for (const sample of channel) {
      sum += sample * sample
      sampleCount += 1
    }
  }

  return sampleCount === 0 ? 0 : Math.sqrt(sum / sampleCount)
}

export function shouldSuppressMicrophoneEcho(input: {
  capturedAt: number
  microphoneRms: number
  state: EchoSuppressionState
}): boolean {
  if (input.state.lastSystemAt === null) {
    return false
  }

  if (input.capturedAt - input.state.lastSystemAt > SYSTEM_ACTIVITY_WINDOW_MS) {
    return false
  }

  if (input.state.lastSystemRms < SYSTEM_RMS_FLOOR) {
    return false
  }

  return (
    input.microphoneRms <
    Math.max(MICROPHONE_SPEECH_FLOOR, input.state.lastSystemRms * MICROPHONE_BLEED_RATIO)
  )
}
