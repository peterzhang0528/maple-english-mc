import type { Difficulty } from '../config.js'
import { redactSecrets, secretValues, type VoiceConfig } from './config.js'
import {
  buildAudioAppend,
  buildClientEvent,
  buildLegacyStartSession,
  buildSessionCreate,
  buildToolResult,
  decodeLegacyFrame,
  encodeLegacyFrame,
  isOgg,
  legacyJson,
  parseDuplexEvent,
  readAudioBase64,
  readErrorMessage,
  readFunctionCalls,
  readTextPiece,
} from './protocol.js'
import { effectFromSpeech, effectFromToolCall, type MapleToolEffect } from './tools.js'
import { loadPersona, voiceGreeting } from '../chat/persona.js'

export interface VoiceSocket {
  send(data: string | Buffer): void
  close(): void
  on(event: 'message', listener: (data: Buffer | string) => void): void
  on(event: 'close', listener: () => void): void
  on(event: 'error', listener: (error: Error) => void): void
  readyState?: number
}

export interface VoiceRelay {
  start(): void
  handleBrowser(message: unknown): void
  close(): void
}

const GREETING = voiceGreeting(loadPersona())
const MAX_PCM = 16_000

function mergeText(previous: string, next: string): string {
  if (!next) return previous
  if (!previous || next.startsWith(previous)) return next
  if (previous.endsWith(next)) return previous
  return previous + next
}

export function createVoiceRelay(options: {
  voice: VoiceConfig
  protocol: 'duplex' | 'legacy'
  upstream: VoiceSocket
  sendClient: (message: Record<string, unknown>) => void
  difficulty?: Difficulty
}): VoiceRelay {
  const secrets = secretValues(options.voice)
  const world = { lookingAt: null as string | null, difficulty: options.difficulty ?? 'beginner' }
  const sessionId = `maple-${Math.random().toString(16).slice(2)}`
  let closed = false
  let ready = false
  let sessionStarted = false
  let assistant = ''
  let userText = ''
  let lastActionKey = ''
  let lastActionAt = 0

  const onMessage = (data: Buffer | string) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
    if (options.protocol === 'legacy') handleLegacy(buf)
    else handleDuplex(buf.toString('utf8'))
  }
  const onClose = () => {
    if (closed) return
    closed = true
    options.sendClient({ type: 'closed' })
  }
  options.upstream.on('message', onMessage)
  options.upstream.on('close', onClose)
  options.upstream.on('error', (error) => {
    options.sendClient({ type: 'error', message: redactSecrets(error.message, secrets) })
  })

  function sendUpstream(data: string | Buffer): void {
    if (closed) return
    if (options.upstream.readyState != null && options.upstream.readyState !== 1) return
    try {
      options.upstream.send(data)
    } catch {
      /* socket already closing */
    }
  }

  function sendJson(payload: Record<string, unknown>): void {
    sendUpstream(JSON.stringify(payload))
  }

  function sendLegacy(eventId: number, payload: Buffer, audio = false): void {
    sendUpstream(
      encodeLegacyFrame({
        eventId,
        sessionId: eventId === 1 || eventId === 2 ? undefined : sessionId,
        payload,
        audio,
      }),
    )
  }

  function publish(effect: MapleToolEffect): void {
    const intentKey = effect.intents
      .map((intent) => (intent.type === 'craft' ? `craft:${intent.query}` : intent.type))
      .join(',')
    const key = `${effect.action}|${intentKey}|${effect.output}`
    const now = Date.now()
    if (key === lastActionKey && now - lastActionAt < 4_000) return
    lastActionKey = key
    lastActionAt = now
    const moves = effect.intents.some(
      (intent) =>
        intent.type === 'follow' ||
        intent.type === 'come' ||
        intent.type === 'stop' ||
        intent.type === 'look' ||
        intent.type === 'inspect_block',
    )
    if (moves || effect.action !== 'idle') {
      options.sendClient({ type: 'action', action: effect.action, intents: effect.intents })
    }
    if (effect.chat && effect.note) options.sendClient({ type: 'maple_text', text: effect.note, final: true })
  }

  function handleDuplex(text: string): void {
    const event = parseDuplexEvent(text)
    if (!event) return
    if (event.type === 'session.created') {
      ready = true
      options.sendClient({ type: 'ready', protocol: 'duplex' })
      sendJson(buildClientEvent('speech_text_buffer.commit', { text: GREETING }))
      return
    }
    if (event.type === 'error') {
      options.sendClient({ type: 'error', message: redactSecrets(readErrorMessage(event.raw), secrets) })
      return
    }
    if (event.type === 'conversation.item.input_audio_transcription.started') {
      options.sendClient({ type: 'clear_audio' })
    }
    const piece = readTextPiece(event.type, event.raw)
    if (piece?.role === 'user') {
      if (piece.final) {
        const text = piece.text || userText
        userText = ''
        if (text) options.sendClient({ type: 'user_text', text, final: true })
        const effect = effectFromSpeech(text, world)
        if (effect) publish(effect)
      } else if (piece.text) {
        userText = mergeText(userText, piece.text)
        options.sendClient({ type: 'user_text', text: userText, final: false })
      }
    }
    if (piece?.role === 'assistant') {
      if (!piece.final) {
        assistant = mergeText(assistant, piece.text)
        if (assistant) options.sendClient({ type: 'maple_text', text: assistant, final: false })
      } else {
        const text = piece.text || assistant
        assistant = ''
        if (text) options.sendClient({ type: 'maple_text', text, final: true })
      }
    }
    const audio = readAudioBase64(event.type, event.raw)
    if (audio) {
      options.sendClient({
        type: 'audio',
        pcm: audio,
        rate: options.voice.outputRate,
        encoding: options.voice.outputFormat,
      })
    }
    if (event.type === 'response.function_call_arguments.done') {
      const calls = readFunctionCalls(event.raw)
      const results: Array<{ callId: string; text: string }> = []
      for (const call of calls) {
        const effect = effectFromToolCall(call.name, call.arguments, world)
        publish(effect)
        results.push({ callId: call.callId, text: effect.output })
      }
      if (results.length === 1) sendJson(buildToolResult(results[0].callId, results[0].text))
      else if (results.length > 1) {
        sendJson({
          type: 'conversation.item.create',
          items: results.map((result) => ({
            call_id: result.callId,
            role: 'tool',
            content: [{ type: 'input_text', text: result.text }],
          })),
        })
      }
    }
  }

  function handleLegacy(buf: Buffer): void {
    const frame = decodeLegacyFrame(buf)
    if (!frame) return
    if (frame.eventId === 50 && !sessionStarted) {
      sessionStarted = true
      sendLegacy(100, Buffer.from(JSON.stringify(buildLegacyStartSession(options.voice))))
      return
    }
    if (frame.eventId === 150 && !ready) {
      ready = true
      options.sendClient({ type: 'ready', protocol: 'legacy' })
      sendLegacy(300, Buffer.from(JSON.stringify({ content: GREETING })))
      return
    }
    const json = legacyJson(frame.payload)
    if (frame.eventId === 451 && json) {
      const results = Array.isArray(json.results) ? json.results : []
      const first = results[0]
      if (first && typeof first === 'object') {
        const row = first as Record<string, unknown>
        const text = typeof row.text === 'string' ? row.text : ''
        const interim = row.is_interim === true
        if (text) userText = text
        options.sendClient({ type: 'user_text', text, final: !interim })
        if (!interim && text) {
          const effect = effectFromSpeech(text, world)
          if (effect) publish(effect)
        }
      }
    }
    if (frame.eventId === 459 && userText) {
      options.sendClient({ type: 'user_text', text: userText, final: true })
      const effect = effectFromSpeech(userText, world)
      if (effect) publish(effect)
      userText = ''
    }
    if (frame.eventId === 550 && json && typeof json.content === 'string' && json.content) {
      options.sendClient({ type: 'maple_text', text: json.content, final: true })
    }
    if (frame.eventId === 450) options.sendClient({ type: 'clear_audio' })
    if (frame.eventId === 352 && frame.payload.length > 0 && !isOgg(frame.payload)) {
      options.sendClient({
        type: 'audio',
        pcm: frame.payload.toString('base64'),
        rate: options.voice.outputRate,
        encoding: 'pcm_s16le',
      })
    }
    if (frame.eventId === 153 || frame.eventId === 599) {
      const message = json ? readErrorMessage(json) : 'Voice service error'
      options.sendClient({ type: 'error', message: redactSecrets(message, secrets) })
    }
  }

  return {
    start() {
      if (options.protocol === 'duplex') sendJson(buildSessionCreate(options.voice))
      else sendLegacy(1, Buffer.from('{}'))
    },
    handleBrowser(message: unknown) {
      if (!message || typeof message !== 'object') return
      const row = message as Record<string, unknown>
      if (row.type === 'context') {
        world.lookingAt = typeof row.lookingAt === 'string' && /^[a-z0-9_]{1,64}$/.test(row.lookingAt) ? row.lookingAt : null
        return
      }
      if (row.type === 'interrupt') {
        if (options.protocol === 'duplex') sendJson(buildClientEvent('response.cancel'))
        else sendLegacy(515, Buffer.from('{}'))
        options.sendClient({ type: 'clear_audio' })
        return
      }
      if (row.type === 'audio' && typeof row.pcm === 'string') {
        const pcm = Buffer.from(row.pcm, 'base64')
        if (pcm.length === 0 || pcm.length > MAX_PCM || pcm.length % 2 !== 0) return
        if (options.protocol === 'duplex') sendJson(buildAudioAppend(pcm))
        else sendLegacy(200, pcm, true)
        return
      }
      if (row.type === 'stop') {
        if (options.protocol === 'duplex') {
          sendJson(buildClientEvent('input_audio_buffer.commit'))
          sendJson(buildClientEvent('input_audio_mute.commit'))
          sendJson(buildClientEvent('session.close'))
        } else {
          sendLegacy(400, Buffer.from('{}'))
          sendLegacy(102, Buffer.from('{}'))
          sendLegacy(2, Buffer.from('{}'))
        }
        closed = true
        options.upstream.close()
      }
    },
    close() {
      if (closed) return
      closed = true
      try {
        options.upstream.close()
      } catch {
        /* already closed */
      }
    },
  }
}
