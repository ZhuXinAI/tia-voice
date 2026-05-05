import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

import type {
  CreateMeetingInput,
  MeetingAudioAsset,
  MeetingAudioFile,
  MeetingCaptureRecord,
  MeetingPage,
  MeetingPageInput,
  MeetingStore,
  MeetingTranscriptSegment,
  SaveMeetingAudioInput
} from './types'

const MEETING_METADATA_FILE = 'meeting.json'
const RAW_TRANSCRIPT_FILE = 'raw-transcript.json'
const DEFAULT_MEETING_PAGE_SIZE = 20

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true })
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback
}

function normalizeOffset(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

function resolveAudioExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('webm')) {
    return '.webm'
  }
  if (normalized.includes('mp4')) {
    return '.mp4'
  }
  if (normalized.includes('wav')) {
    return '.wav'
  }
  if (normalized.includes('mpeg') || normalized.includes('mp3')) {
    return '.mp3'
  }
  return '.bin'
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeStatus(value: unknown): MeetingCaptureRecord['status'] {
  return value === 'recording' ||
    value === 'processing' ||
    value === 'completed' ||
    value === 'failed'
    ? value
    : 'recording'
}

function normalizeLlmProcessing(value: unknown): MeetingCaptureRecord['llmProcessing'] {
  return value === 'pending' || value === 'completed' || value === 'failed' ? value : 'pending'
}

function normalizeAudio(value: unknown): MeetingAudioAsset | undefined {
  const audio = value as Partial<MeetingAudioAsset> | undefined
  if (
    typeof audio?.fileName !== 'string' ||
    typeof audio.mimeType !== 'string' ||
    typeof audio.durationMs !== 'number' ||
    typeof audio.sizeBytes !== 'number'
  ) {
    return undefined
  }
  if (
    audio.fileName.includes('/') ||
    audio.fileName.includes('\\') ||
    audio.fileName.includes('\0')
  ) {
    return undefined
  }

  return {
    fileName: audio.fileName,
    mimeType: audio.mimeType,
    durationMs: audio.durationMs,
    sizeBytes: audio.sizeBytes
  }
}

function normalizeMeetingRecord(value: unknown, fallbackId: string): MeetingCaptureRecord {
  const record = value as Partial<MeetingCaptureRecord> | undefined
  const now = Date.now()
  const startedAt = normalizeNumber(record?.startedAt, normalizeNumber(record?.createdAt, now))

  return {
    id: normalizeString(record?.id, fallbackId),
    createdAt: normalizeNumber(record?.createdAt, startedAt),
    updatedAt: normalizeNumber(record?.updatedAt, now),
    startedAt,
    endedAt:
      typeof record?.endedAt === 'number' && Number.isFinite(record.endedAt)
        ? record.endedAt
        : null,
    durationMs: normalizeNumber(record?.durationMs, 0),
    status: normalizeStatus(record?.status),
    llmProcessing: normalizeLlmProcessing(record?.llmProcessing),
    title: normalizeString(record?.title, 'Meeting capture'),
    summary: normalizeString(record?.summary),
    polishedTranscript: normalizeString(record?.polishedTranscript),
    errorDetail: typeof record?.errorDetail === 'string' ? record.errorDetail : undefined,
    audio: normalizeAudio(record?.audio),
    transcriptFileName: normalizeString(record?.transcriptFileName, RAW_TRANSCRIPT_FILE)
  }
}

function normalizeTranscriptSegment(value: unknown): MeetingTranscriptSegment | null {
  const segment = value as Partial<MeetingTranscriptSegment> | undefined
  if (
    typeof segment?.id !== 'string' ||
    (segment.streamId !== 'microphone' && segment.streamId !== 'system') ||
    (segment.speaker !== 'you' && segment.speaker !== 'others') ||
    typeof segment.text !== 'string'
  ) {
    return null
  }

  return {
    id: segment.id,
    streamId: segment.streamId,
    speaker: segment.speaker,
    text: segment.text,
    beginMs: normalizeNumber(segment.beginMs, 0),
    endMs: normalizeNumber(segment.endMs, 0),
    final: segment.final === true,
    createdAt: normalizeNumber(segment.createdAt, Date.now())
  }
}

export function createMeetingStore(storageRoot: string): MeetingStore {
  ensureDirectory(storageRoot)

  function getMeetingDir(meetingId: string): string {
    return join(storageRoot, meetingId)
  }

  function getMetadataPath(meetingId: string): string {
    return join(getMeetingDir(meetingId), MEETING_METADATA_FILE)
  }

  function getTranscriptPath(meetingId: string): string {
    return join(getMeetingDir(meetingId), RAW_TRANSCRIPT_FILE)
  }

  function persistMeeting(record: MeetingCaptureRecord): void {
    ensureDirectory(getMeetingDir(record.id))
    writeFileSync(getMetadataPath(record.id), JSON.stringify(record, null, 2), 'utf8')
  }

  function readMeeting(meetingId: string): MeetingCaptureRecord | null {
    const metadataPath = getMetadataPath(meetingId)
    if (!existsSync(metadataPath)) {
      return null
    }

    try {
      return normalizeMeetingRecord(JSON.parse(readFileSync(metadataPath, 'utf8')), meetingId)
    } catch {
      return null
    }
  }

  function readTranscript(meetingId: string): MeetingTranscriptSegment[] {
    const transcriptPath = getTranscriptPath(meetingId)
    if (!existsSync(transcriptPath)) {
      return []
    }

    try {
      const parsed = JSON.parse(readFileSync(transcriptPath, 'utf8'))
      if (!Array.isArray(parsed)) {
        return []
      }

      return parsed
        .map((item) => normalizeTranscriptSegment(item))
        .filter((item): item is MeetingTranscriptSegment => item !== null)
    } catch {
      return []
    }
  }

  function writeTranscript(meetingId: string, segments: MeetingTranscriptSegment[]): void {
    ensureDirectory(getMeetingDir(meetingId))
    writeFileSync(getTranscriptPath(meetingId), JSON.stringify(segments, null, 2), 'utf8')
  }

  function readMixedAudioFile(meetingId: string): MeetingAudioFile | null {
    const meeting = readMeeting(meetingId)
    if (!meeting?.audio) {
      return null
    }

    const filePath = join(getMeetingDir(meetingId), meeting.audio.fileName)
    if (!existsSync(filePath)) {
      return null
    }

    return {
      ...meeting.audio,
      filePath
    }
  }

  return {
    createMeeting(input: CreateMeetingInput = {}): MeetingCaptureRecord {
      const startedAt = input.startedAt ?? Date.now()
      const id = `meeting-${startedAt}`
      const record: MeetingCaptureRecord = {
        id,
        createdAt: startedAt,
        updatedAt: startedAt,
        startedAt,
        endedAt: null,
        durationMs: 0,
        status: 'recording',
        llmProcessing: 'pending',
        title: 'Meeting capture',
        summary: '',
        polishedTranscript: '',
        transcriptFileName: RAW_TRANSCRIPT_FILE
      }

      ensureDirectory(getMeetingDir(id))
      persistMeeting(record)
      writeTranscript(id, [])
      return { ...record }
    },

    getMeeting(meetingId: string): MeetingCaptureRecord | null {
      const record = readMeeting(meetingId)
      return record ? { ...record, audio: record.audio ? { ...record.audio } : undefined } : null
    },

    updateMeeting(meetingId, patch) {
      const existing = readMeeting(meetingId)
      if (!existing) {
        return null
      }

      const next = normalizeMeetingRecord(
        {
          ...existing,
          ...patch,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: Date.now(),
          transcriptFileName: existing.transcriptFileName
        },
        existing.id
      )
      persistMeeting(next)
      return { ...next, audio: next.audio ? { ...next.audio } : undefined }
    },

    appendTranscriptSegment(meetingId, segment) {
      const meeting = readMeeting(meetingId)
      if (!meeting || !segment.final) {
        return null
      }

      const normalizedSegment = normalizeTranscriptSegment(segment)
      if (!normalizedSegment) {
        return null
      }

      const segments = readTranscript(meetingId)
      const withoutExisting = segments.filter((item) => item.id !== normalizedSegment.id)
      const nextSegments = [...withoutExisting, normalizedSegment].sort((a, b) => {
        if (a.beginMs !== b.beginMs) {
          return a.beginMs - b.beginMs
        }

        return a.streamId.localeCompare(b.streamId)
      })

      writeTranscript(meetingId, nextSegments)
      persistMeeting({
        ...meeting,
        updatedAt: Date.now()
      })
      return { ...normalizedSegment }
    },

    getTranscriptSegments(meetingId): MeetingTranscriptSegment[] {
      return readTranscript(meetingId).map((segment) => ({ ...segment }))
    },

    async saveMixedAudio(meetingId: string, input: SaveMeetingAudioInput) {
      const meeting = readMeeting(meetingId)
      if (!meeting) {
        return null
      }

      const fileName = `audio${resolveAudioExtension(input.mimeType)}`
      await writeFile(join(getMeetingDir(meetingId), fileName), Buffer.from(input.buffer))
      const audio: MeetingAudioAsset = {
        fileName,
        mimeType: input.mimeType,
        durationMs: input.durationMs,
        sizeBytes: input.sizeBytes ?? input.buffer.byteLength
      }

      persistMeeting({
        ...meeting,
        updatedAt: Date.now(),
        durationMs: input.durationMs,
        audio
      })
      return { ...audio }
    },

    getMixedAudioFile(meetingId: string) {
      const audio = readMixedAudioFile(meetingId)
      return audio ? { ...audio } : null
    },

    async readMixedAudio(meetingId: string) {
      const audio = readMixedAudioFile(meetingId)
      if (!audio) {
        return null
      }

      try {
        const buffer = await readFile(audio.filePath)
        const { filePath: _filePath, ...asset } = audio
        return {
          ...asset,
          buffer: new Uint8Array(buffer)
        }
      } catch {
        return null
      }
    },

    listRecentMeetings(input: MeetingPageInput = {}): MeetingPage {
      const offset = normalizeOffset(input.offset)
      const limit = normalizePositiveInteger(input.limit, DEFAULT_MEETING_PAGE_SIZE)
      const meetings = readdirSync(storageRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => readMeeting(entry.name))
        .filter((record): record is MeetingCaptureRecord => record !== null)
        .sort((a, b) => b.createdAt - a.createdAt)

      return {
        items: meetings.slice(offset, offset + limit).map((record) => ({
          ...record,
          audio: record.audio ? { ...record.audio } : undefined
        })),
        totalCount: meetings.length
      }
    }
  }
}
