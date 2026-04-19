import { describe, expect, it } from 'vitest'

import { createEphemeralSessionStore } from './ephemeralSessionStore'

describe('createEphemeralSessionStore', () => {
  it('stores and clears the current session', () => {
    const store = createEphemeralSessionStore()
    const session = store.begin({
      isInputFocused: null,
      selectedText: null,
      provider: 'noop',
      capturedAt: 123
    })

    expect(store.getCurrent()).toEqual(session)

    store.clear()
    expect(store.getCurrent()).toBeNull()
  })
})
