export function countWords(text: string): number {
  const tokens = text.trim().match(/[\p{L}\p{N}'-]+/gu)
  return tokens?.length ?? 0
}

export function toHumanTime(timestamp: number): string {
  if (!timestamp) {
    return 'Just now'
  }

  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
