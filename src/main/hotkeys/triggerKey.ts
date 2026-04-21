import type { TriggerKey } from '../config/env'

export function getTriggerKeyLabel(triggerKey: TriggerKey): string {
  if (triggerKey === 'MetaRight') {
    return 'Right Command'
  }

  if (triggerKey === 'ControlRight') {
    return 'Right Control'
  }

  return 'Right Alt'
}

export function buildHotkeyHint(triggerKey: TriggerKey): string {
  return `Hold ${getTriggerKeyLabel(triggerKey)} to dictate into the current app.`
}

export function resolveStartupTriggerKey(input: {
  configuredHotkey?: TriggerKey | null
  fallbackHotkey: TriggerKey
}): TriggerKey {
  return input.configuredHotkey ?? input.fallbackHotkey
}
