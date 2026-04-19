import { describe, expect, it } from 'vitest'

import { routeIntent } from './intentRouter'

describe('routeIntent', () => {
  it('maps focused selection to selection-aware mode', () => {
    const result = routeIntent({
      isInputFocused: true,
      selectedText: 'draft',
      provider: 'noop',
      capturedAt: 123
    })

    expect(result.mode).toBe('selection-aware')
  })

  it('maps no focus with selection to answer-query mode', () => {
    const result = routeIntent({
      isInputFocused: false,
      selectedText: 'question',
      provider: 'noop',
      capturedAt: 123
    })

    expect(result.mode).toBe('answer-query')
  })

  it('falls back to generate-text mode without selection', () => {
    const result = routeIntent({
      isInputFocused: true,
      selectedText: null,
      provider: 'noop',
      capturedAt: 123
    })

    expect(result.mode).toBe('generate-text')
  })
})
