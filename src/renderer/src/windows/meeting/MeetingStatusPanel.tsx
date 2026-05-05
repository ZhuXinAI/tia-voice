import { Circle, LoaderCircle, Mic, MonitorSpeaker, Square } from 'lucide-react'
import type React from 'react'

import type {
  MeetingCaptureStatus,
  MeetingStreamHealth,
  MeetingStreamId
} from '../../meeting/useMeetingCapture'

type MeetingStatusPanelProps = {
  status: MeetingCaptureStatus
  durationMs: number
  streams: Record<MeetingStreamId, MeetingStreamHealth>
  error: string | null
  onStop: () => void
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function StreamRow(props: {
  icon: React.ReactNode
  label: string
  health: MeetingStreamHealth
}): React.JSX.Element {
  const active = props.health.active
  return (
    <div className="meeting-stream-row">
      <span className="meeting-stream-row__icon" aria-hidden="true">
        {props.icon}
      </span>
      <span className="meeting-stream-row__label">{props.label}</span>
      <span className={active ? 'meeting-stream-row__dot is-active' : 'meeting-stream-row__dot'} />
    </div>
  )
}

export function MeetingStatusPanel(props: MeetingStatusPanelProps): React.JSX.Element {
  const recording = props.status === 'recording'
  const processing = props.status === 'processing' || props.status === 'starting'

  return (
    <section className="meeting-status-panel" aria-label="Meeting capture status">
      <div className="meeting-status-panel__top">
        <div className="meeting-status-panel__identity">
          <span className={recording ? 'meeting-live-dot is-live' : 'meeting-live-dot'}>
            {processing ? <LoaderCircle aria-hidden="true" /> : <Circle aria-hidden="true" />}
          </span>
          <div>
            <h1>Meeting capture</h1>
            <p>{processing ? 'Preparing audio' : recording ? 'Recording now' : 'Ready'}</p>
          </div>
        </div>
        <strong className="meeting-duration">{formatDuration(props.durationMs)}</strong>
      </div>

      <div className="meeting-streams">
        <StreamRow icon={<Mic />} label="You" health={props.streams.microphone} />
        <StreamRow icon={<MonitorSpeaker />} label="Others" health={props.streams.system} />
      </div>

      {props.error ? <p className="meeting-error">{props.error}</p> : null}

      <button
        className="meeting-stop-button"
        type="button"
        onClick={props.onStop}
        disabled={!recording}
        aria-label="Stop meeting capture"
      >
        <Square aria-hidden="true" />
        <span>Stop</span>
      </button>
    </section>
  )
}
