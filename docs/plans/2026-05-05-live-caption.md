# Live Caption Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Live Caption mode, started by default with Ctrl+L, that lets the user choose source language and optional translation target, captures system audio, streams it to DashScope Gummy realtime WebSocket, and shows live draggable captions in a transparent closable window.

**Architecture:** Reuse the in-progress Meeting Capture pieces, but extract the reusable parts into a shared realtime caption stack: Gummy WebSocket client, system-audio capture, PCM encoding, transcript state, and transparent overlay rendering. Live Caption owns system-audio-only captioning; Meeting Capture can subscribe to the same primitives later for the `Others` stream while keeping mic capture, persistence, and post-processing in its own pipeline.

**Tech Stack:** Electron main process, React renderer, TypeScript, `ws`, DashScope Gummy realtime WebSocket API, Web Audio API, `desktopCapturer`, `session.setDisplayMediaRequestHandler`, Vitest, existing TIA Voice settings/window/IPC patterns.

---

## Source Notes

- Aliyun Gummy realtime WebSocket uses `wss://dashscope.aliyuncs.com/api-ws/v1/inference` with `Authorization: Bearer <api_key>`.
- Start sequence is `run-task` -> wait for `task-started` -> send mono binary audio -> send `finish-task` -> wait for `task-finished`.
- Use `model: "gummy-realtime-v1"`, `sample_rate: 16000`, `format: "pcm"`, `transcription_enabled: true`, and `translation_enabled` based on user config.
- `source_language` defaults to `auto`. Translation only works when `translation_enabled: true` and `translation_target_languages` contains exactly one supported target language.
- `result-generated` can contain both `output.transcription` and `output.translations[]`. Interim transcription and translation can be out of sync until `sentence_end: true`, so the overlay should display interim best-effort text but only treat final sentence pairs as stable.
- Electron `desktopCapturer` docs show `getDisplayMedia({ audio: true, video: ... })` with a main-process `setDisplayMediaRequestHandler`; macOS 14.2+ needs `NSAudioCaptureUsageDescription`, and missing it can produce a dead stream without a clear error.
- Electron `session.setDisplayMediaRequestHandler` docs say the literal `audio: 'loopback'` grant is currently only supported on Windows. Treat macOS system-audio capture as a required platform spike using the Electron 39 desktop-capturer path, `useSystemPicker`, `NSAudioCaptureUsageDescription`, and the `MacCatapLoopbackAudioForScreenShare` fallback flag if needed.

## Current Repo State

- `docs/plans/2026-05-04-meeting-capture.md` is already present and partially implemented.
- Existing uncommitted Meeting Capture pieces include `src/main/providers/asr/GummyRealtimeTranscriptionClient.ts`, `src/main/meetings/meetingStore.ts`, `src/renderer/src/meeting/audio/pcmEncoder.ts`, `src/renderer/src/meeting/useMeetingCapture.ts`, and `src/renderer/src/windows/MeetingCaptureWindow.tsx`.
- The current Gummy client handles transcription only and hardcodes `translation_enabled: false`.
- The renderer route already knows about `meeting-capture`, but main-process window/IPC/pipeline wiring for meeting capture is not complete yet.

## Product Decisions

- Default shortcut: `Control+L` / user-facing `Ctrl+L`.
- Shortcut behavior: if idle, show the Live Caption setup window. If the overlay is already running, bring it to front. Stop happens from the overlay close button or close event, not by pressing Ctrl+L again in this first pass.
- Source language defaults to `auto`.
- Target language defaults to `none`. When target is selected, show translated text as the primary caption and original text as the secondary line.
- Use the existing locally saved DashScope key. If missing, show a blocking setup error with an action to open Settings.
- Live Caption captures system audio only. It does not save audio or transcript in this iteration.
- The caption overlay must be transparent, draggable, closable, always on top, and clickable. Do not call `setIgnoreMouseEvents`.
- Closing the caption overlay must immediately stop renderer capture, stop audio chunk forwarding, send `finish-task` or abort the Gummy client, and clear active state.
- Because Ctrl+L is a common browser/app shortcut, add Settings visibility for the shortcut and leave room for a later configurable shortcut.

## Shared Data Model

Create shared types in `src/shared/liveCaption.ts`:

```ts
export type LiveCaptionSourceLanguage =
  | 'auto'
  | 'zh'
  | 'en'
  | 'ja'
  | 'ko'
  | 'yue'
  | 'de'
  | 'fr'
  | 'ru'
  | 'es'
  | 'it'
  | 'pt'
  | 'id'
  | 'ar'
  | 'th'

export type LiveCaptionTargetLanguage =
  | 'zh'
  | 'en'
  | 'ja'
  | 'ko'
  | 'yue'
  | 'de'
  | 'fr'
  | 'ru'
  | 'es'
  | 'it'
  | 'pt'
  | 'id'
  | 'ar'
  | 'th'
  | 'hi'
  | 'da'
  | 'ur'
  | 'tr'
  | 'nl'
  | 'ms'
  | 'vi'

export type LiveCaptionPreferences = {
  sourceLanguage: LiveCaptionSourceLanguage
  targetLanguage: LiveCaptionTargetLanguage | null
  showOriginalWhenTranslating: boolean
}

export type LiveCaptionLine = {
  id: string
  sentenceId: number
  beginMs: number
  endMs: number
  sourceText: string
  translatedText: string | null
  targetLanguage: LiveCaptionTargetLanguage | null
  final: boolean
  createdAt: number
}

export type LiveCaptionState =
  | { status: 'idle'; preferences: LiveCaptionPreferences; lines: LiveCaptionLine[]; error: null }
  | {
      status: 'configuring'
      preferences: LiveCaptionPreferences
      lines: LiveCaptionLine[]
      error: null
    }
  | {
      status: 'starting' | 'listening' | 'stopping'
      preferences: LiveCaptionPreferences
      lines: LiveCaptionLine[]
      error: null
    }
  | {
      status: 'error'
      preferences: LiveCaptionPreferences
      lines: LiveCaptionLine[]
      error: string
    }
```

---

### Task 1: Extend Gummy Realtime Client For Translation

**Files:**

- Modify: `src/main/providers/asr/GummyRealtimeTranscriptionClient.ts`
- Modify: `src/main/providers/asr/GummyRealtimeTranscriptionClient.test.ts`
- Create: `src/shared/liveCaption.ts`

**Step 1: Write failing tests**

Cover:

- `source_language` is omitted or set to `auto` by default.
- selected source language is sent in `payload.parameters.source_language`.
- `targetLanguage: null` sends `translation_enabled: false` and no `translation_target_languages`.
- selected target language sends `translation_enabled: true` plus one `translation_target_languages` entry.
- parses `payload.output.translations[0]` into the update callback.
- preserves interim updates but marks final only when the relevant result has `sentence_end: true`.

Run:

```bash
rtk pnpm exec vitest run src/main/providers/asr/GummyRealtimeTranscriptionClient.test.ts
```

Expected: fail because translation fields are not implemented.

**Step 2: Implement minimal client changes**

Extend options:

```ts
sourceLanguage?: LiveCaptionSourceLanguage
targetLanguage?: LiveCaptionTargetLanguage | null
onTranscript(input: GummyTranscriptUpdate): void
```

Extend update payload:

```ts
translatedText?: string | null
translationLanguage?: LiveCaptionTargetLanguage | null
translationFinal?: boolean
```

**Step 3: Verify**

Run:

```bash
rtk pnpm exec vitest run src/main/providers/asr/GummyRealtimeTranscriptionClient.test.ts
rtk pnpm run typecheck:node
```

Expected: pass.

**Step 4: Commit**

```bash
git add src/shared/liveCaption.ts src/main/providers/asr/GummyRealtimeTranscriptionClient.ts src/main/providers/asr/GummyRealtimeTranscriptionClient.test.ts
git commit -m "feat: add gummy translation options"
```

---

### Task 2: Extract Shared System Audio Capture

**Files:**

- Move: `src/renderer/src/meeting/audio/pcmEncoder.ts` -> `src/renderer/src/audio/pcmEncoder.ts`
- Move: `src/renderer/src/meeting/audio/pcmEncoder.test.ts` -> `src/renderer/src/audio/pcmEncoder.test.ts`
- Create: `src/renderer/src/audio/useSystemAudioCapture.ts`
- Create: `src/renderer/src/audio/useSystemAudioCapture.test.ts`
- Modify: `src/renderer/src/meeting/useMeetingCapture.ts`

**Step 1: Move PCM encoder without behavior changes**

Update imports in Meeting Capture after moving the encoder.

Run:

```bash
rtk pnpm exec vitest run src/renderer/src/audio/pcmEncoder.test.ts src/renderer/src/meeting/useMeetingCapture.test.ts
```

Expected: pass after import updates.

**Step 2: Write failing system-audio hook tests**

Cover:

- calls `getDisplayMedia({ audio: true, video: { width: 1, height: 1, frameRate: 1 } })`.
- stops video tracks immediately after obtaining the stream.
- fails with a clear error if no audio track is present.
- encodes audio as 16 kHz mono PCM chunks.
- stops all tracks and closes `AudioContext` on stop.

Run:

```bash
rtk pnpm exec vitest run src/renderer/src/audio/useSystemAudioCapture.test.ts
```

Expected: fail because the hook does not exist.

**Step 3: Implement `useSystemAudioCapture`**

Expose:

```ts
start(): Promise<boolean>
stop(): void
status: 'idle' | 'starting' | 'capturing' | 'error'
error: string | null
lastChunkAt: number | null
```

Accept `onPcmChunk(chunk, capturedAt)` as a dependency.

**Step 4: Adapt Meeting Capture**

Replace the duplicated system stream branch in `useMeetingCapture` with the shared hook or the same pure helper functions. Keep Meeting Capture behavior unchanged: mic plus system, mixed recording, and blocking error if system audio is missing.

**Step 5: Verify**

Run:

```bash
rtk pnpm exec vitest run src/renderer/src/audio/useSystemAudioCapture.test.ts src/renderer/src/meeting/useMeetingCapture.test.ts
rtk pnpm run typecheck:web
```

Expected: pass.

**Step 6: Commit**

```bash
git add src/renderer/src/audio src/renderer/src/meeting/useMeetingCapture.ts
git commit -m "feat: share system audio capture"
```

---

### Task 3: Persist Live Caption Preferences

**Files:**

- Modify: `src/main/config/settingsStore.ts`
- Modify: `src/main/config/settingsStore.test.ts`
- Modify: `src/main/ipc/channels.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/renderer/src/lib/ipc.ts`

**Step 1: Write failing settings tests**

Cover:

- defaults to `{ sourceLanguage: 'auto', targetLanguage: null, showOriginalWhenTranslating: true }`.
- persists and reloads selected source and target language.
- normalizes invalid persisted language values back to safe defaults.

Run:

```bash
rtk pnpm exec vitest run src/main/config/settingsStore.test.ts
```

Expected: fail.

**Step 2: Implement settings methods**

Add:

```ts
getLiveCaptionPreferences(): LiveCaptionPreferences
setLiveCaptionPreferences(input: LiveCaptionPreferences): void
```

**Step 3: Add preload IPC**

Add channels:

```ts
IPC_CHANNELS.liveCaption.getPreferences
IPC_CHANNELS.liveCaption.setPreferences
```

Expose:

```ts
getLiveCaptionPreferences(): Promise<LiveCaptionPreferences>
setLiveCaptionPreferences(input: LiveCaptionPreferences): Promise<void>
```

**Step 4: Verify**

Run:

```bash
rtk pnpm exec vitest run src/main/config/settingsStore.test.ts
rtk pnpm run typecheck:node
rtk pnpm run typecheck:web
```

Expected: pass.

**Step 5: Commit**

```bash
git add src/main/config src/main/ipc src/preload src/renderer/src/lib/ipc.ts
git commit -m "feat: persist live caption preferences"
```

---

### Task 4: Live Caption Configuration Window

**Files:**

- Create: `src/main/windows/createLiveCaptionConfigWindow.ts`
- Create: `src/main/windows/createLiveCaptionConfigWindow.test.ts`
- Modify: `src/main/windows/windowManager.ts`
- Modify: `src/main/windows/windowManager.test.ts`
- Modify: `src/renderer/src/lib/windowRole.ts`
- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/windows/LiveCaptionConfigWindow.tsx`
- Create: `src/renderer/src/windows/live-caption/LiveCaptionLanguageSelect.tsx`
- Create: `src/renderer/src/windows/live-caption/liveCaptionLanguageOptions.ts`
- Modify: `src/renderer/src/App.test.tsx`

**Step 1: Write failing window tests**

Cover:

- `buildRendererRoute('live-caption-config')`.
- config window is focusable, non-transparent or lightly styled, centered, and hidden by default.
- window manager can show config with current preferences and provider key status.

Run:

```bash
rtk pnpm exec vitest run src/main/windows/createLiveCaptionConfigWindow.test.ts src/main/windows/windowManager.test.ts
```

Expected: fail.

**Step 2: Implement config window**

Size around `420 x 360`, focusable, movable, not always-on-top unless the main app already uses that pattern for setup surfaces.

**Step 3: Build setup UI**

Controls:

- source language select, default `Auto`.
- translation target select, default `No translation`.
- toggle for showing original text when translating.
- start button.
- missing DashScope key error state with Settings action.

Keep component files under 300 lines.

**Step 4: Verify**

Run:

```bash
rtk pnpm exec vitest run src/renderer/src/App.test.tsx src/main/windows/createLiveCaptionConfigWindow.test.ts src/main/windows/windowManager.test.ts
rtk pnpm run typecheck:web
```

Expected: pass.

**Step 5: Commit**

```bash
git add src/main/windows src/renderer/src/windows src/renderer/src/lib/windowRole.ts src/renderer/src/App.tsx src/renderer/src/App.test.tsx
git commit -m "feat: add live caption setup window"
```

---

### Task 5: Transparent Caption Overlay Window

**Files:**

- Create: `src/main/windows/createLiveCaptionOverlayWindow.ts`
- Create: `src/main/windows/createLiveCaptionOverlayWindow.test.ts`
- Modify: `src/main/windows/windowManager.ts`
- Modify: `src/main/windows/windowManager.test.ts`
- Modify: `src/renderer/src/lib/windowRole.ts`
- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/windows/LiveCaptionOverlayWindow.tsx`
- Create: `src/renderer/src/windows/live-caption/LiveCaptionOverlay.tsx`
- Create: `src/renderer/src/windows/live-caption/LiveCaptionLineList.tsx`
- Modify: `src/renderer/src/styles/window-shell.css`

**Step 1: Write failing overlay tests**

Cover:

- `buildRendererRoute('live-caption-overlay')`.
- overlay is transparent, frameless, always-on-top, movable, resizable or fixed-width with stable bounds, focusable, and clickable.
- `closeAllWindows()` closes the overlay.
- overlay close event notifies the Live Caption pipeline to stop.

Run:

```bash
rtk pnpm exec vitest run src/main/windows/createLiveCaptionOverlayWindow.test.ts src/main/windows/windowManager.test.ts
```

Expected: fail.

**Step 2: Implement overlay shell**

Use:

- `transparent: true`
- `backgroundColor: '#00000000'`
- `frame: false`
- `alwaysOnTop: true`
- `skipTaskbar: true`
- `focusable: true`
- `movable: true`

Do not use `setIgnoreMouseEvents`.

**Step 3: Implement draggable UI**

Use CSS `app-region: drag` on the caption body and `app-region: no-drag` on close/settings buttons. Keep captions readable with a translucent surface, not a heavy card.

**Step 4: Verify**

Run:

```bash
rtk pnpm exec vitest run src/renderer/src/App.test.tsx src/main/windows/createLiveCaptionOverlayWindow.test.ts src/main/windows/windowManager.test.ts
rtk pnpm run typecheck:web
```

Expected: pass.

**Step 5: Commit**

```bash
git add src/main/windows src/renderer/src/windows src/renderer/src/lib/windowRole.ts src/renderer/src/App.tsx src/renderer/src/styles/window-shell.css
git commit -m "feat: add live caption overlay"
```

---

### Task 6: Live Caption Pipeline, IPC, And System Audio Handler

**Files:**

- Create: `src/main/live-caption/liveCaptionPipeline.ts`
- Create: `src/main/live-caption/liveCaptionPipeline.test.ts`
- Create: `src/main/app/systemAudioCapture.ts`
- Create: `src/main/app/systemAudioCapture.test.ts`
- Modify: `src/main/ipc/channels.ts`
- Modify: `src/main/ipc/registerMainIpc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/renderer/src/lib/ipc.ts`
- Modify: `src/main/app/bootstrap.ts`
- Modify: `electron-builder.yml`

**Step 1: Write failing pipeline tests**

Cover:

- refuses start when DashScope key is missing.
- starts one Gummy client with selected language and target settings.
- sends overlay start command only after pipeline state moves to `starting`.
- forwards renderer PCM chunks to the active Gummy client only while listening.
- updates live caption state from interim and final Gummy events.
- caps rendered line history, for example last 30 lines.
- close request immediately stops renderer capture and finishes or aborts the Gummy client.
- renderer failure transitions state to error and closes the overlay.

Run:

```bash
rtk pnpm exec vitest run src/main/live-caption/liveCaptionPipeline.test.ts
```

Expected: fail.

**Step 2: Add IPC channels**

Add:

```ts
IPC_CHANNELS.liveCaption.showConfig
IPC_CHANNELS.liveCaption.start
IPC_CHANNELS.liveCaption.stop
IPC_CHANNELS.liveCaption.pcmChunk
IPC_CHANNELS.liveCaption.captureReady
IPC_CHANNELS.liveCaption.captureFailed
IPC_CHANNELS.liveCaption.state
IPC_CHANNELS.liveCaption.getState
```

Expose:

```ts
startLiveCaption(preferences: LiveCaptionPreferences): Promise<void>
stopLiveCaption(source?: 'overlay-close' | 'config' | 'app-quit'): Promise<void>
sendLiveCaptionPcmChunk(input: { chunk: Uint8Array; capturedAt: number }): Promise<void>
reportLiveCaptionCaptureReady(): Promise<void>
reportLiveCaptionCaptureFailure(detail: string): Promise<void>
onLiveCaptionState(listener: (state: LiveCaptionState) => void): () => void
getLiveCaptionState(): Promise<LiveCaptionState>
```

**Step 3: Implement system audio request handler**

In `systemAudioCapture.ts`, centralize:

```ts
session.defaultSession.setDisplayMediaRequestHandler(
  async (_request, callback) => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 }
    })
    callback(
      process.platform === 'win32'
        ? { video: sources[0], audio: 'loopback' }
        : { video: sources[0] }
    )
  },
  { useSystemPicker: process.platform === 'darwin' }
)
```

Add `NSAudioCaptureUsageDescription` to `electron-builder.yml`. On macOS, the implementation must verify that the returned display stream really has an audio track before opening the overlay; if it does not, surface a platform-specific error and test the Chromium fallback flag path before shipping.

**Step 4: Wire renderer capture**

`LiveCaptionOverlayWindow` starts `useSystemAudioCapture` after receiving a `starting` state and sends PCM chunks through preload.

**Step 5: Verify**

Run:

```bash
rtk pnpm exec vitest run src/main/live-caption/liveCaptionPipeline.test.ts src/main/app/systemAudioCapture.test.ts
rtk pnpm run typecheck:node
rtk pnpm run typecheck:web
```

Expected: pass.

**Step 6: Commit**

```bash
git add src/main/live-caption src/main/app src/main/ipc src/preload src/renderer/src/lib/ipc.ts electron-builder.yml
git commit -m "feat: wire live caption pipeline"
```

---

### Task 7: Ctrl+L Hotkey And Overlap Guards

**Files:**

- Modify: `src/main/hotkeys/globalHotkeyService.ts`
- Modify: `src/main/hotkeys/globalHotkeyService.test.ts`
- Modify: `src/main/app/bootstrap.ts`
- Modify: `src/main/logging/debugLogger.ts` if a new namespace helper is needed
- Modify: `src/renderer/src/windows/main-app/SettingsDialog.tsx`
- Modify: `src/renderer/src/i18n/index.tsx`

**Step 1: Write failing hotkey tests**

Cover:

- recognizes Ctrl+L using native `ctrlKey`.
- recognizes Ctrl+L when control is tracked separately.
- logs key events similarly to Ctrl+T for diagnosis.
- does not trigger dictation or Ctrl+T question capture.

Run:

```bash
rtk pnpm exec vitest run src/main/hotkeys/globalHotkeyService.test.ts
```

Expected: fail.

**Step 2: Implement hotkey binding**

Add L key constants after verifying uiohook keycodes in this repo. Add a new binding id:

```ts
id: 'live-caption'
matchesStart: (event) => isLiveCaptionKeycode(event.keycode) && event.ctrlKey === true
matchesStop: () => true
```

Call `showLiveCaptionConfig()` on start and no-op on stop.

**Step 3: Add overlap guards**

Guard rules:

- if dictation is recording/processing, Ctrl+L is ignored.
- if Ctrl+T question capture is recording/processing, Ctrl+L is ignored.
- if Meeting Capture is active once Task 8 lands, Ctrl+L brings the caption overlay to front only if it is attached to the meeting; otherwise it is ignored.
- while Live Caption is active, dictation and Ctrl+T should be ignored.

**Step 4: Add Settings visibility**

Add a read-only row for `Live Caption: Ctrl+L` with collision-aware copy. Do not make this configurable in the first pass unless implementation cost is low.

**Step 5: Verify**

Run:

```bash
rtk pnpm exec vitest run src/main/hotkeys/globalHotkeyService.test.ts
rtk pnpm run typecheck:node
rtk pnpm run typecheck:web
```

Expected: pass.

**Step 6: Commit**

```bash
git add src/main/hotkeys src/main/app/bootstrap.ts src/main/logging src/renderer/src/windows/main-app/SettingsDialog.tsx src/renderer/src/i18n/index.tsx
git commit -m "feat: add ctrl l live caption shortcut"
```

---

### Task 8: Meeting Capture Integration

**Files:**

- Modify: `docs/plans/2026-05-04-meeting-capture.md`
- Modify: `src/main/meetings/meetingCapturePipeline.ts` if already present
- Modify: `src/renderer/src/meeting/useMeetingCapture.ts`
- Modify: `src/renderer/src/windows/MeetingCaptureWindow.tsx`
- Modify: `src/main/windows/windowManager.ts`
- Modify: `src/main/live-caption/liveCaptionPipeline.ts`
- Modify: relevant tests created by Meeting Capture tasks

**Step 1: Update the meeting plan**

Add a note that Live Caption owns the transparent realtime overlay and Meeting Capture should reuse that display for the `Others` system-audio stream instead of building a second caption surface.

**Step 2: Share transcript state**

When Meeting Capture is active, let the meeting pipeline publish system-stream final and interim segments into the Live Caption overlay with `speaker: 'others'`.

**Step 3: Preserve Meeting Capture persistence**

Meeting Capture still persists raw transcript, mixed audio, and post-processed summary. Live Caption does not persist by default.

**Step 4: Verify**

Run the meeting tests after the current meeting pipeline lands:

```bash
rtk pnpm exec vitest run src/main/meetings/meetingCapturePipeline.test.ts src/renderer/src/meeting/useMeetingCapture.test.ts
rtk pnpm run typecheck:node
rtk pnpm run typecheck:web
```

Expected: pass.

**Step 5: Commit**

```bash
git add docs/plans/2026-05-04-meeting-capture.md src/main/meetings src/renderer/src/meeting src/renderer/src/windows/MeetingCaptureWindow.tsx src/main/windows src/main/live-caption
git commit -m "feat: reuse live captions in meeting capture"
```

---

### Task 9: Visual QA And Platform Smoke

**Files:**

- Create: `docs/manual-smoke/live-caption.md`
- Modify: `README.md` or `README_CN.md` only if product docs mention shortcuts there

**Step 1: Add manual smoke checklist**

Cover:

- Ctrl+L opens config window.
- missing DashScope key shows a clear error.
- source language and target language persist.
- start opens transparent overlay.
- overlay is draggable.
- close button stops capture immediately.
- audio stream with no audio track shows a clear error.
- interim captions update without layout jump.
- final translation replaces interim text cleanly.
- dictation and Ctrl+T are ignored while Live Caption runs.
- packaged macOS build contains `NSAudioCaptureUsageDescription`.

**Step 2: Run automated checks**

```bash
rtk pnpm exec vitest run src/main/providers/asr/GummyRealtimeTranscriptionClient.test.ts src/main/live-caption/liveCaptionPipeline.test.ts src/renderer/src/audio/useSystemAudioCapture.test.ts src/main/hotkeys/globalHotkeyService.test.ts src/renderer/src/App.test.tsx
rtk pnpm run typecheck
```

Expected: pass.

**Step 3: Run visual QA**

Start Electron with a debugging port:

```bash
rtk pnpm dev -- --inspect=0
```

Use `agent-browser` to connect and capture screenshots of:

- config window idle state.
- config window missing-key state.
- overlay with transcription only.
- overlay with translation and original text.
- overlay at small and large caption text lengths.

Expected: text does not overflow or overlap, close button remains clickable, and transparent window remains draggable.

**Step 4: Platform smoke**

- macOS 14.2+: packaged app, verify system audio is non-silent. If it is dead, test with `NSAudioCaptureUsageDescription` present and then the `MacCatapLoopbackAudioForScreenShare` flag path.
- macOS 12.7.6 or lower: document virtual device requirement if system audio cannot be captured.
- Windows: verify loopback audio works with the primary display.

**Step 5: Commit**

```bash
git add docs/manual-smoke/live-caption.md README.md README_CN.md
git commit -m "docs: add live caption smoke checklist"
```

---

## Implementation Order

1. Extend Gummy client for source language and translation.
2. Extract shared system-audio capture from Meeting Capture.
3. Persist Live Caption preferences.
4. Add config window.
5. Add caption overlay.
6. Wire main-process Live Caption pipeline and IPC.
7. Add Ctrl+L and overlap guards.
8. Attach Meeting Capture to the shared caption overlay.
9. Run visual QA and platform smoke.

## Main Risks

- System audio capture is platform-sensitive. The first implementation should fail clearly when the stream has no real audio instead of showing an empty caption window. Windows can use the `audio: 'loopback'` grant directly; macOS must be verified against Electron 39 desktop-capturer behavior and packaged plist permissions.
- Ctrl+L collides with common browser/app shortcuts. We will ship the requested default but surface it in Settings and keep the hotkey code ready for configurability.
- Translation and transcription interim updates may not be synchronized. The UI should treat final sentence pairs as authoritative.
- The current Meeting Capture work is uncommitted. Implementation should avoid broad rewrites and should review `git status` before each task.

## References

- Aliyun Gummy realtime WebSocket API: https://help.aliyun.com/zh/model-studio/real-time-websocket-api
- Electron `desktopCapturer`: https://www.electronjs.org/docs/latest/api/desktop-capturer
- Electron `setDisplayMediaRequestHandler`: https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts
