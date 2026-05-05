# Meeting Capture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a toggleable meeting capture mode that records local microphone plus system audio, streams both to DashScope Gummy for realtime transcription, saves the merged meeting audio and raw transcript locally, then runs `MeetingPostProcessor` to produce polished transcript text and a meeting summary.

**Architecture:** Keep native orchestration, hotkeys, storage, DashScope WebSocket sessions, and post-processing in the Electron main process. Keep browser-only media capture in a dedicated renderer window that captures microphone and system loopback, mixes both streams into one saved audio file, and sends 16 kHz mono PCM chunks for each speaker stream over IPC. Store long meeting artifacts in per-meeting files under user data rather than putting raw transcript arrays into `settings.json`.

**Tech Stack:** Electron main process, React renderer, TypeScript, Node `ws`, DashScope Gummy realtime WebSocket API, Web Audio API, MediaRecorder, Vitest, existing TIA Voice settings/history patterns.

---

## Source Notes

- DashScope Gummy realtime WebSocket uses `wss://dashscope.aliyuncs.com/api-ws/v1/inference`, requires an `Authorization: Bearer <api_key>` header, starts with `run-task`, waits for `task-started`, streams binary mono audio, sends `finish-task`, then receives `task-finished`.
- Gummy `result-generated` includes `payload.output.transcription`, `begin_time`, `end_time`, `text`, and `sentence_end`; only `sentence_end: true` should be persisted as final transcript items.
- Gummy recommends roughly 100 ms binary audio sends and supports `pcm` with `sample_rate` of 16000 Hz or higher. First iteration will send 16 kHz PCM.
- Electron supports desktop/system audio capture through `navigator.mediaDevices.getDisplayMedia` plus `session.defaultSession.setDisplayMediaRequestHandler(...)` returning `audio: 'loopback'`.
- macOS 14.2+ desktop audio capture requires `NSAudioCaptureUsageDescription`; without it Electron may create a dead audio stream without a visible warning. macOS 12.7.6 and lower may require a virtual audio device for system audio.

## Product Decisions

- Default shortcut: `Control+R`.
- Shortcut behavior: toggle start/finish. Starting a meeting while dictation or Ctrl+T question capture is active is ignored. Dictation and Q&A are ignored while meeting capture is active.
- Speaker labels: use only `You` for microphone segments and `Others` for system-audio segments. Do not attempt diarization in this iteration.
- Audio file: save one mixed local meeting audio file from microphone plus system audio using the best available MediaRecorder type, usually `audio/webm;codecs=opus`.
- Transcript storage: save raw transcript JSON per meeting, not in `settings.json`.
- Post-processing: run automatically after stop. Store both `summary` and `polishedTranscript`. Failure should keep the raw transcript and audio available.
- System audio source: use primary display loopback by default. Later iterations can add per-window/source selection.

## Data Model

```ts
export type MeetingSpeaker = 'you' | 'others'

export type MeetingTranscriptSegment = {
  id: string
  streamId: 'microphone' | 'system'
  speaker: MeetingSpeaker
  text: string
  beginMs: number
  endMs: number
  final: boolean
  createdAt: number
}

export type MeetingCaptureRecord = {
  id: string
  createdAt: number
  updatedAt: number
  startedAt: number
  endedAt: number | null
  durationMs: number
  status: 'recording' | 'processing' | 'completed' | 'failed'
  llmProcessing: 'pending' | 'completed' | 'failed'
  title: string
  summary: string
  polishedTranscript: string
  errorDetail?: string
  audio?: {
    fileName: string
    mimeType: string
    durationMs: number
    sizeBytes: number
  }
  transcriptFileName: string
}
```

---

### Task 1: Meeting Store and Types

**Files:**
- Create: `src/main/meetings/types.ts`
- Create: `src/main/meetings/meetingStore.ts`
- Create: `src/main/meetings/meetingStore.test.ts`
- Modify: `src/main/app/bootstrap.ts`

**Step 1: Write the failing store tests**

Cover:
- creates a meeting folder under a supplied storage root
- appends final transcript segments to `raw-transcript.json`
- saves mixed audio to the meeting folder
- updates processing fields without losing raw transcript/audio
- lists recent meetings newest first
- trims or paginates list data without deleting raw artifacts unexpectedly

Run:

```bash
rtk pnpm exec vitest run src/main/meetings/meetingStore.test.ts
```

Expected: fail because the store does not exist.

**Step 2: Implement the store**

Use this folder shape:

```text
<userData>/meeting-captures/
  meeting-1714820000000/
    meeting.json
    raw-transcript.json
    audio.webm
```

Keep `meeting.json` as the metadata record and `raw-transcript.json` as an array of `MeetingTranscriptSegment`.

**Step 3: Add bootstrap construction**

In `src/main/app/bootstrap.ts`, create the store with:

```ts
const meetingStore = createMeetingStore(join(app.getPath('userData'), 'meeting-captures'))
```

Do not wire UI/IPC yet.

**Step 4: Verify**

Run:

```bash
rtk pnpm exec vitest run src/main/meetings/meetingStore.test.ts
rtk pnpm run typecheck:node
```

Expected: pass.

**Step 5: Commit**

```bash
git add src/main/meetings src/main/app/bootstrap.ts
git commit -m "feat: add meeting capture storage"
```

---

### Task 2: DashScope Gummy Realtime Client

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/main/providers/asr/GummyRealtimeTranscriptionClient.ts`
- Create: `src/main/providers/asr/GummyRealtimeTranscriptionClient.test.ts`

**Step 1: Add dependencies**

Add `ws` as a runtime dependency and `@types/ws` as a dev dependency if TypeScript needs it.

**Step 2: Write failing tests**

Cover:
- sends `Authorization: Bearer <key>` while connecting
- sends a `run-task` text frame with `model: 'gummy-realtime-v1'`
- uses `parameters: { sample_rate: 16000, format: 'pcm', transcription_enabled: true, translation_enabled: false }`
- queues audio chunks until `task-started`
- emits interim transcript updates when `sentence_end` is false
- emits final segments when `sentence_end` is true
- sends `finish-task` and resolves only after `task-finished`
- fails with the server `error_message` on `task-failed`

Run:

```bash
rtk pnpm exec vitest run src/main/providers/asr/GummyRealtimeTranscriptionClient.test.ts
```

Expected: fail because the client does not exist.

**Step 3: Implement the client**

Expose a small imperative API:

```ts
export type GummyRealtimeTranscriptionClient = {
  start(): Promise<void>
  sendAudioChunk(chunk: Uint8Array): void
  finish(): Promise<void>
  abort(reason?: string): void
}
```

Use callbacks for transcript updates:

```ts
onTranscript(input: {
  sentenceId: number
  beginMs: number
  endMs: number
  text: string
  final: boolean
}): void
```

**Step 4: Verify**

Run:

```bash
rtk pnpm exec vitest run src/main/providers/asr/GummyRealtimeTranscriptionClient.test.ts
rtk pnpm run typecheck:node
```

Expected: pass.

**Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/main/providers/asr/GummyRealtimeTranscriptionClient.ts src/main/providers/asr/GummyRealtimeTranscriptionClient.test.ts
git commit -m "feat: add gummy realtime transcription client"
```

---

### Task 3: Meeting Capture Renderer Engine

**Files:**
- Create: `src/renderer/src/meeting/audio/pcmEncoder.ts`
- Create: `src/renderer/src/meeting/audio/pcmEncoder.test.ts`
- Create: `src/renderer/src/meeting/useMeetingCapture.ts`
- Create: `src/renderer/src/meeting/useMeetingCapture.test.ts`
- Create: `src/renderer/src/windows/MeetingCaptureWindow.tsx`
- Create: `src/renderer/src/windows/meeting/MeetingStatusPanel.tsx`
- Create: `src/renderer/src/windows/meeting/MeetingTranscriptList.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/lib/windowRole.ts`
- Modify: `src/renderer/src/styles/window-shell.css`

**Step 1: Write failing PCM tests**

Cover:
- converts float samples to signed 16-bit little-endian PCM
- downmixes stereo or mixed channel input to mono
- resamples 48 kHz input to 16 kHz output
- emits chunks close to 100 ms at 16 kHz

Run:

```bash
rtk pnpm exec vitest run src/renderer/src/meeting/audio/pcmEncoder.test.ts
```

Expected: fail because the encoder does not exist.

**Step 2: Implement PCM helpers**

Keep the pure conversion helpers outside React so tests do not need browser media mocks.

**Step 3: Write failing capture-hook tests**

Mock:
- `navigator.mediaDevices.getUserMedia`
- `navigator.mediaDevices.getDisplayMedia`
- `MediaRecorder`
- `AudioContext`
- TIA meeting IPC methods

Cover:
- starts microphone capture using selected microphone device when provided
- starts system audio capture with `getDisplayMedia({ audio: true, video: ... })`
- stops video tracks after system-audio stream is obtained
- sends PCM chunks tagged as `microphone` or `system`
- records a mixed audio blob
- submits the mixed audio artifact on finish
- cleans all tracks when stopped or failed

**Step 4: Implement `useMeetingCapture`**

Use:
- `getUserMedia` for microphone
- `getDisplayMedia` for system audio
- `AudioContext.createMediaStreamSource` for both streams
- `MediaStreamDestination` plus `MediaRecorder` for the mixed local audio
- the PCM encoder path for per-stream chunks sent to main

If system audio fails or produces no audio track, report a blocking error for this iteration. Do not silently create a meeting with only microphone audio.

**Step 5: Build the panel UI**

`MeetingCaptureWindow` should stay under 300 lines by delegating to small components. It needs:
- recording indicator
- duration timer
- two stream health rows: `You` and `Others`
- recent final transcript items
- stop button
- processing state after stop
- error state with dismiss

**Step 6: Verify**

Run:

```bash
rtk pnpm exec vitest run src/renderer/src/meeting/audio/pcmEncoder.test.ts src/renderer/src/meeting/useMeetingCapture.test.ts src/renderer/src/App.test.tsx
rtk pnpm run typecheck:web
```

Expected: pass.

**Step 7: Commit**

```bash
git add src/renderer/src/meeting src/renderer/src/windows/MeetingCaptureWindow.tsx src/renderer/src/windows/meeting src/renderer/src/App.tsx src/renderer/src/lib/windowRole.ts src/renderer/src/styles/window-shell.css
git commit -m "feat: add meeting capture renderer"
```

---

### Task 4: Meeting IPC, Window Manager, and System Audio Permission

**Files:**
- Modify: `src/main/ipc/channels.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/renderer/src/lib/ipc.ts`
- Create: `src/main/windows/createMeetingCaptureWindow.ts`
- Create: `src/main/windows/createMeetingCaptureWindow.test.ts`
- Modify: `src/main/windows/windowManager.ts`
- Modify: `src/main/windows/windowManager.test.ts`
- Modify: `src/main/app/bootstrap.ts`
- Modify: `electron-builder.yml`

**Step 1: Write failing IPC/window tests**

Cover:
- `buildRendererRoute('meeting-capture')`
- window creation uses frameless always-on-top behavior but remains clickable
- window manager can show/update/hide meeting capture state
- `closeAllWindows()` closes the meeting window
- IPC accepts PCM chunks only for known stream IDs
- IPC accepts mixed audio completion only while a meeting is active

Run:

```bash
rtk pnpm exec vitest run src/main/windows/createMeetingCaptureWindow.test.ts src/main/windows/windowManager.test.ts
```

Expected: fail.

**Step 2: Add IPC channels**

Add channels under `IPC_CHANNELS.meetingCapture`:

```ts
command
pcmChunk
mixedAudioComplete
finishRequested
failed
state
getHistoryPage
getDetail
```

Preload should expose renderer methods:

```ts
onMeetingCommand(listener)
sendMeetingPcmChunk({ streamId, chunk, capturedAt })
submitMeetingMixedAudio(artifact)
requestFinishMeeting()
reportMeetingCaptureFailure(detail)
onMeetingState(listener)
getMeetingHistoryPage(input?)
getMeetingDetail(meetingId)
```

**Step 3: Add meeting window**

Create `createMeetingCaptureWindow` sized around `520 x 420`, `alwaysOnTop`, `skipTaskbar`, `focusable: true`, and `show: false`. Do not call `setIgnoreMouseEvents` because the stop button must work.

**Step 4: Configure desktop audio capture**

In bootstrap after app readiness, configure:

```ts
session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 0, height: 0 }
  })
  callback({ video: sources[0], audio: 'loopback' })
})
```

Add `NSAudioCaptureUsageDescription` to `electron-builder.yml` under `mac.extendInfo`.

**Step 5: Verify**

Run:

```bash
rtk pnpm exec vitest run src/main/windows/createMeetingCaptureWindow.test.ts src/main/windows/windowManager.test.ts
rtk pnpm run typecheck:node
rtk pnpm run typecheck:web
```

Expected: pass.

**Step 6: Commit**

```bash
git add src/main/ipc src/preload src/renderer/src/lib/ipc.ts src/main/windows src/main/app/bootstrap.ts electron-builder.yml
git commit -m "feat: wire meeting capture window and ipc"
```

---

### Task 5: Meeting Capture Pipeline and Control+R Toggle

**Files:**
- Create: `src/main/meetings/meetingCapturePipeline.ts`
- Create: `src/main/meetings/meetingCapturePipeline.test.ts`
- Modify: `src/main/app/bootstrap.ts`
- Modify: `src/main/hotkeys/globalHotkeyService.ts`
- Modify: `src/main/hotkeys/globalHotkeyService.test.ts`
- Modify: `src/main/logging/debugLogger.ts` if a new log namespace helper is needed

**Step 1: Write failing pipeline tests**

Cover:
- starts two Gummy realtime clients before sending renderer start command
- labels microphone transcript as `You`
- labels system transcript as `Others`
- sorts final segments by `beginMs` then stream priority
- updates meeting state as realtime segments arrive
- writes raw transcript updates through `meetingStore`
- saves mixed audio after renderer completion
- sends `finish-task` to both clients on stop
- runs no post-processing until both clients finish and mixed audio has arrived
- aborts both clients and cleans capture state on renderer failure
- blocks dictation and Q&A while meeting capture is active

Run:

```bash
rtk pnpm exec vitest run src/main/meetings/meetingCapturePipeline.test.ts
```

Expected: fail.

**Step 2: Implement the pipeline**

Expose:

```ts
beginMeetingCapture(): Promise<boolean>
receivePcmChunk(input: { streamId: 'microphone' | 'system'; chunk: Uint8Array; capturedAt: number }): void
finishMeetingCapture(source: 'shortcut' | 'renderer'): Promise<void>
receiveMixedAudio(artifact: RecordingArtifact): Promise<void>
failMeetingCapture(detail: string): void
isMeetingCaptureBusy(): boolean
```

**Step 3: Add shortcut**

Add:

```ts
const MEETING_CAPTURE_SHORTCUT = 'Control+R'
```

Register it with Electron `globalShortcut`. Use it as a toggle:
- if idle: begin meeting capture
- if recording: finish meeting capture
- if processing: ignore

Do not change existing dictation hotkey settings for this first pass.

**Step 4: Add overlap guards**

In `startDictation`, `startQuestionCapture`, and `toggleQuestionCapture`, check `meetingCapturePipeline.isMeetingCaptureBusy()` and log ignored triggers.

**Step 5: Verify**

Run:

```bash
rtk pnpm exec vitest run src/main/meetings/meetingCapturePipeline.test.ts src/main/hotkeys/globalHotkeyService.test.ts
rtk pnpm run typecheck:node
```

Expected: pass.

**Step 6: Commit**

```bash
git add src/main/meetings src/main/app/bootstrap.ts src/main/hotkeys src/main/logging
git commit -m "feat: add meeting capture pipeline"
```

---

### Task 6: MeetingPostProcessor

**Files:**
- Create: `src/main/providers/llm/MeetingPostProcessor.ts`
- Create: `src/main/providers/llm/MeetingPostProcessor.test.ts`
- Modify: `src/main/meetings/meetingCapturePipeline.ts`
- Modify: `src/main/app/bootstrap.ts`

**Step 1: Write failing tests**

Cover:
- builds a prompt from ordered `You` and `Others` transcript segments
- asks the LLM to preserve speaker labels and not invent individual identities for `Others`
- returns `summary`, `polishedTranscript`, and a short title
- marks `llmProcessing: failed` without changing raw transcript/audio when the request fails
- uses the currently selected provider's LLM model when available

Run:

```bash
rtk pnpm exec vitest run src/main/providers/llm/MeetingPostProcessor.test.ts
```

Expected: fail.

**Step 2: Implement `MeetingPostProcessor`**

Use an interface plus provider-backed implementation:

```ts
export interface MeetingPostProcessor {
  process(input: {
    segments: MeetingTranscriptSegment[]
    startedAt: number
    endedAt: number
  }): Promise<{
    title: string
    summary: string
    polishedTranscript: string
  }>
}
```

The prompt should request:
- concise title
- summary
- decisions
- action items
- polished transcript preserving `You` and `Others`

**Step 3: Wire post-processing**

After both realtime clients finish and the mixed audio is saved, invoke `MeetingPostProcessor`. Update `meeting.json` with the result. If it fails, keep status `completed` only if raw transcript and audio are saved, but set `llmProcessing: failed` and store `errorDetail`.

**Step 4: Verify**

Run:

```bash
rtk pnpm exec vitest run src/main/providers/llm/MeetingPostProcessor.test.ts src/main/meetings/meetingCapturePipeline.test.ts
rtk pnpm run typecheck:node
```

Expected: pass.

**Step 5: Commit**

```bash
git add src/main/providers/llm/MeetingPostProcessor.ts src/main/providers/llm/MeetingPostProcessor.test.ts src/main/meetings src/main/app/bootstrap.ts
git commit -m "feat: summarize meeting captures"
```

---

### Task 7: Meeting History UI

**Files:**
- Create: `src/renderer/src/windows/main-app/MeetingsRoute.tsx`
- Create: `src/renderer/src/windows/main-app/MeetingDetailDialog.tsx`
- Modify: `src/renderer/src/windows/main-app/MainSidebar.tsx`
- Modify: `src/renderer/src/windows/MainAppWindow.tsx`
- Modify: `src/renderer/src/windows/main-app/types.ts`
- Modify: `src/renderer/src/windows/main-app/defaults.ts`
- Modify: `src/renderer/src/i18n/index.tsx`
- Modify: `src/main/ipc/channels.ts`
- Modify: `src/main/app/bootstrap.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/lib/ipc.ts`
- Modify: `src/renderer/src/windows/MainAppWindow.test.tsx`

**Step 1: Write failing UI tests**

Cover:
- sidebar contains `Meetings`
- meetings route lists recent meetings
- detail dialog shows summary, polished transcript, raw transcript, and audio playback
- failed post-processing still shows raw transcript and audio
- empty state is quiet and usable

Run:

```bash
rtk pnpm exec vitest run src/renderer/src/windows/MainAppWindow.test.tsx
```

Expected: fail.

**Step 2: Implement route and detail dialog**

Reuse existing `AudioPlayer` for the mixed audio. Keep transcript rendering dense and scannable; do not use nested cards. Use `You` and `Others` labels from stored segments.

**Step 3: Add main-process meeting history IPC**

Expose:
- paged meeting list
- detail with audio bytes, raw segments, summary, polished transcript, and error state

**Step 4: Verify**

Run:

```bash
rtk pnpm exec vitest run src/renderer/src/windows/MainAppWindow.test.tsx
rtk pnpm run typecheck:web
rtk pnpm run typecheck:node
```

Expected: pass.

**Step 5: Commit**

```bash
git add src/renderer/src/windows/main-app src/renderer/src/windows/MainAppWindow.tsx src/renderer/src/i18n/index.tsx src/main/ipc src/main/app/bootstrap.ts src/preload src/renderer/src/lib/ipc.ts
git commit -m "feat: show meeting capture history"
```

---

### Task 8: End-to-End Verification and Visual QA

**Files:**
- Modify: `docs/manual-smoke/context-aware-voice-assistant.md`
- Optionally create: `docs/manual-smoke/meeting-capture.md`

**Step 1: Run automated checks**

Run:

```bash
rtk pnpm run lint
rtk pnpm run typecheck
rtk pnpm run test:run
rtk pnpm run build
```

Expected: pass.

**Step 2: Run local Electron visual QA**

Start the app with a debugging port:

```bash
rtk pnpm dev -- --inspect=5858
```

Use `agent-browser` against the Electron renderer to capture:
- meeting panel idle/loading state after `Control+R`
- active recording state with `You` and `Others` stream rows
- processing state after stop
- meetings history route
- meeting detail dialog with audio player and transcript

**Step 3: Manual audio QA**

With a valid DashScope key:
- start a meeting with `Control+R`
- speak into microphone
- play system audio from another app
- stop with `Control+R`
- confirm both Gummy sessions finish
- confirm local mixed audio plays back
- confirm raw transcript contains both `You` and `Others`
- confirm summary/polished transcript appears after processing

**Step 4: Platform risk checks**

macOS:
- packaged build includes `NSMicrophoneUsageDescription`
- packaged build includes `NSAudioCaptureUsageDescription`
- macOS 14.2+ system audio stream is not dead
- macOS 12.7.6 or lower shows a clear system-audio unsupported message unless a virtual audio input is selected

Windows:
- system loopback starts without requiring a visible picker
- `Control+R` does not leave capture stuck when pressed twice quickly

**Step 5: Commit docs/QA updates**

```bash
git add docs/manual-smoke
git commit -m "docs: add meeting capture smoke test"
```

---

## Open Questions Before Implementation

1. Should first iteration fail if system audio is unavailable, or allow a microphone-only meeting with a clear warning?
2. Should the summary use the currently selected LLM provider, or always prefer DashScope for meeting post-processing because Gummy already requires the DashScope key?
3. Do we want the first UI entry point only via `Control+R`, or should Settings also show the current meeting shortcut immediately?

## Suggested First Slice

Build Tasks 1 through 5 first. That creates the core capture path: `Control+R -> panel -> two streams -> Gummy realtime transcript -> mixed audio -> local raw meeting artifacts`. Then add `MeetingPostProcessor` and history UI in Tasks 6 and 7 once the raw capture loop is proven with real audio.
