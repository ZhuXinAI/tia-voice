import type { TriggerKey } from '../config/env'

export const triggerKeyCodes: Record<TriggerKey, number> = {
  AltRight: 3640,
  ControlRight: 3613,
  MetaRight: 3676
}

export const keyboardKeyCodes = {
  ControlLeft: 29,
  ControlRight: 3613,
  KeyT: 20,
  MacVirtualKeyT: 17
} as const

type KeyboardEventLike = {
  keycode: number
  ctrlKey?: boolean
}

type KeyboardEventPhase = 'keydown' | 'keyup'

export type NormalizedKeyboardEvent = KeyboardEventLike & {
  ctrlKey: boolean
  rawCtrlKey: boolean
  trackedCtrlKey: boolean
  phase: KeyboardEventPhase
}

type HookLike = {
  on(event: 'keydown' | 'keyup', listener: (event: KeyboardEventLike) => void): void
  start(): void
  stop(): void
  removeListener?: (
    event: 'keydown' | 'keyup',
    listener: (event: KeyboardEventLike) => void
  ) => void
}

type HotkeyBinding = {
  id: string
  matchesStart(event: NormalizedKeyboardEvent): boolean
  matchesStop(event: NormalizedKeyboardEvent): boolean
  onStart: () => void | Promise<void>
  onStop: () => void | Promise<void>
}

type KeyboardHotkeyService = {
  start(): void
  stop(): void
  handleKeyDown(event: KeyboardEventLike): Promise<void>
  handleKeyUp(event: KeyboardEventLike): Promise<void>
}

function isControlKeycode(keycode: number): boolean {
  return keycode === keyboardKeyCodes.ControlLeft || keycode === keyboardKeyCodes.ControlRight
}

function isQuestionKeycode(keycode: number): boolean {
  return keycode === keyboardKeyCodes.KeyT || keycode === keyboardKeyCodes.MacVirtualKeyT
}

export function createKeyboardHotkeyService(input: {
  hook: HookLike
  bindings: HotkeyBinding[]
  onEvent?: (event: NormalizedKeyboardEvent) => void
}): KeyboardHotkeyService {
  const activeBindings = new Set<string>()
  const pressedKeycodes = new Set<number>()

  const normalizeEvent = (
    event: KeyboardEventLike,
    phase: KeyboardEventPhase
  ): NormalizedKeyboardEvent => {
    const trackedCtrlKey =
      pressedKeycodes.has(keyboardKeyCodes.ControlLeft) ||
      pressedKeycodes.has(keyboardKeyCodes.ControlRight)

    return {
      ...event,
      ctrlKey: event.ctrlKey === true || trackedCtrlKey,
      rawCtrlKey: event.ctrlKey === true,
      trackedCtrlKey,
      phase
    }
  }

  const handleKeyDown = async (event: KeyboardEventLike): Promise<void> => {
    pressedKeycodes.add(event.keycode)
    const normalizedEvent = normalizeEvent(event, 'keydown')
    input.onEvent?.(normalizedEvent)

    for (const binding of input.bindings) {
      if (activeBindings.has(binding.id) || !binding.matchesStart(normalizedEvent)) {
        continue
      }

      activeBindings.add(binding.id)
      await binding.onStart()
    }
  }

  const handleKeyUp = async (event: KeyboardEventLike): Promise<void> => {
    const normalizedEvent = normalizeEvent(event, 'keyup')
    input.onEvent?.(normalizedEvent)

    for (const binding of input.bindings) {
      if (!activeBindings.has(binding.id) || !binding.matchesStop(normalizedEvent)) {
        continue
      }

      activeBindings.delete(binding.id)
      await binding.onStop()
    }

    pressedKeycodes.delete(event.keycode)
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
      activeBindings.clear()
      pressedKeycodes.clear()
      input.hook.stop()
    },
    handleKeyDown,
    handleKeyUp
  }
}

export function createGlobalHotkeyService(input: {
  triggerKey: TriggerKey
  hook: HookLike
  onStart: () => void | Promise<void>
  onStop: () => void | Promise<void>
}): KeyboardHotkeyService {
  const keycode = triggerKeyCodes[input.triggerKey]

  return createKeyboardHotkeyService({
    hook: input.hook,
    bindings: [
      {
        id: input.triggerKey,
        matchesStart: (event) => event.keycode === keycode,
        matchesStop: (event) => event.keycode === keycode,
        onStart: input.onStart,
        onStop: input.onStop
      }
    ]
  })
}

export function createAppHotkeyService(input: {
  triggerKey: TriggerKey
  hook: HookLike
  onDictationStart: () => void | Promise<void>
  onDictationStop: () => void | Promise<void>
  onQuestionStart: () => void | Promise<void>
  onQuestionStop: () => void | Promise<void>
  onQuestionKeyEvent?: (event: NormalizedKeyboardEvent) => void
}): KeyboardHotkeyService {
  const dictationKeycode = triggerKeyCodes[input.triggerKey]
  const questionStopKeycodes = new Set<number>([
    keyboardKeyCodes.KeyT,
    keyboardKeyCodes.MacVirtualKeyT,
    keyboardKeyCodes.ControlLeft,
    keyboardKeyCodes.ControlRight
  ])

  return createKeyboardHotkeyService({
    hook: input.hook,
    bindings: [
      {
        id: 'dictation',
        matchesStart: (event) => event.keycode === dictationKeycode,
        matchesStop: (event) => event.keycode === dictationKeycode,
        onStart: input.onDictationStart,
        onStop: input.onDictationStop
      },
      {
        id: 'question',
        matchesStart: (event) => isQuestionKeycode(event.keycode) && event.ctrlKey === true,
        matchesStop: (event) => questionStopKeycodes.has(event.keycode),
        onStart: input.onQuestionStart,
        onStop: input.onQuestionStop
      }
    ],
    onEvent: (event) => {
      if (isQuestionKeycode(event.keycode) || isControlKeycode(event.keycode) || event.ctrlKey) {
        input.onQuestionKeyEvent?.(event)
      }
    }
  })
}
