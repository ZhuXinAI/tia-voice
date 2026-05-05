import { protocol } from 'electron'
import { createReadStream, statSync } from 'fs'
import { Readable } from 'stream'

import type { MeetingAudioFile, MeetingStore } from './types'

export const MEETING_AUDIO_PROTOCOL = 'tia-meeting-audio'

let privilegesRegistered = false

type RangeSelection = {
  start: number
  end: number
  partial: boolean
}

type ProtocolRegistrar = Pick<
  typeof protocol,
  'handle' | 'isProtocolHandled' | 'registerSchemesAsPrivileged' | 'unhandle'
>

function parseMeetingId(urlString: string): string | null {
  try {
    const url = new URL(urlString)
    if (url.protocol !== `${MEETING_AUDIO_PROTOCOL}:` || url.hostname !== 'meeting') {
      return null
    }

    const meetingId = decodeURIComponent(url.pathname.replace(/^\/+/, '').split('/')[0] ?? '')
    return meetingId.trim() ? meetingId : null
  } catch {
    return null
  }
}

function parseByteRange(rangeHeader: string | null, fileSize: number): RangeSelection | null {
  if (!rangeHeader) {
    return {
      start: 0,
      end: fileSize - 1,
      partial: false
    }
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!match) {
    return null
  }

  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) {
    return null
  }

  if (!rawStart) {
    const suffixLength = Number(rawEnd)
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return null
    }

    return {
      start: Math.max(0, fileSize - suffixLength),
      end: fileSize - 1,
      partial: true
    }
  }

  const start = Number(rawStart)
  const requestedEnd = rawEnd ? Number(rawEnd) : fileSize - 1
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= fileSize
  ) {
    return null
  }

  return {
    start,
    end: Math.min(requestedEnd, fileSize - 1),
    partial: true
  }
}

function createMeetingAudioResponse(audio: MeetingAudioFile, request: Request): Response {
  const fileSize = statSync(audio.filePath).size
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Content-Type': audio.mimeType,
    'Content-Length': String(fileSize)
  })

  if (fileSize <= 0) {
    return new Response(null, {
      status: 200,
      headers
    })
  }

  const range = parseByteRange(request.headers.get('range'), fileSize)
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes */${fileSize}`
      }
    })
  }

  const contentLength = range.end - range.start + 1
  headers.set('Content-Length', String(contentLength))
  if (range.partial) {
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${fileSize}`)
  }

  const stream = createReadStream(audio.filePath, {
    start: range.start,
    end: range.end
  })
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: range.partial ? 206 : 200,
    headers
  })
}

export function createMeetingAudioUrl(meetingId: string, version: number): string {
  const url = new URL(`${MEETING_AUDIO_PROTOCOL}://meeting/${encodeURIComponent(meetingId)}`)
  url.searchParams.set('v', String(version))
  return url.toString()
}

export function registerMeetingAudioProtocolPrivileges(
  target: Pick<ProtocolRegistrar, 'registerSchemesAsPrivileged'> = protocol
): void {
  if (privilegesRegistered) {
    return
  }

  target.registerSchemesAsPrivileged([
    {
      scheme: MEETING_AUDIO_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true
      }
    }
  ])
  privilegesRegistered = true
}

export function registerMeetingAudioProtocol(input: {
  meetingStore: Pick<MeetingStore, 'getMixedAudioFile'>
  protocol?: Pick<ProtocolRegistrar, 'handle' | 'isProtocolHandled' | 'unhandle'>
}): void {
  const target = input.protocol ?? protocol

  if (target.isProtocolHandled(MEETING_AUDIO_PROTOCOL)) {
    target.unhandle(MEETING_AUDIO_PROTOCOL)
  }

  target.handle(MEETING_AUDIO_PROTOCOL, (request) => {
    const meetingId = parseMeetingId(request.url)
    if (!meetingId) {
      return new Response(null, { status: 400 })
    }

    const audio = input.meetingStore.getMixedAudioFile(meetingId)
    if (!audio) {
      return new Response(null, { status: 404 })
    }

    try {
      return createMeetingAudioResponse(audio, request)
    } catch {
      return new Response(null, { status: 500 })
    }
  })
}
