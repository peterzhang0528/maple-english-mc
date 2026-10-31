import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { redactSecrets, secretValues, voiceAuthHeaders, type VoiceConfig } from './config.js'
import type { VoiceSocket } from './relay.js'

export async function connectVoice(config: VoiceConfig): Promise<{ socket: VoiceSocket; protocol: 'duplex' | 'legacy' }> {
  const headers = voiceAuthHeaders(config, randomUUID())
  try {
    const socket = await openSocket(config.endpoint, headers)
    return { socket, protocol: 'duplex' }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error(`[voice] Duplex handshake failed (${redactSecrets(reason, secretValues(config))}). Trying the older realtime dialogue endpoint.`)
    const socket = await openSocket(config.legacyEndpoint, headers)
    return { socket, protocol: 'legacy' }
  }
}

function openSocket(url: string, headers: Record<string, string>): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers, handshakeTimeout: 8_000 })
    const timer = setTimeout(() => {
      ws.terminate()
      reject(new Error(`timeout connecting to voice endpoint`))
    }, 8_000)
    const fail = (error: Error) => {
      clearTimeout(timer)
      reject(error)
    }
    ws.once('open', () => {
      clearTimeout(timer)
      resolve(ws)
    })
    ws.once('error', (error) => fail(error instanceof Error ? error : new Error(String(error))))
    ws.once('unexpected-response', (_request, response) => {
      response.resume()
      fail(new Error(`HTTP ${response.statusCode ?? 0}`))
      ws.terminate()
    })
  })
}
