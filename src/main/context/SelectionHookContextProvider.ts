import type {
  SelectionHookConstructor,
  SelectionHookInstance,
  Point,
  TextSelectionData
} from 'selection-hook'

import { logDebug } from '../logging/debugLogger'
import type { CaptureSelectionOptions, ContextProvider } from './ContextProvider'
import type { ContextSelection, ContextSnapshot, SelectionBounds } from './types'

type SelectionHookRuntime = Pick<
  SelectionHookInstance,
  'cleanup' | 'getCurrentSelection' | 'isRunning' | 'start' | 'stop' | 'on' | 'removeListener'
> &
  Partial<
    Pick<
      SelectionHookInstance,
      | 'macIsProcessTrusted'
      | 'macRequestProcessTrust'
      | 'setGlobalFilterMode'
      | 'setSelectionPassiveMode'
    >
  >

const INVALID_COORDINATE_THRESHOLD = -90000
const SELECTION_PASSIVE_MODE = true
const CHROME_SELECTION_PROGRAM_NAMES = [
  'Google Chrome',
  'Google Chrome.app',
  'Google Chrome Beta',
  'Google Chrome Canary',
  'Google Chrome Dev',
  'Chromium',
  'Chromium.app',
  'Chrome',
  'chrome',
  'chrome.exe',
  'chromium',
  'chromium.exe',
  'chromium-browser'
]

function isValidPoint(point: Point | undefined): point is Point {
  return Boolean(
    point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x > INVALID_COORDINATE_THRESHOLD &&
    point.y > INVALID_COORDINATE_THRESHOLD
  )
}

function hasMeaningfulPoint(points: Point[]): boolean {
  return points.some((point) => point.x !== 0 || point.y !== 0)
}

function extractBounds(selection: TextSelectionData): SelectionBounds | null {
  const fullSelectionPoints = [
    selection.startTop,
    selection.startBottom,
    selection.endTop,
    selection.endBottom
  ].filter(isValidPoint)

  if (fullSelectionPoints.length === 4 && hasMeaningfulPoint(fullSelectionPoints)) {
    return buildBoundsFromPoints(fullSelectionPoints)
  }

  const mousePoints = [selection.mousePosStart, selection.mousePosEnd].filter(isValidPoint)

  return mousePoints.length > 0 && hasMeaningfulPoint(mousePoints)
    ? buildBoundsFromPoints(mousePoints)
    : null
}

function buildBoundsFromPoints(points: Point[]): SelectionBounds {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  }
}

function normalizeProgramName(programName: string | null | undefined): string {
  return (programName ?? '').trim().toLocaleLowerCase()
}

function isChromeSelection(selection: TextSelectionData): boolean {
  const programName = normalizeProgramName(selection.programName)
  return CHROME_SELECTION_PROGRAM_NAMES.some((name) => normalizeProgramName(name) === programName)
}

function normalizeSelectedText(text: string | undefined): string | null {
  if (!text) {
    return null
  }

  const normalized = text.trim()
  return normalized.length > 0 ? normalized : null
}

function summarizeRawSelection(selection: TextSelectionData | null): Record<string, unknown> {
  return {
    hasSelection: Boolean(selection),
    sourceApp: selection?.programName ?? null,
    textLength: typeof selection?.text === 'string' ? selection.text.trim().length : 0,
    positionLevel: selection?.posLevel ?? null,
    allowedSource: selection ? isChromeSelection(selection) : null,
    hasBounds: selection ? extractBounds(selection) !== null : false
  }
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
  const listeners = new Set<(selection: ContextSelection | null) => void>()

  const buildContextSelection = (
    selection: TextSelectionData | null,
    options?: CaptureSelectionOptions
  ): ContextSelection | null => {
    const text = normalizeSelectedText(selection?.text)
    if (!text || !selection || (!options?.allowAnySource && !isChromeSelection(selection))) {
      return null
    }

    return {
      text,
      sourceApp: selection?.programName ?? null,
      bounds: extractBounds(selection) ?? options?.fallbackBounds ?? null,
      capturedAt: now()
    }
  }

  const emitSelection = (selection: TextSelectionData | null): void => {
    const normalized = buildContextSelection(selection)
    logDebug('selection', 'Received live selection event', {
      ...summarizeRawSelection(selection),
      normalized: normalized
        ? {
            sourceApp: normalized.sourceApp,
            textLength: normalized.text.length,
            hasBounds: normalized.bounds !== null
          }
        : null,
      listenerCount: listeners.size
    })
    for (const listener of listeners) {
      listener(normalized)
    }
  }

  const refreshCurrentSelection = (): void => {
    try {
      emitSelection(hook.getCurrentSelection())
    } catch (error) {
      console.error('[context] Failed to refresh selection state.', error)
      emitSelection(null)
    }
  }

  const buildSnapshot = (selection: TextSelectionData | null): ContextSnapshot => {
    const selectedText =
      selection && isChromeSelection(selection) ? normalizeSelectedText(selection.text) : null

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
      hook.setSelectionPassiveMode?.(SELECTION_PASSIVE_MODE)
      const result = hook.start({
        selectionPassiveMode: SELECTION_PASSIVE_MODE,
        enableMouseMoveEvent: false
      })
      return result
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
    async captureSelection(options?: CaptureSelectionOptions) {
      if (!ensureHookStarted() || !hook.isRunning()) {
        logDebug('selection', 'Unable to capture current selection because hook is not running', {
          platform
        })
        return null
      }

      try {
        const selection = hook.getCurrentSelection()
        const rawBounds = selection ? extractBounds(selection) : null
        const normalized = buildContextSelection(selection, options)
        logDebug('selection', 'Captured current selection on demand', {
          ...summarizeRawSelection(selection),
          allowAnySource: options?.allowAnySource === true,
          usedFallbackBounds: Boolean(normalized?.bounds && !rawBounds),
          normalized: normalized
            ? {
                sourceApp: normalized.sourceApp,
                textLength: normalized.text.length,
                hasBounds: normalized.bounds !== null
              }
            : null
        })
        return normalized
      } catch (error) {
        console.error('[context] Failed to capture current selection.', error)
        logDebug('selection', 'Failed to capture current selection on demand', { error })
        return null
      }
    },
    subscribeToSelection(listener) {
      listeners.add(listener)

      if (listeners.size === 1 && ensureHookStarted()) {
        logDebug('selection', 'Subscribed to live selection-hook events')
        hook.on('text-selection', emitSelection)
        hook.on('mouse-up', refreshCurrentSelection)
        hook.on('key-up', refreshCurrentSelection)
      }

      return () => {
        listeners.delete(listener)
        if (listeners.size > 0) {
          return
        }

        hook.removeListener('text-selection', emitSelection)
        hook.removeListener('mouse-up', refreshCurrentSelection)
        hook.removeListener('key-up', refreshCurrentSelection)
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
