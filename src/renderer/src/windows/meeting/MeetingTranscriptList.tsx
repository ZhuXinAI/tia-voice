import type { MeetingTranscriptPreviewItem } from '../../meeting/useMeetingCapture'

type MeetingTranscriptListProps = {
  items: MeetingTranscriptPreviewItem[]
}

export function MeetingTranscriptList(props: MeetingTranscriptListProps): React.JSX.Element {
  return (
    <section className="meeting-transcript-panel" aria-label="Meeting transcript">
      <div className="meeting-transcript-panel__header">
        <h2>Transcript</h2>
      </div>
      {props.items.length === 0 ? (
        <p className="meeting-transcript-empty">Waiting for speech...</p>
      ) : (
        <ul className="meeting-transcript-list">
          {props.items.slice(-6).map((item) => (
            <li key={item.id}>
              <span>{item.speaker}</span>
              <p>{item.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
