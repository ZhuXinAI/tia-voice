# TIA Context-Aware Voice Assistant Smoke Test

## Prerequisites

- A valid DashScope API key is available.
- Microphone permission is granted to the app.
- A text input is focused in another app for the paste-back test.

## Happy Path

1. Run `pnpm dev`.
2. Confirm the onboarding window opens with a DashScope API key field.
3. Enter a DashScope API key and continue.
4. Grant Accessibility permission when prompted.
5. Hold `Right Command` on macOS or `Right Alt` on Windows.
6. Confirm the `RecordingBar` appears without taking focus away from the current app.
7. Speak a short sentence and release the hotkey.
8. Confirm the cleaned text is pasted into the focused input.
9. Re-open the main app window and confirm a history entry appears.
10. Open Settings and confirm the Providers section shows DashScope as configured.

## Failure Paths

1. Try the hotkey before saving a DashScope key.
2. Confirm the main app window opens instead of starting capture.
3. Revoke microphone permission and repeat the hotkey flow after setup.
4. Confirm the app does not paste text and the failure is logged in the dev console.
5. Clear local app data or reset onboarding in development mode.
6. Confirm the app returns to the setup flow and requires a DashScope key again.

## Native Dependency Check

1. If the hotkey never triggers, run `pnpm rebuild uiohook-napi`.
2. Restart the app and repeat the happy path.
