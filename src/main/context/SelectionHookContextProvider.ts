import type {
  SelectionHookConstructor,
  SelectionHookInstance,
  TextSelectionData
} from 'selection-hook'

import type { ContextProvider } from './ContextProvider'
import type { ContextSnapshot } from './types'

type SelectionHookRuntime = Pick<
  SelectionHookInstance,
  'cleanup' | 'getCurrentSelection' | 'isRunning' | 'start' | 'stop'
> &
  Partial<Pick<SelectionHookInstance, 'macIsProcessTrusted' | 'macRequestProcessTrust'>>

function normalizeSelectedText(text: string | undefined): string | null {
  if (!text) {
    return null
  }

  const normalized = text.trim()
  return normalized.length > 0 ? normalized : null
}

function createRuntimeSelectionHook(): SelectionHookRuntime {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SelectionHook: SelectionHookConstructor = require('selection-hook')
  return new SelectionHook()
}

export function createSelectionHookContextProvider(input?: {
  platform?: NodeJS.Platform
  createHook?: () => SelectionHookRuntime
  now?: () => number
}): ContextProvider {
  const platform = input?.platform ?? process.platform
  const now = input?.now ?? Date.now
  const hook = input?.createHook ? input.createHook() : createRuntimeSelectionHook()

  let hasRequestedMacTrust = false

  const buildSnapshot = (selection: TextSelectionData | null): ContextSnapshot => {
    const selectedText = normalizeSelectedText(selection?.text)

    return {
      isInputFocused: selectedText ? true : null,
      selectedText,
      provider: 'selection-hook' as const,
      capturedAt: now()
    }
  }

  const ensureHookStarted = (): boolean => {
    if (hook.isRunning()) {
      return true
    }

    if (platform === 'darwin') {
      try {
        const isTrusted = hook.macIsProcessTrusted?.()
        if (isTrusted === false && !hasRequestedMacTrust) {
          hasRequestedMacTrust = true
          hook.macRequestProcessTrust?.()
        }
      } catch (error) {
        console.error('[context] Failed while checking macOS accessibility trust.', error)
      }
    }

    try {
      return hook.start({
        selectionPassiveMode: true,
        enableMouseMoveEvent: false
      })
    } catch (error) {
      console.error('[context] Failed to start selection-hook provider.', error)
      return false
    }
  }

  return {
    async captureSnapshot() {
      if (!ensureHookStarted() || !hook.isRunning()) {
        return buildSnapshot(null)
      }

      try {
        return buildSnapshot(hook.getCurrentSelection())
      } catch (error) {
        console.error('[context] Failed to capture selection snapshot.', error)
        return buildSnapshot(null)
      }
    },
    cleanup() {
      try {
        hook.stop()
      } catch (error) {
        console.error('[context] Failed to stop selection-hook provider.', error)
      }

      try {
        hook.cleanup()
      } catch (error) {
        console.error('[context] Failed to cleanup selection-hook provider.', error)
      }
    }
  }
}
