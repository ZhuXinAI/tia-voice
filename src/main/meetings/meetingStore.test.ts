import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { createMeetingStore } from './meetingStore'
import type { MeetingTranscriptSegment } from './types'

describe('createMeetingStore', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  function createRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'tia-voice-meetings-'))
    roots.push(root)
    return root
  }

  function readJson<T>(path: string): T {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  }

  function segment(input: Partial<MeetingTranscriptSegment> = {}): MeetingTranscriptSegment {
    return {
      id: input.id ?? `segment-${Date.now()}`,
      streamId: input.streamId ?? 'microphone',
      speaker: input.speaker ?? 'you',
      text: input.text ?? 'We should ship the meeting capture slice.',
      beginMs: input.beginMs ?? 100,
      endMs: input.endMs ?? 2400,
      final: input.final ?? true,
      createdAt: input.createdAt ?? 1714820000500
    }
  }

  it('creates a meeting folder under a supplied storage root', () => {
    const root = createRoot()
    const store = createMeetingStore(root)

    const meeting = store.createMeeting({ startedAt: 1714820000000 })

    expect(meeting.id).toBe('meeting-1714820000000')
    expect(existsSync(join(root, 'meeting-1714820000000'))).toBe(true)
    expect(readJson(join(root, 'meeting-1714820000000', 'meeting.json'))).toMatchObject({
      id: 'meeting-1714820000000',
      status: 'recording',
      llmProcessing: 'pending',
      transcriptFileName: 'raw-transcript.json'
    })
    expect(readJson(join(root, 'meeting-1714820000000', 'raw-transcript.json'))).toEqual([])
  })

  it('appends final transcript segments to raw-transcript.json', () => {
    const root = createRoot()
    const store = createMeetingStore(root)
    const meeting = store.createMeeting({ startedAt: 1714820000000 })

    store.appendTranscriptSegment(
      meeting.id,
      segment({ id: 'interim-1', text: 'partial words', final: false })
    )
    store.appendTranscriptSegment(meeting.id, segment({ id: 'final-1', text: 'Final words.' }))

    const transcript = readJson<MeetingTranscriptSegment[]>(
      join(root, meeting.id, 'raw-transcript.json')
    )
    const metadata = readJson<Record<string, unknown>>(join(root, meeting.id, 'meeting.json'))

    expect(transcript).toEqual([expect.objectContaining({ id: 'final-1', text: 'Final words.' })])
    expect(metadata).not.toHaveProperty('transcript')
    expect(metadata).not.toHaveProperty('segments')
  })

  it('saves mixed audio to the meeting folder', async () => {
    const root = createRoot()
    const store = createMeetingStore(root)
    const meeting = store.createMeeting({ startedAt: 1714820000000 })

    const audio = await store.saveMixedAudio(meeting.id, {
      mimeType: 'audio/webm;codecs=opus',
      buffer: new Uint8Array([1, 2, 3, 4]),
      durationMs: 3200
    })

    expect(audio).toEqual({
      fileName: 'audio.webm',
      mimeType: 'audio/webm;codecs=opus',
      durationMs: 3200,
      sizeBytes: 4
    })
    expect(existsSync(join(root, meeting.id, 'audio.webm'))).toBe(true)
    expect(store.getMeeting(meeting.id)?.audio).toEqual(audio)
  })

  it('updates processing fields without losing raw transcript or audio', async () => {
    const root = createRoot()
    const store = createMeetingStore(root)
    const meeting = store.createMeeting({ startedAt: 1714820000000 })

    store.appendTranscriptSegment(meeting.id, segment({ id: 'final-1' }))
    await store.saveMixedAudio(meeting.id, {
      mimeType: 'audio/webm',
      buffer: new Uint8Array([5, 6, 7]),
      durationMs: 1200
    })

    store.updateMeeting(meeting.id, {
      endedAt: 1714820015000,
      durationMs: 15000,
      status: 'completed',
      llmProcessing: 'completed',
      summary: 'The meeting capture store is ready.',
      polishedTranscript: 'We should ship the meeting capture slice.'
    })

    const reloaded = createMeetingStore(root)
    expect(reloaded.getMeeting(meeting.id)).toMatchObject({
      status: 'completed',
      llmProcessing: 'completed',
      summary: 'The meeting capture store is ready.',
      audio: {
        fileName: 'audio.webm',
        sizeBytes: 3
      }
    })
    expect(reloaded.getTranscriptSegments(meeting.id)).toHaveLength(1)
    expect(existsSync(join(root, meeting.id, 'audio.webm'))).toBe(true)
  })

  it('lists recent meetings newest first', () => {
    const root = createRoot()
    const store = createMeetingStore(root)

    const oldest = store.createMeeting({ startedAt: 1714820000000 })
    const newest = store.createMeeting({ startedAt: 1714820020000 })
    const middle = store.createMeeting({ startedAt: 1714820010000 })

    expect(store.listRecentMeetings().items.map((item) => item.id)).toEqual([
      newest.id,
      middle.id,
      oldest.id
    ])
  })

  it('paginates list data without deleting raw artifacts unexpectedly', async () => {
    const root = createRoot()
    const store = createMeetingStore(root)

    const oldest = store.createMeeting({ startedAt: 1714820000000 })
    const middle = store.createMeeting({ startedAt: 1714820010000 })
    const newest = store.createMeeting({ startedAt: 1714820020000 })

    store.appendTranscriptSegment(oldest.id, segment({ id: 'oldest-final' }))
    await store.saveMixedAudio(oldest.id, {
      mimeType: 'audio/webm',
      buffer: new Uint8Array([9, 8, 7]),
      durationMs: 900
    })

    const page = store.listRecentMeetings({ limit: 1 })

    expect(page).toMatchObject({
      totalCount: 3,
      items: [{ id: newest.id }]
    })
    expect(page.items).toHaveLength(1)
    expect(store.getMeeting(middle.id)).not.toBeNull()
    expect(existsSync(join(root, oldest.id, 'raw-transcript.json'))).toBe(true)
    expect(existsSync(join(root, oldest.id, 'audio.webm'))).toBe(true)
  })
})
