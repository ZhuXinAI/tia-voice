import { describe, expect, it } from 'vitest'

import { createRecorderState } from './useMicrophoneRecorder'

describe('createRecorderState', () => {
  it('transitions from idle to recording to completed', () => {
    const state = createRecorderState()
    state.start()
    state.stop()
    expect(state.status()).toBe('completed')
  })
})
