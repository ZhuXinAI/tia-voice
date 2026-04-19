import { describe, expect, it } from 'vitest'

import { buildHotkeyHint, getTriggerKeyLabel, resolveStartupTriggerKey } from './triggerKey'

describe('triggerKey helpers', () => {
  it('formats the platform hotkey labels for app hints', () => {
    expect(getTriggerKeyLabel('MetaRight')).toBe('Right Command')
    expect(getTriggerKeyLabel('AltRight')).toBe('Right Alt')
    expect(buildHotkeyHint('MetaRight')).toBe('Hold Right Command to dictate into the current app.')
    expect(buildHotkeyHint('AltRight')).toBe('Hold Right Alt to dictate into the current app.')
  })

  it('prefers the configured hotkey when bootstrapping the listener', () => {
    expect(
      resolveStartupTriggerKey({
        configuredHotkey: 'AltRight',
        fallbackHotkey: 'MetaRight'
      })
    ).toBe('AltRight')
  })
})
