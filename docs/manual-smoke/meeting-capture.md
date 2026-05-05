# Meeting Capture Smoke Test

## Prerequisites

- A valid DashScope API key is saved in TIA Voice.
- Microphone permission is granted.
- On macOS, screen and system audio capture permission is available.
- Another app can play audible system audio during the test.

## Happy Path

1. Run `pnpm dev`.
2. Press `Control+R`.
3. Confirm the meeting capture panel appears and shows recording state.
4. Speak into the microphone.
5. Play audio from another app so the system stream has input.
6. Confirm the panel shows transcript items labeled only as `You` and `Others`.
7. Press `Control+R` again.
8. Confirm the panel moves to processing and then completes.
9. Open the main app and go to Meetings.
10. Open the newest meeting detail.
11. Confirm mixed audio playback is available.
12. Confirm raw transcript, polished transcript, summary, and title are stored.

## Failure Paths

1. Remove the DashScope key and press `Control+R`.
2. Confirm meeting capture does not start.
3. Block system audio capture and repeat the start flow.
4. Confirm the meeting fails clearly instead of silently saving microphone-only audio.
5. Force post-processing to fail with an invalid LLM key.
6. Confirm raw transcript and audio remain available while summary shows a failure state.

## Platform Notes

- macOS packaged builds must include `NSAudioCaptureUsageDescription`.
- macOS versions before 14.2 may need a virtual audio device for system audio.
- Windows should stop cleanly when `Control+R` is pressed twice quickly.
