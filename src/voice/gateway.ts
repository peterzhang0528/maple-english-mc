import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Server } from 'node:http'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import type { Difficulty } from '../config.js'
import { loadVoiceConfig, redactSecrets, secretValues, type VoiceConfig } from './config.js'
import { connectVoice } from './connect.js'
import { createVoiceRelay, type VoiceSocket } from './relay.js'

export type VoiceConnector = (config: VoiceConfig) => Promise<{ socket: VoiceSocket; protocol: 'duplex' | 'legacy' }>

const MAX_UPSTREAM = 4

export function attachVoiceGateway(
  server: Server,
  options: {
    voice?: VoiceConfig
    difficulty?: Difficulty
    connectUpstream?: VoiceConnector
    /** Same messages the mic page receives. The Java bot uses these to walk and chat. */
    onClientMessage?: (message: Record<string, unknown>) => void
  } = {},
): void {
  const voice = options.voice ?? loadVoiceConfig()
  const secrets = secretValues(voice)
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64_000 })
  let upstreams = 0

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? '/', 'http://maple.local')
    if (url.pathname !== '/api/voice') return
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  })

  wss.on('connection', (ws) => {
    const send = (message: Record<string, unknown>) => {
      try {
        options.onClientMessage?.(message)
      } catch (error) {
        console.error(`[voice] ${error instanceof Error ? error.message : String(error)}`)
      }
      if (ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify(message))
    }

    if (!voice.enabled) {
      send({
        type: 'status',
        voice: 'off',
        reason: 'Doubao voice keys are not set. Type English in the chat. 未配置语音密钥，打字练习仍然可用。',
      })
      return
    }

    if (upstreams >= MAX_UPSTREAM) {
      send({ type: 'error', message: 'Maple is talking with someone else. Please wait a moment.' })
      ws.close()
      return
    }

    upstreams += 1
    let relay: ReturnType<typeof createVoiceRelay> | null = null
    let released = false
    const pending: unknown[] = []
    const release = () => {
      if (released) return
      released = true
      relay?.close()
      relay = null
      upstreams = Math.max(0, upstreams - 1)
    }
    send({ type: 'status', voice: 'doubao', state: 'connecting' })

    const connect = options.connectUpstream ?? connectVoice
    void connect(voice)
      .then((upstream) => {
        if (released || ws.readyState !== WebSocket.OPEN) {
          upstream.socket.close()
          return
        }
        relay = createVoiceRelay({
          voice,
          protocol: upstream.protocol,
          upstream: upstream.socket,
          difficulty: options.difficulty,
          sendClient: send,
        })
        relay.start()
        for (const item of pending) relay.handleBrowser(item)
        pending.length = 0
        console.log(`[voice] Session protocol=${upstream.protocol}`)
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[voice] ${redactSecrets(message, secrets)}`)
        send({
          type: 'error',
          message: 'Could not reach Doubao voice. Type English in the chat. 语音暂时连不上，打字仍然可以练习。',
        })
        send({ type: 'status', voice: 'off' })
        release()
      })

    ws.on('message', (data: RawData) => {
      const text = Buffer.isBuffer(data) ? data.toString('utf8') : Buffer.from(data as ArrayBuffer).toString('utf8')
      if (text.length > 64_000) return
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        return
      }
      if (relay) relay.handleBrowser(parsed)
      else pending.push(parsed)
    })

    ws.once('close', release)
    ws.once('error', release)
  })

  server.on('close', () => {
    wss.close()
  })
}
