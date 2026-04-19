# TIA Context-Aware Voice Assistant Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a cross-platform Electron voice orchestration layer that starts from a global hotkey, records microphone audio in a non-focus-stealing overlay, runs pluggable ASR and LLM cleanup stages, and pastes or displays the result based on user context.

**Architecture:** Keep native orchestration in the main process, microphone capture plus waveform rendering in the `RecordingBar` renderer, and all renderer-to-main communication behind a typed preload bridge. Introduce interfaces for context capture, ASR, LLM, and action execution now, ship the first milestone as `hold hotkey -> record -> transcribe -> clean up -> paste`, then layer in full context-aware routing without restructuring the pipeline.

**Tech Stack:** Electron 39, electron-vite, React 19, TypeScript 5, `uiohook-napi`, `@nut-tree/nut-js`, Node `fetch`, Vitest, Testing Library, `zod`

---

## Scope Split

**Phase 1 (implement first):**
- Global push-to-talk hotkey from the main process
- Transparent `RecordingBar` window with waveform
- Renderer-side microphone capture with `MediaRecorder`
- Abstract ASR interface with Qwen `qwen3-asr-flash` adapter
- Abstract LLM interface with Qwen `qwen-plus` cleanup adapter
- `nut-js` clipboard-paste executor
- Minimal `ChatWindow` thinking/result state
- `MainAppWindow` placeholder for settings and history

**Phase 2 (after MVP is stable):**
- Real context snapshot provider (`isInputFocused`, `selectedText`)
- Intent routing matrix for `REPLACE_TEXT`, `ANSWER_QUERY`, `GENERATE_TEXT`
- Selection-aware writeback and non-input result display flows
- Privacy hardening, richer settings, transcription history UI

## Shared Design Decisions

1. `RecordingBar` must not steal focus.
   Use a frameless transparent `BrowserWindow` with `alwaysOnTop`, `skipTaskbar`, `focusable: false`, `setIgnoreMouseEvents(true)`, and `showInactive()`.

2. Capture context before showing UI.
   The main process will call a `ContextProvider.captureSnapshot()` method on hotkey-down before telling the `RecordingBar` to start recording.

3. Record in the renderer, orchestrate in the main process.
   The renderer owns `getUserMedia`, `MediaRecorder`, `AnalyserNode`, and canvas drawing. The main process owns hotkeys, provider calls, state transitions, and action execution.

4. Use provider interfaces from day one.
   `AsrProvider`, `LlmProvider`, `ContextProvider`, and `ActionExecutor` should all be swappable through factories.

5. Keep captured context ephemeral.
   Store hotkey snapshots and raw audio only in memory or in a temp file scheduled for deletion after the pipeline completes or fails.

6. Ship the MVP route first.
   Until real focus detection lands, route all successful cleaned-up text to the paste executor.

## Proposed File Layout

```text
src/main/
  index.ts
  app/bootstrap.ts
  config/env.ts
  config/settingsStore.ts
  context/ContextProvider.ts
  context/NoopContextProvider.ts
  context/types.ts
  hotkeys/globalHotkeyService.ts
  ipc/channels.ts
  ipc/registerMainIpc.ts
  orchestration/ephemeralSessionStore.ts
  orchestration/intentRouter.ts
  orchestration/voicePipeline.ts
  providers/asr/AsrProvider.ts
  providers/asr/QwenAsrProvider.ts
  providers/llm/LlmProvider.ts
  providers/llm/QwenCleanupProvider.ts
  recording/types.ts
  actions/ActionExecutor.ts
  actions/NutPasteExecutor.ts
  windows/createChatWindow.ts
  windows/createMainAppWindow.ts
  windows/createRecordingBarWindow.ts
  windows/windowManager.ts

src/preload/
  index.ts
  index.d.ts

src/renderer/src/
  App.tsx
  main.tsx
  styles/window-shell.css
  windows/MainAppWindow.tsx
  windows/ChatWindow.tsx
  windows/RecordingBarWindow.tsx
  recording/useMicrophoneRecorder.ts
  recording/useWaveformAnalyser.ts
  components/WaveformCanvas.tsx
  components/ThinkingIndicator.tsx
  lib/windowRole.ts
  lib/ipc.ts

src/test/
  setup.ts

docs/
  manual-smoke/context-aware-voice-assistant.md
  plans/2026-04-08-tia-context-aware-voice-assistant.md
```

### Task 1: Add Dependency, Env, and Test Foundation

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/main/config/env.ts`
- Test: `src/main/config/env.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { loadAppEnv } from './env'

describe('loadAppEnv', () => {
  it('returns platform-specific default push-to-talk key and requires DashScope key', () => {
    expect(() => loadAppEnv({ platform: 'darwin', env: {} as NodeJS.ProcessEnv })).toThrow()

    const loaded = loadAppEnv({
      platform: 'win32',
      env: { DASHSCOPE_API_KEY: 'test-key' } as NodeJS.ProcessEnv
    })

    expect(loaded.pushToTalkKey).toBe('RightAlt')
    expect(loaded.dashscope.baseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/main/config/env.test.ts`
Expected: FAIL because `loadAppEnv` does not exist.

**Step 3: Write minimal implementation**

```ts
import { z } from 'zod'

const schema = z.object({
  DASHSCOPE_API_KEY: z.string().min(1),
  DASHSCOPE_BASE_URL: z.string().url().optional()
})

export function loadAppEnv(input: { platform: NodeJS.Platform; env: NodeJS.ProcessEnv }) {
  const parsed = schema.parse(input.env)
  return {
    dashscope: {
      apiKey: parsed.DASHSCOPE_API_KEY,
      baseUrl: parsed.DASHSCOPE_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    },
    pushToTalkKey: input.platform === 'darwin' ? 'RightMeta' : 'RightAlt'
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/main/config/env.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add package.json README.md vitest.config.ts src/test/setup.ts src/main/config/env.ts src/main/config/env.test.ts
git commit -m "chore: add app env and test foundation"
```

### Task 2: Build Typed Window Roles and Window Manager

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/renderer/src/App.tsx`
- Create: `src/main/windows/windowManager.ts`
- Create: `src/main/windows/createMainAppWindow.ts`
- Create: `src/main/windows/createRecordingBarWindow.ts`
- Create: `src/main/windows/createChatWindow.ts`
- Create: `src/main/ipc/channels.ts`
- Create: `src/renderer/src/windows/MainAppWindow.tsx`
- Create: `src/renderer/src/windows/ChatWindow.tsx`
- Create: `src/renderer/src/windows/RecordingBarWindow.tsx`
- Create: `src/renderer/src/lib/windowRole.ts`
- Test: `src/main/windows/windowManager.test.ts`
- Test: `src/renderer/src/App.test.tsx`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildRendererRoute } from './windowManager'

describe('buildRendererRoute', () => {
  it('builds deterministic urls for each window role', () => {
    expect(buildRendererRoute('recording-bar')).toContain('window=recording-bar')
    expect(buildRendererRoute('chat')).toContain('window=chat')
    expect(buildRendererRoute('main-app')).toContain('window=main-app')
  })
})
```

```tsx
import { render, screen } from '@testing-library/react'
import App from './App'

it('renders the correct window shell for the current role', () => {
  render(<App initialWindowRole="recording-bar" />)
  expect(screen.getByTestId('recording-bar-window')).toBeInTheDocument()
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/main/windows/windowManager.test.ts src/renderer/src/App.test.tsx`
Expected: FAIL because the window manager and role-aware app do not exist.

**Step 3: Write minimal implementation**

```ts
export type WindowRole = 'main-app' | 'recording-bar' | 'chat'

export function buildRendererRoute(role: WindowRole): string {
  return `index.html?window=${role}`
}
```

```tsx
export default function App(props: { initialWindowRole?: WindowRole }) {
  const role = props.initialWindowRole ?? getWindowRoleFromLocation()
  if (role === 'recording-bar') return <RecordingBarWindow />
  if (role === 'chat') return <ChatWindow />
  return <MainAppWindow />
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/main/windows/windowManager.test.ts src/renderer/src/App.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/preload/index.d.ts src/main/windows src/main/ipc/channels.ts src/renderer/src/App.tsx src/renderer/src/windows src/renderer/src/lib/windowRole.ts src/main/windows/windowManager.test.ts src/renderer/src/App.test.tsx
git commit -m "feat: add multi-window shell architecture"
```

### Task 3: Implement Push-to-Talk Hotkey State Machine

**Files:**
- Create: `src/main/hotkeys/globalHotkeyService.ts`
- Create: `src/main/orchestration/ephemeralSessionStore.ts`
- Create: `src/main/context/types.ts`
- Create: `src/main/context/ContextProvider.ts`
- Create: `src/main/context/NoopContextProvider.ts`
- Test: `src/main/hotkeys/globalHotkeyService.test.ts`
- Test: `src/main/orchestration/ephemeralSessionStore.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createGlobalHotkeyService } from './globalHotkeyService'

describe('createGlobalHotkeyService', () => {
  it('starts once on matching keydown and stops on matching keyup', () => {
    const onStart = vi.fn()
    const onStop = vi.fn()
    const service = createGlobalHotkeyService({ triggerKey: 'RightAlt', onStart, onStop })

    service.handleKeyDown('RightAlt')
    service.handleKeyDown('RightAlt')
    service.handleKeyUp('RightAlt')

    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onStop).toHaveBeenCalledTimes(1)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/main/hotkeys/globalHotkeyService.test.ts`
Expected: FAIL because the service does not exist.

**Step 3: Write minimal implementation**

```ts
export function createGlobalHotkeyService(input: {
  triggerKey: 'RightAlt' | 'RightMeta'
  onStart: () => void
  onStop: () => void
}) {
  let active = false

  return {
    handleKeyDown(key: string) {
      if (key !== input.triggerKey || active) return
      active = true
      input.onStart()
    },
    handleKeyUp(key: string) {
      if (key !== input.triggerKey || !active) return
      active = false
      input.onStop()
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/main/hotkeys/globalHotkeyService.test.ts src/main/orchestration/ephemeralSessionStore.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/hotkeys/globalHotkeyService.ts src/main/hotkeys/globalHotkeyService.test.ts src/main/orchestration/ephemeralSessionStore.ts src/main/orchestration/ephemeralSessionStore.test.ts src/main/context/types.ts src/main/context/ContextProvider.ts src/main/context/NoopContextProvider.ts
git commit -m "feat: add push-to-talk hotkey state machine"
```

### Task 4: Create the RecordingBar Window and Microphone Recorder

**Files:**
- Create: `src/renderer/src/recording/useMicrophoneRecorder.ts`
- Create: `src/renderer/src/recording/useWaveformAnalyser.ts`
- Create: `src/renderer/src/components/WaveformCanvas.tsx`
- Modify: `src/renderer/src/windows/RecordingBarWindow.tsx`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/main/ipc/registerMainIpc.ts`
- Create: `src/main/recording/types.ts`
- Test: `src/renderer/src/components/WaveformCanvas.test.tsx`
- Test: `src/renderer/src/recording/useMicrophoneRecorder.test.ts`

**Step 1: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react'
import { WaveformCanvas } from './WaveformCanvas'

it('renders the recording canvas shell', () => {
  render(<WaveformCanvas levels={[0.1, 0.3, 0.6]} />)
  expect(screen.getByTestId('waveform-canvas')).toBeInTheDocument()
})
```

```ts
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
```

**Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/renderer/src/components/WaveformCanvas.test.tsx src/renderer/src/recording/useMicrophoneRecorder.test.ts`
Expected: FAIL because the recorder and waveform components do not exist.

**Step 3: Write minimal implementation**

```ts
export type RecordingArtifact = {
  mimeType: string
  buffer: Uint8Array
  durationMs: number
}
```

```tsx
export function WaveformCanvas(props: { levels: number[] }) {
  return <canvas data-testid="waveform-canvas" aria-label="Recording waveform" />
}
```

```tsx
export default function RecordingBarWindow() {
  return (
    <div data-testid="recording-bar-window">
      <WaveformCanvas levels={[]} />
      <span>Listening…</span>
    </div>
  )
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/renderer/src/components/WaveformCanvas.test.tsx src/renderer/src/recording/useMicrophoneRecorder.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/renderer/src/recording src/renderer/src/components/WaveformCanvas.tsx src/renderer/src/components/WaveformCanvas.test.tsx src/renderer/src/windows/RecordingBarWindow.tsx src/preload/index.ts src/preload/index.d.ts src/main/ipc/registerMainIpc.ts src/main/recording/types.ts
git commit -m "feat: add recording bar microphone shell"
```

### Task 5: Add ASR Provider Abstraction with Qwen Adapter

**Files:**
- Create: `src/main/providers/asr/AsrProvider.ts`
- Create: `src/main/providers/asr/QwenAsrProvider.ts`
- Create: `src/main/providers/asr/QwenAsrProvider.test.ts`
- Modify: `src/main/recording/types.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createQwenAsrProvider } from './QwenAsrProvider'

describe('createQwenAsrProvider', () => {
  it('posts audio as a data url and returns the transcript text', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '你好世界' } }]
      })
    })

    const provider = createQwenAsrProvider({
      apiKey: 'test-key',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      fetcher
    })

    const result = await provider.transcribe({
      mimeType: 'audio/webm',
      buffer: new Uint8Array([1, 2, 3]),
      durationMs: 800
    })

    expect(fetcher).toHaveBeenCalled()
    expect(result.text).toBe('你好世界')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/main/providers/asr/QwenAsrProvider.test.ts`
Expected: FAIL because the provider does not exist.

**Step 3: Write minimal implementation**

```ts
export interface AsrProvider {
  transcribe(input: RecordingArtifact): Promise<{ text: string; language?: string }>
}
```

```ts
export function createQwenAsrProvider(input: {
  apiKey: string
  baseUrl: string
  fetcher?: typeof fetch
}): AsrProvider {
  const fetcher = input.fetcher ?? fetch
  return {
    async transcribe(artifact) {
      const dataUrl = `data:${artifact.mimeType};base64,${Buffer.from(artifact.buffer).toString('base64')}`
      const response = await fetcher(`${input.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen3-asr-flash',
          messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: dataUrl } }] }],
          stream: false,
          asr_options: { enable_itn: false }
        })
      })
      const json = await response.json()
      return { text: json.choices[0].message.content }
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/main/providers/asr/QwenAsrProvider.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/providers/asr src/main/recording/types.ts
git commit -m "feat: add qwen asr provider"
```

### Task 6: Add LLM Cleanup Provider Abstraction

**Files:**
- Create: `src/main/providers/llm/LlmProvider.ts`
- Create: `src/main/providers/llm/QwenCleanupProvider.ts`
- Test: `src/main/providers/llm/QwenCleanupProvider.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createQwenCleanupProvider } from './QwenCleanupProvider'

describe('createQwenCleanupProvider', () => {
  it('sends a cleanup prompt and returns the cleaned text', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '你好，今天下午三点开会。' } }]
      })
    })

    const provider = createQwenCleanupProvider({
      apiKey: 'test-key',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      fetcher
    })

    const result = await provider.clean('你好 今天下午3点开会')
    expect(fetcher).toHaveBeenCalled()
    expect(result.text).toBe('你好，今天下午三点开会。')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/main/providers/llm/QwenCleanupProvider.test.ts`
Expected: FAIL because the provider does not exist.

**Step 3: Write minimal implementation**

```ts
export interface LlmProvider {
  clean(input: string): Promise<{ text: string }>
}
```

```ts
const SYSTEM_PROMPT = [
  'You normalize ASR output.',
  'Keep the original meaning.',
  'Fix only obvious recognition mistakes, punctuation, and natural phrasing.',
  'Return only the cleaned text.'
].join(' ')
```

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/main/providers/llm/QwenCleanupProvider.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/providers/llm
git commit -m "feat: add qwen cleanup provider"
```

### Task 7: Add Clipboard-Paste Action Executor with nut.js

**Files:**
- Create: `src/main/actions/ActionExecutor.ts`
- Create: `src/main/actions/NutPasteExecutor.ts`
- Test: `src/main/actions/NutPasteExecutor.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createNutPasteExecutor } from './NutPasteExecutor'

describe('createNutPasteExecutor', () => {
  it('uses Cmd+V on macOS and Ctrl+V on Windows', async () => {
    const clipboard = { setContent: vi.fn().mockResolvedValue(undefined) }
    const keyboard = { pressKey: vi.fn().mockResolvedValue(undefined), releaseKey: vi.fn().mockResolvedValue(undefined) }

    const executor = createNutPasteExecutor({ platform: 'darwin', clipboard, keyboard })
    await executor.execute({ kind: 'paste-text', text: 'hello' })

    expect(clipboard.setContent).toHaveBeenCalledWith('hello')
    expect(keyboard.pressKey).toHaveBeenCalled()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/main/actions/NutPasteExecutor.test.ts`
Expected: FAIL because the executor does not exist.

**Step 3: Write minimal implementation**

```ts
export interface ActionExecutor {
  execute(action: { kind: 'paste-text'; text: string }): Promise<void>
}
```

```ts
export function createNutPasteExecutor(input: {
  platform: NodeJS.Platform
  clipboard: { setContent(text: string): Promise<void> }
  keyboard: { pressKey(...keys: unknown[]): Promise<void>; releaseKey(...keys: unknown[]): Promise<void> }
}): ActionExecutor {
  return {
    async execute(action) {
      await input.clipboard.setContent(action.text)
      const modifier = input.platform === 'darwin' ? 'LeftSuper' : 'LeftControl'
      await input.keyboard.pressKey(modifier, 'V')
      await input.keyboard.releaseKey(modifier, 'V')
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/main/actions/NutPasteExecutor.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/actions
git commit -m "feat: add paste executor"
```

### Task 8: Wire the Voice Pipeline End-to-End

**Files:**
- Create: `src/main/orchestration/voicePipeline.ts`
- Create: `src/main/orchestration/intentRouter.ts`
- Test: `src/main/orchestration/voicePipeline.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/registerMainIpc.ts`
- Modify: `src/main/windows/windowManager.ts`
- Modify: `src/renderer/src/windows/ChatWindow.tsx`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createVoicePipeline } from './voicePipeline'

describe('createVoicePipeline', () => {
  it('runs snapshot -> asr -> cleanup -> paste for the mvp route', async () => {
    const pipeline = createVoicePipeline({
      contextProvider: { captureSnapshot: vi.fn().mockResolvedValue({ isInputFocused: null, selectedText: null }) },
      asrProvider: { transcribe: vi.fn().mockResolvedValue({ text: 'ni hao jin tian kai hui' }) },
      llmProvider: { clean: vi.fn().mockResolvedValue({ text: '你好，今天开会。' }) },
      actionExecutor: { execute: vi.fn().mockResolvedValue(undefined) },
      notifyChatWindow: vi.fn()
    })

    await pipeline.finishRecording({ mimeType: 'audio/webm', buffer: new Uint8Array([1]), durationMs: 500 })
    expect(pipeline.dependencies.actionExecutor.execute).toHaveBeenCalledWith({ kind: 'paste-text', text: '你好，今天开会。' })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/main/orchestration/voicePipeline.test.ts`
Expected: FAIL because the pipeline does not exist.

**Step 3: Write minimal implementation**

```ts
export function createVoicePipeline(dependencies: {
  contextProvider: { captureSnapshot(): Promise<unknown> }
  asrProvider: { transcribe(input: RecordingArtifact): Promise<{ text: string }> }
  llmProvider: { clean(input: string): Promise<{ text: string }> }
  actionExecutor: { execute(action: { kind: 'paste-text'; text: string }): Promise<void> }
  notifyChatWindow(state: { phase: 'idle' | 'thinking' | 'done' | 'error'; text?: string }): void
}) {
  return {
    dependencies,
    async finishRecording(artifact: RecordingArtifact) {
      dependencies.notifyChatWindow({ phase: 'thinking' })
      await dependencies.contextProvider.captureSnapshot()
      const transcript = await dependencies.asrProvider.transcribe(artifact)
      const cleaned = await dependencies.llmProvider.clean(transcript.text)
      await dependencies.actionExecutor.execute({ kind: 'paste-text', text: cleaned.text })
      dependencies.notifyChatWindow({ phase: 'done', text: cleaned.text })
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/main/orchestration/voicePipeline.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/orchestration src/main/index.ts src/main/ipc/registerMainIpc.ts src/main/windows/windowManager.ts src/renderer/src/windows/ChatWindow.tsx
git commit -m "feat: wire voice pipeline"
```

### Task 9: Add MainAppWindow Settings and History Shell

**Files:**
- Create: `src/main/config/settingsStore.ts`
- Modify: `src/main/ipc/registerMainIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/renderer/src/windows/MainAppWindow.tsx`
- Create: `src/renderer/src/styles/window-shell.css`
- Test: `src/main/config/settingsStore.test.ts`
- Test: `src/renderer/src/windows/MainAppWindow.test.tsx`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { createSettingsStore } from './settingsStore'

describe('createSettingsStore', () => {
  it('returns default preferences for hotkey, providers, and history', () => {
    const store = createSettingsStore()
    expect(store.get().providers.asr).toBe('qwen3-asr-flash')
  })
})
```

```tsx
import { render, screen } from '@testing-library/react'
import MainAppWindow from './MainAppWindow'

it('renders settings and history placeholders', () => {
  render(<MainAppWindow />)
  expect(screen.getByText(/transcription history/i)).toBeInTheDocument()
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/main/config/settingsStore.test.ts src/renderer/src/windows/MainAppWindow.test.tsx`
Expected: FAIL because the store and UI shell do not exist.

**Step 3: Write minimal implementation**

```ts
export function createSettingsStore() {
  return {
    get() {
      return {
        hotkey: null,
        providers: { asr: 'qwen3-asr-flash', llm: 'qwen-plus' },
        history: []
      }
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/main/config/settingsStore.test.ts src/renderer/src/windows/MainAppWindow.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/config/settingsStore.ts src/main/config/settingsStore.test.ts src/main/ipc/registerMainIpc.ts src/preload/index.ts src/preload/index.d.ts src/renderer/src/windows/MainAppWindow.tsx src/renderer/src/windows/MainAppWindow.test.tsx src/renderer/src/styles/window-shell.css
git commit -m "feat: add main app settings shell"
```

### Task 10: Prepare the Real Context-Aware Routing Layer

**Files:**
- Modify: `src/main/context/ContextProvider.ts`
- Create: `src/main/context/providers/SelectionHookContextProvider.ts`
- Create: `src/main/context/providers/NutInspectorContextProvider.ts`
- Modify: `src/main/orchestration/intentRouter.ts`
- Test: `src/main/context/contextProviderFactory.test.ts`
- Test: `src/main/orchestration/intentRouter.test.ts`
- Modify: `docs/manual-smoke/context-aware-voice-assistant.md`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { routeIntent } from './intentRouter'

describe('routeIntent', () => {
  it('maps the focused-selection case to replace-or-answer mode', () => {
    const result = routeIntent({ isInputFocused: true, selectedText: 'draft' })
    expect(result.mode).toBe('selection-aware')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/main/orchestration/intentRouter.test.ts src/main/context/contextProviderFactory.test.ts`
Expected: FAIL because the richer context providers and routing logic do not exist.

**Step 3: Write minimal implementation**

```ts
export type ContextSnapshot = {
  isInputFocused: boolean | null
  selectedText: string | null
  provider: 'noop' | 'selection-hook' | 'nut-inspector'
  capturedAt: number
}

export function routeIntent(snapshot: ContextSnapshot) {
  if (snapshot.isInputFocused && snapshot.selectedText) {
    return { mode: 'selection-aware' as const }
  }
  if (!snapshot.isInputFocused && snapshot.selectedText) {
    return { mode: 'answer-query' as const }
  }
  return { mode: 'generate-text' as const }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/main/orchestration/intentRouter.test.ts src/main/context/contextProviderFactory.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/main/context src/main/orchestration/intentRouter.ts src/main/orchestration/intentRouter.test.ts docs/manual-smoke/context-aware-voice-assistant.md
git commit -m "feat: prepare context-aware routing"
```

## Manual Smoke Checklist

Run these after Task 8 and again after Task 10:

1. `pnpm dev` on macOS and confirm the main window opens.
2. Hold the right Command key on macOS and verify the `RecordingBar` appears without stealing focus.
3. Speak a short sentence, release the key, and confirm the `ChatWindow` enters a thinking state.
4. Confirm the cleaned result is pasted with `Cmd+V` on macOS.
5. Repeat on Windows with the right Alt key and confirm `Ctrl+V` paste behavior.
6. Disconnect network or unset `DASHSCOPE_API_KEY` and verify the user sees an error state instead of a silent failure.
7. Confirm raw audio is deleted from memory or temp storage after completion.
8. After the real context provider lands, test the three routing cases:
   - focused + selected text
   - not focused + selected text
   - focused + no selection

## Risks and Mitigations

1. `uiohook-napi` is native and should be validated on both Electron dev and packaged builds early.
2. Global hotkey codes for right-side modifier keys can vary by platform and keyboard layout, so log actual keycodes during the first smoke test before hard-coding the final mapping.
3. The accessibility snapshot layer is the least stable part of the stack. Keep it behind `ContextProvider` so `selection-hook`, a `nut-js` inspector bridge, or a custom native module can be swapped without touching the pipeline.
4. `RecordingBar` must stay non-focusable, or the app will lose the original text caret and selection before capture.
5. Clipboard-based paste is fast but can overwrite the user clipboard. Decide in a follow-up whether to restore the prior clipboard contents after paste or document the tradeoff for MVP.
6. Keep initial audio small. Qwen ASR accepts Data URL audio input, but Base64 payloads expand in size, so short push-to-talk recordings are the safe first release shape.

## Notes for Implementation

1. Prefer `audio/webm;codecs=opus` from `MediaRecorder` when available. It matches the Electron renderer well and is supported by Qwen ASR.
2. Do not persist context snapshots unless the user explicitly enables history in a later phase.
3. Keep `ChatWindow` minimal in MVP: `idle`, `thinking`, `done`, `error`.
4. Treat `MainAppWindow` as a stable shell now, not the full product. The point of Task 9 is to avoid repainting the architecture later.

Plan complete and saved to `docs/plans/2026-04-08-tia-context-aware-voice-assistant.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
