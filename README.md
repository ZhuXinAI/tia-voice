# TIA Voice

TIA Voice is an open source, context-aware voice assistant for desktop. Hold a global hotkey, speak, and your words are transcribed, intelligently refined, and pasted directly into the app you are using. It also provides text-to-speech playback and a smart selection toolbar — making it more than just a dictation tool.

## Comparison with Similar Tools

TIA Voice is inspired by desktop voice dictation tools like **MacWhisper**, **Wispr Flow**, and **Superwhisper**, but goes beyond pure dictation with several unique capabilities:

| Feature | TIA Voice | MacWhisper | Wispr Flow | Superwhisper |
|---|---|---|---|---|
| Push-to-talk global dictation | ✅ | ✅ | ✅ | ✅ |
| LLM-powered cleanup & rewrite | ✅ | ❌ | ✅ | ✅ |
| Custom post-process presets | ✅ | ❌ | ❌ | ❌ |
| Dictionary normalization | ✅ | ❌ | ❌ | ❌ |
| Intent routing (dictate vs. edit vs. Q&A) | ✅ | ❌ | ❌ | ❌ |
| Selection toolbar with TTS | ✅ | ❌ | ❌ | ❌ |
| Text-to-speech with word highlighting | ✅ | ❌ | ❌ | ❌ |
| Multi-provider (DashScope / OpenAI) | ✅ | ✅ (local) | ✅ | ✅ |
| BYO API key, data stays local | ✅ | N/A | ✅ | ✅ |
| Open source | ✅ | ❌ | ❌ | ❌ |

## What It Does

### Voice Dictation & Smart Paste
Hold the push-to-talk key (`Right Command` on macOS / `Right Alt` on Windows), speak naturally, and release. TIA Voice transcribes your speech, cleans it up with an LLM, and pastes the result wherever your cursor is.

### Intelligent Intent Routing
TIA Voice understands context and adapts its behavior automatically:

- **Dictation mode** — No text selected, cursor in a text field: transcribe and paste your spoken words.
- **Edit mode** — Text is selected in a text field: your voice command rewrites the selected text (e.g., select a sentence and say "make this more formal").
- **Q&A mode** — Text is selected outside a text field (e.g., in a browser): your voice question is answered based on the selected text.

### Selection Toolbar
When you select text in your browser, a floating toolbar appears with instant actions:

- **Read Out Loud** — Converts selected text to natural-sounding speech via CosyVoice TTS, with a playback window that highlights each word in sync with the audio.

### Text-to-Speech Player
Beyond the selection toolbar, TIA Voice includes a full TTS player:

- Powered by Alibaba DashScope **CosyVoice v3** for high-quality, natural speech.
- Word-level timestamp synchronization — the transcription highlights word-by-word as audio plays.
- Play/pause, seek, and progress controls in a compact floating window.

### LLM Post-Processing & Presets
Your spoken words pass through an LLM for intelligent cleanup:

- Fixes punctuation, grammar, and natural phrasing without altering meaning.
- **Built-in presets**: Formal (professional tone) and Casual (conversational tone).
- **Custom presets**: Define your own system prompts for specific writing styles.
- Toggle post-processing on or off per preset.

### Dictionary Normalization
Define phrase mappings (e.g., `"Buildmind"` → `"BuildMind"`) to automatically normalize commonly mis-transcribed terms. Dictionary entries are injected as high-priority rules into the LLM prompt.

### Usage Statistics
Track your voice usage from the home dashboard: total words spoken, average words per minute, and transcription count with a scrollable history.

### Multi-Provider Support
Choose your AI backend:

- **ASR (Speech-to-Text)**: DashScope Qwen ASR Flash / OpenAI Whisper
- **LLM (Cleanup & Intent)**: DashScope Qwen3.5 Flash / OpenAI GPT
- **TTS (Text-to-Speech)**: DashScope CosyVoice v3

Bring your own API key — your data is processed directly through your provider and never touches a third-party server.

## Setup

```bash
pnpm install
pnpm dev
```

On first launch:

1. Enter your DashScope (or OpenAI) API key in the onboarding dialog.
2. Grant macOS **Accessibility** permission when prompted (required for global hotkey and paste).
3. Start dictating with the default push-to-talk shortcut.

## Development

```bash
pnpm dev          # Start in development mode
pnpm test:run     # Run tests
pnpm typecheck    # Type-check the project
pnpm lint         # Lint the project
```

## Build

```bash
pnpm build        # Build for current platform
pnpm build:mac    # Build macOS distributable
pnpm build:win    # Build Windows distributable
pnpm build:linux  # Build Linux distributable
```

## Tech Stack

- **Runtime**: Electron + React + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui + Radix UI
- **AI SDK**: Vercel AI SDK (`ai` package)
- **Global Hotkeys**: `uiohook-napi` (native)
- **Clipboard & Paste**: `@nut-tree-fork/nut-js`
- **Text Selection Hook**: `selection-hook` (native, Chrome-based browsers)
- **TTS**: DashScope CosyVoice API with word-level timestamps

## Notes

- The default push-to-talk key is `Right Command` on macOS and `Right Alt` on Windows. You can change it to `Right Option` or `Right Control` in Settings.
- DashScope requests use `https://dashscope.aliyuncs.com/compatible-mode/v1` by default. Override with `DASHSCOPE_BASE_URL` if you need a proxy.
- Your API key is stored locally in the app settings on the current machine and never leaves your device except for direct API calls.
- `uiohook-napi` is a native dependency. If the global hotkey fails to initialize after install, run `pnpm rebuild uiohook-napi` and restart the app.
