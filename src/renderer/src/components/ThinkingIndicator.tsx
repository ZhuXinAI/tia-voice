export function ThinkingIndicator(props: {
  phase: 'idle' | 'thinking' | 'done' | 'error'
}): React.JSX.Element {
  const label =
    props.phase === 'thinking'
      ? 'Thinking'
      : props.phase === 'done'
        ? 'Ready'
        : props.phase === 'error'
          ? 'Error'
          : 'Waiting'

  return (
    <div className={`thinking-indicator thinking-indicator--${props.phase}`} aria-live="polite">
      <span className="thinking-indicator__dot" />
      <span>{label}</span>
    </div>
  )
}
