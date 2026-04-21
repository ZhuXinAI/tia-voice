import type { ActionExecutor } from './ActionExecutor'

type NutKey = number

type NutClipboard = {
  setContent(text: string): Promise<void>
  getContent?(): Promise<string>
}

type NutKeyboard = {
  pressKey(...keys: NutKey[]): Promise<unknown>
  releaseKey(...keys: NutKey[]): Promise<unknown>
}

export function createNutPasteExecutor(input: {
  platform: NodeJS.Platform
  clipboard?: NutClipboard
  keyboard?: NutKeyboard
}): ActionExecutor {
  return {
    async execute(action) {
      const nut = input.clipboard && input.keyboard ? null : await import('@nut-tree-fork/nut-js')
      const clipboard = input.clipboard ?? nut!.clipboard
      const keyboard = input.keyboard ?? nut!.keyboard
      const modifier = input.platform === 'darwin' ? nut?.Key.LeftSuper ?? 105 : nut?.Key.LeftControl ?? 104
      const vKey = nut?.Key.V ?? 91
      const previousClipboardContent =
        typeof clipboard.getContent === 'function' ? await clipboard.getContent() : null

      await clipboard.setContent(action.text)

      try {
        await keyboard.pressKey(modifier, vKey)
        await keyboard.releaseKey(modifier, vKey)
      } finally {
        if (previousClipboardContent !== null) {
          await clipboard.setContent(previousClipboardContent)
        }
      }
    }
  }
}
