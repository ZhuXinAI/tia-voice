# TIA Voice

TIA Voice is an open source Electron app for push-to-talk voice typing on your desktop. It records audio locally, sends transcription and cleanup requests to DashScope with your own API key, and pastes the cleaned result back into the app you are working in.

## What It Does

- Hold the push-to-talk key to capture speech from anywhere on your desktop.
- Use `qwen3-asr-flash` for transcription and `qwen-plus` for cleanup or rewrite intent handling.
- Keep a local history of recent voice sessions.
- Let each user bring their own DashScope key instead of relying on hosted auth or token exchange.

## Setup

```bash
pnpm install
pnpm dev
```

On first launch:

1. Enter your DashScope API key in onboarding.
2. Grant macOS Accessibility permission when prompted.
3. Start dictating with the default push-to-talk shortcut.

## Development

```bash
pnpm dev
pnpm test:run
pnpm typecheck
```

## Build

```bash
pnpm build
pnpm build:mac
pnpm build:win
pnpm build:linux
```

## Notes

- The default push-to-talk key is `Right Command` on macOS and `Right Alt` on Windows.
- DashScope requests use the compatible-mode base URL `https://dashscope.aliyuncs.com/compatible-mode/v1` by default. Override it with `DASHSCOPE_BASE_URL` if you need a proxy.
- Your DashScope key is stored locally in the app settings on the current machine.
- `uiohook-napi` is a native dependency. If the global hotkey fails to initialize after install, run `pnpm rebuild uiohook-napi` and restart the app.
