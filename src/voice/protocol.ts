import { gunzipSync } from 'node:zlib'
import { randomUUID } from 'node:crypto'
import {
  type VoiceConfig,
  DEFAULT_DUPLEX_MODEL,
} from './config.js'
import { loadPersona, speakingStyle, botDisplayName, voiceInstructions } from '../chat/persona.js'

export const MAPLE_TOOL_NAME = 'maple_action'

const CONNECT_EVENTS = new Set([1, 2, 50, 51, 52])

export function mapleInstructions(): string {
  return voiceInstructions(loadPersona())
}

export function mapleToolSchema(): Record<string, unknown> {
  return {
    type: 'function',
    name: MAPLE_TOOL_NAME,
    description:
      'Move Maple or teach a real Minecraft crafting recipe or block. Call this when the player asks to follow, come here, stop, wait, look, inspect a block, or craft/make an item.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['follow', 'come', 'stop', 'look', 'inspect_block', 'craft'],
          description: 'What Maple should do.',
        },
        item: {
          type: 'string',
          description: 'Item to craft, such as wooden pickaxe. Required when action is craft.',
        },
        block: {
          type: 'string',
          description: 'Block id, such as oak_log. Omit to use the block the player is looking at.',
        },
      },
      required: ['action'],
    },
  }
}

export function eventId(): string {
  return `evt_${randomUUID()}`
}

export function buildSessionCreate(config: VoiceConfig): Record<string, unknown> {
  return {
    type: 'session.create',
    event_id: eventId(),
    session: {
      model: config.model || DEFAULT_DUPLEX_MODEL,
      instructions: mapleInstructions(),
      audio: {
        input: { format: { type: 'pcm', rate: config.inputRate } },
        output: {
          format: { type: config.outputFormat, rate: config.outputRate },
          speed: 0,
          loudness: 0,
          voice: config.voice,
        },
      },
      tools: [mapleToolSchema()],
    },
    extension: { asr: {}, tts: {}, dialog: {} },
  }
}

export function buildAudioAppend(pcm: Buffer): Record<string, unknown> {
  return {
    type: 'input_audio_buffer.append',
    event_id: eventId(),
    audio: pcm.toString('base64'),
  }
}

export function buildClientEvent(type: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { type, event_id: eventId(), ...extra }
}

export function buildToolResult(callId: string, text: string): Record<string, unknown> {
  return {
    type: 'conversation.item.create',
    event_id: eventId(),
    items: [
      {
        call_id: callId,
        role: 'tool',
        content: [{ type: 'input_text', text }],
      },
    ],
  }
}

export function buildLegacyStartSession(config: VoiceConfig): Record<string, unknown> {
  return {
    asr: { extra: { end_smooth_window_ms: 800 } },
    dialog: {
      bot_name: botDisplayName(loadPersona()),
      system_role: mapleInstructions(),
      speaking_style: speakingStyle(loadPersona()),
      extra: {
        model: config.legacyModel,
        input_mod: 'keep_alive',
        strict_audit: true,
      },
    },
    tts: {
      speaker: config.voice,
      audio_config: {
        channel: 1,
        format: 'pcm_s16le',
        sample_rate: config.outputRate,
      },
    },
  }
}

export interface ParsedEvent {
  type: string
  raw: Record<string, unknown>
}

export function parseDuplexEvent(text: string): ParsedEvent | null {
  try {
    const value = JSON.parse(text) as unknown
    if (!value || typeof value !== 'object') return null
    const raw = value as Record<string, unknown>
    if (typeof raw.type !== 'string' || !raw.type) return null
    return { type: raw.type, raw }
  } catch {
    return null
  }
}

export interface FunctionCall {
  callId: string
  name: string
  arguments: string
}

export function readFunctionCalls(raw: Record<string, unknown>): FunctionCall[] {
  const items = Array.isArray(raw.items) ? raw.items : []
  const calls: FunctionCall[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const callId = asString(row.call_id ?? row.callId)
    const name = asString(row.name)
    let args: unknown = row.arguments ?? row.args
    if (args && typeof args === 'object') args = JSON.stringify(args)
    if (callId && name && typeof args === 'string') calls.push({ callId, name, arguments: args })
  }
  return calls
}

export function readAudioBase64(type: string, raw: Record<string, unknown>): string | null {
  if (type !== 'response.output_audio.delta') return null
  const value = raw.delta ?? raw.audio
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function readTextPiece(type: string, raw: Record<string, unknown>): { role: 'user' | 'assistant'; text: string; final: boolean } | null {
  if (type === 'conversation.item.input_audio_transcription.delta') {
    return { role: 'user', text: textField(raw), final: false }
  }
  if (type === 'conversation.item.input_audio_transcription.completed') {
    return { role: 'user', text: textField(raw), final: true }
  }
  if (type === 'response.output_text.delta') {
    return { role: 'assistant', text: textField(raw), final: false }
  }
  if (type === 'response.output_text.done') {
    return { role: 'assistant', text: textField(raw), final: true }
  }
  return null
}

export function readErrorMessage(raw: Record<string, unknown>): string {
  const error = raw.error
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string') return message
  }
  if (typeof raw.message === 'string') return raw.message
  return 'Voice service error'
}

export interface LegacyFrame {
  eventId: number
  sessionId: string | null
  payload: Buffer
  audio: boolean
}

export function encodeLegacyFrame(input: {
  eventId: number
  sessionId?: string
  payload: Buffer
  audio?: boolean
}): Buffer {
  const messageType = input.audio ? 0b0010 : 0b0001
  const serial = input.audio ? 0b0000 : 0b0001
  const header = Buffer.from([(0b0001 << 4) | 0b0001, (messageType << 4) | 0b0100, (serial << 4) | 0b0000, 0x00])
  const event = Buffer.alloc(4)
  event.writeUInt32BE(input.eventId, 0)
  const parts: Buffer[] = [header, event]
  if (input.sessionId != null && !CONNECT_EVENTS.has(input.eventId)) {
    const id = Buffer.from(input.sessionId)
    const size = Buffer.alloc(4)
    size.writeUInt32BE(id.length, 0)
    parts.push(size, id)
  }
  const size = Buffer.alloc(4)
  size.writeUInt32BE(input.payload.length, 0)
  parts.push(size, input.payload)
  return Buffer.concat(parts)
}

export function decodeLegacyFrame(buf: Buffer): LegacyFrame | null {
  if (buf.length < 8) return null
  const headerSize = (buf[0] & 0x0f) * 4
  if (headerSize < 4 || buf.length < headerSize + 4) return null
  const messageType = buf[1] >> 4
  const flags = buf[1] & 0x0f
  const compression = buf[2] & 0x0f
  let offset = headerSize
  let eventId = 0
  if ((flags & 0b0100) !== 0) {
    if (offset + 4 > buf.length) return null
    eventId = buf.readUInt32BE(offset)
    offset += 4
  }
  if (messageType === 0b1111) {
    if (offset + 4 > buf.length) return null
    offset += 4
  }

  let sessionId: string | null = null
  if (!CONNECT_EVENTS.has(eventId) && offset + 8 <= buf.length) {
    const idLen = buf.readUInt32BE(offset)
    const payloadAt = offset + 4 + idLen
    if (idLen <= 128 && payloadAt + 4 <= buf.length) {
      const payloadSize = buf.readUInt32BE(payloadAt)
      if (payloadSize === buf.length - (payloadAt + 4)) {
        sessionId = buf.subarray(offset + 4, payloadAt).toString('utf8')
        offset = payloadAt
      }
    }
  }

  if (offset + 4 > buf.length) return null
  const payloadSize = buf.readUInt32BE(offset)
  const start = offset + 4
  if (payloadSize > buf.length - start) return null
  let payload: Buffer = buf.subarray(start, start + payloadSize)
  if (compression === 1) {
    try {
      payload = gunzipSync(payload)
    } catch {
      return null
    }
  }
  return {
    eventId,
    sessionId,
    payload,
    audio: messageType === 0b1011 || messageType === 0b0010,
  }
}

export function legacyJson(payload: Buffer): Record<string, unknown> | null {
  if (payload.length === 0 || payload[0] !== 0x7b) return null
  try {
    const value = JSON.parse(payload.toString('utf8')) as unknown
    if (!value || typeof value !== 'object') return null
    return value as Record<string, unknown>
  } catch {
    return null
  }
}

export function isOgg(payload: Buffer): boolean {
  return payload.length >= 4 && payload.subarray(0, 4).toString('ascii') === 'OggS'
}

function textField(raw: Record<string, unknown>): string {
  const value = raw.text ?? raw.transcript ?? raw.delta ?? raw.content
  return typeof value === 'string' ? value : ''
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
