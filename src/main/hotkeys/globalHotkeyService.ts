import type { TriggerKey } from '../config/env'

export const triggerKeyCodes: Record<TriggerKey, number> = {
  AltRight: 3640,
  ControlRight: 3613,
  MetaRight: 3676
}

type KeyboardEventLike = { keycode: number }

type HookLike = {
  on(event: 'keydown' | 'keyup', listener: (event: KeyboardEventLike) => void): void
  start(): void
  stop(): void
  removeListener?: (event: 'keydown' | 'keyup', listener: (event: KeyboardEventLike) => void) => void
}

export function createGlobalHotkeyService(input: {
  triggerKey: TriggerKey
  hook: HookLike
  onStart: () => void | Promise<void>
  onStop: () => void | Promise<void>
}) {
  let active = false

  const keycode = triggerKeyCodes[input.triggerKey]
  const handleKeyDown = async (event: KeyboardEventLike) => {
    if (event.keycode !== keycode || active) {
      return
    }

    active = true
    await input.onStart()
  }

  const handleKeyUp = async (event: KeyboardEventLike) => {
    if (event.keycode !== keycode || !active) {
      return
    }

    active = false
    await input.onStop()
  }

  return {
    start() {
      input.hook.on('keydown', handleKeyDown)
      input.hook.on('keyup', handleKeyUp)
      input.hook.start()
    },
    stop() {
      input.hook.removeListener?.('keydown', handleKeyDown)
      input.hook.removeListener?.('keyup', handleKeyUp)
      input.hook.stop()
    },
    handleKeyDown,
    handleKeyUp
  }
}
