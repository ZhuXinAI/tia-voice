import { useEffect, useMemo } from 'react'

import {
  useMeetingCapture,
  type MeetingTranscriptPreviewItem,
  type MeetingStreamId
} from '../meeting/useMeetingCapture'
import { MeetingStatusPanel } from './meeting/MeetingStatusPanel'
import { MeetingTranscriptList } from './meeting/MeetingTranscriptList'

type MeetingCaptureCommand =
  | {
      type: 'start'
      deviceId?: string | null
    }
  | {
      type: 'stop'
    }
  | {
      type: 'state'
      transcriptItems?: MeetingTranscriptPreviewItem[]
    }
  | {
      type: 'error'
      detail: string
    }

type MeetingCaptureBridge = {
  onMeetingCommand?: (listener: (command: MeetingCaptureCommand) => void) => () => void
  sendMeetingPcmChunk?: (input: {
    streamId: MeetingStreamId
    chunk: Uint8Array
    capturedAt: number
  }) => Promise<void>
  submitMeetingMixedAudio?: (artifact: {
    mimeType: string
    buffer: Uint8Array
    durationMs: number
    sizeBytes?: number
  }) => Promise<void>
  requestFinishMeeting?: () => Promise<void>
  reportMeetingCaptureFailure?: (detail: string) => Promise<void>
}

function getMeetingBridge(): MeetingCaptureBridge {
  return (window.api ?? {}) as typeof window.api & MeetingCaptureBridge
}

export default function MeetingCaptureWindow(): React.JSX.Element {
  const bridge = useMemo(() => getMeetingBridge(), [])
  const capture = useMeetingCapture({
    sendPcmChunk: (input) => bridge.sendMeetingPcmChunk?.(input),
    submitMixedAudio: (artifact) => bridge.submitMeetingMixedAudio?.(artifact),
    reportFailure: (detail) => bridge.reportMeetingCaptureFailure?.(detail)
  })
  const { fail, setTranscriptItems, start, stop } = capture

  useEffect(() => {
    return bridge.onMeetingCommand?.((command) => {
      if (command.type === 'start') {
        void start({ deviceId: command.deviceId ?? null })
        return
      }

      if (command.type === 'stop') {
        void stop()
        return
      }

      if (command.type === 'state') {
        setTranscriptItems(command.transcriptItems ?? [])
        return
      }

      void fail(command.detail)
    })
  }, [bridge, fail, setTranscriptItems, start, stop])

  const handleStop = async (): Promise<void> => {
    if (bridge.requestFinishMeeting) {
      await bridge.requestFinishMeeting()
      return
    }

    await stop()
  }

  return (
    <div className="window meeting-capture-window" data-testid="meeting-capture-window">
      <div className="meeting-capture-shell">
        <MeetingStatusPanel
          status={capture.status}
          durationMs={capture.durationMs}
          streams={capture.streams}
          error={capture.error}
          onStop={() => void handleStop()}
        />
        <MeetingTranscriptList items={capture.transcriptItems} />
      </div>
    </div>
  )
}
