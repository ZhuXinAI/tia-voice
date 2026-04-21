import { useEffect, useState } from 'react'

import { WaveformCanvas } from '../components/WaveformCanvas'
import {
  reportRecordingFailure,
  submitRecordingArtifact,
  subscribeToRecordingCommand
} from '../lib/ipc'
import { useMicrophoneRecorder } from '../recording/useMicrophoneRecorder'

export default function RecordingBarWindow(): React.JSX.Element {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'processing'>('idle')
  const recorder = useMicrophoneRecorder({
    onComplete: async (artifact) => {
      await submitRecordingArtifact(artifact)
    }
  })

  useEffect(() => {
    return subscribeToRecordingCommand((command) => {
      if (command.type === 'start') {
        void recorder.start(command.deviceId)
        return
      }

      void recorder.stop()
    })
  }, [recorder])

  useEffect(() => {
    if (recorder.status === 'recording') {
      setPhase('recording')
      return
    }

    if (recorder.status === 'stopping') {
      setPhase('processing')
      return
    }

    setPhase('idle')
  }, [recorder.status])

  useEffect(() => {
    if (recorder.status === 'error' && recorder.error) {
      void reportRecordingFailure(recorder.error)
    }
  }, [recorder.error, recorder.status])

  return (
    <div className="window recording-bar-window" data-testid="recording-bar-window">
      <div className="recording-pill recording-pill--minimal">
        <div className="recording-hud">
          <span
            className={`recording-indicator recording-indicator--${phase}`}
            aria-hidden="true"
          />
          {phase === 'processing' ? (
            <div className="recording-loader" aria-label="Processing audio">
              <span className="recording-loader__spinner" />
            </div>
          ) : (
            <WaveformCanvas stream={phase === 'recording' ? recorder.stream : null} />
          )}
        </div>
      </div>
    </div>
  )
}
