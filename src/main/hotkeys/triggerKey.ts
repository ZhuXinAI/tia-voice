import type { TriggerKey } from '../config/env'

export function getTriggerKeyLabel(triggerKey: TriggerKey): string {
  return triggerKey === 'MetaRight' ? 'Right Command' : 'Right Alt'
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
