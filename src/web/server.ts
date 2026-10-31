import 'dotenv/config'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { extname, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, type AppConfig } from '../config.js'
import { TurnLimiter } from '../chat/limiter.js'
import { loadVoiceConfig, type VoiceConfig } from '../voice/config.js'
import { attachVoiceGateway, type VoiceConnector } from '../voice/gateway.js'
import { newWebSession, readChatBody, replyInWebWorld, type PublicChatResponse } from './chat.js'
import { attachRoomHub } from './rooms.js'
import type { Session } from '../types.js'

const PUBLIC_DIR = resolve(fileURLToPath(new URL('../../web/public/', import.meta.url)))
const SESSION_COOKIE = 'maple_sid'
const SLOW_REPLY = 'Please wait a moment. In English we can say: Let us speak a little slower.'
const BUSY_REPLY = 'Maple is helping many people right now. Please wait a minute and try again.'

export interface WebServerOptions {
  config?: AppConfig
  playerMinIntervalMs?: number
  muteMs?: number
  perIpTurns?: number
  perIpWindowMs?: number
  siteTurns?: number
  siteWindowMs?: number
  trustProxy?: boolean
  cookieSecure?: boolean
  voice?: VoiceConfig
  connectUpstream?: VoiceConnector
}

interface Visitor {
  session: Session
  seenAt: number
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

export function createWebServer(options: WebServerOptions = {}) {
  const config = options.config ?? loadConfig()
  const voice = options.voice ?? loadVoiceConfig()
  const trustProxy = options.trustProxy ?? flag(process.env.WEB_TRUST_PROXY)
  const cookieSecure = options.cookieSecure ?? flag(process.env.WEB_COOKIE_SECURE)
  const visitors = new Map<string, Visitor>()
  const ipLimiters = new Map<string, TurnLimiter>()
  const siteLimiter = new TurnLimiter(0, 1_000, options.siteTurns ?? 90, options.siteWindowMs ?? 60_000)
  let activeReplies = 0

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      console.error(`[web] ${error instanceof Error ? error.message : String(error)}`)
      sendJson(response, 500, { error: 'Something went wrong. Please try again.' })
    })
  })

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://maple.local')
    if (request.method === 'GET' && url.pathname === '/api/health') {
      const tutor = config.anthropicApiKey
        ? 'claude'
        : config.openaiApiKey
          ? 'openai'
          : 'local'
      sendJson(response, 200, {
        ok: true,
        tutor,
        model: tutor === 'claude' ? config.anthropicModel : tutor === 'openai' ? config.openaiModel : 'local',
        demo: 'browser-voxel-multiplayer',
        multiplayer: true,
        voice: voice.enabled ? 'doubao' : 'off',
      })
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/chat') {
      await handleChat(request, response)
      return
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      serveStatic(url.pathname, request.method === 'HEAD', response)
      return
    }
    sendJson(response, 405, { error: 'Method not allowed.' })
  }

  async function handleChat(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const ip = clientIp(request, trustProxy)
    const decision = takeTurn(ip)
    if (decision !== 'ok') {
      const reply = decision === 'busy' ? BUSY_REPLY : SLOW_REPLY
      sendJson(response, 429, { error: decision, reply, lines: [reply], action: 'idle' })
      return
    }
    if (activeReplies >= 4) {
      sendJson(response, 429, { error: 'busy', reply: BUSY_REPLY, lines: [BUSY_REPLY], action: 'idle' })
      return
    }

    const raw = await readBody(request)
    if (raw == null) {
      sendJson(response, 413, { error: 'That message is too large.' })
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      sendJson(response, 400, { error: 'Send a JSON chat message.' })
      return
    }
    const body = readChatBody((parsed ?? {}) as Parameters<typeof readChatBody>[0])
    if ('error' in body) {
      sendJson(response, 400, { error: body.error, reply: body.error, lines: [body.error], action: 'idle' })
      return
    }

    const { id, created } = visitorId(request)
    let visitor = visitors.get(id)
    if (!visitor) {
      visitor = { session: newWebSession(config.difficulty, config.historyTurns), seenAt: Date.now() }
      visitors.set(id, visitor)
    }
    visitor.seenAt = Date.now()
    pruneVisitors(visitors)

    activeReplies += 1
    let payload: PublicChatResponse
    try {
      payload = await replyInWebWorld({
        config,
        session: visitor.session,
        text: body.text,
        lookingAt: body.lookingAt,
        position: body.position,
        nearbyBlocks: body.nearbyBlocks,
        log: (message) => console.error(`[web] ${message}`),
      })
    } finally {
      activeReplies -= 1
    }
    if (created) {
      const secure = cookieSecure ? '; Secure' : ''
      response.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE}=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1800${secure}`,
      )
    }
    sendJson(response, 200, payload)
  }

  function takeTurn(ip: string): 'ok' | 'slow' | 'mute' | 'busy' {
    let limiter = ipLimiters.get(ip)
    if (!limiter) {
      limiter = new TurnLimiter(
        options.playerMinIntervalMs ?? 1_500,
        options.muteMs ?? 2_000,
        options.perIpTurns ?? 20,
        options.perIpWindowMs ?? 10 * 60_000,
      )
      ipLimiters.set(ip, limiter)
      if (ipLimiters.size > 2_000) {
        const oldest = ipLimiters.keys().next().value
        if (oldest) ipLimiters.delete(oldest)
      }
    }
    const decision = limiter.take(ip, Date.now())
    if (decision === 'busy') return 'busy'
    if (decision === 'mute') return 'mute'
    if (decision === 'slow') return 'slow'
    const site = siteLimiter.take('site', Date.now())
    if (site === 'busy') return 'busy'
    return 'ok'
  }

  attachVoiceGateway(server, {
    voice,
    difficulty: config.difficulty,
    ...(options.connectUpstream ? { connectUpstream: options.connectUpstream } : {}),
  })
  attachRoomHub(server, {
    config,
    playerMinIntervalMs: options.playerMinIntervalMs,
    muteMs: options.muteMs,
    perIpTurns: options.perIpTurns,
    perIpWindowMs: options.perIpWindowMs,
    siteTurns: options.siteTurns,
    siteWindowMs: options.siteWindowMs,
    trustProxy,
  })
  return server
}

function visitorId(request: IncomingMessage): { id: string; created: boolean } {
  const header = request.headers.cookie ?? ''
  const match = header.match(/(?:^|;\s*)maple_sid=([a-f0-9]{32})/)
  if (match?.[1]) return { id: match[1], created: false }
  return { id: randomBytes(16).toString('hex'), created: true }
}

function pruneVisitors(visitors: Map<string, Visitor>): void {
  const cutoff = Date.now() - 30 * 60_000
  for (const [id, visitor] of visitors) {
    if (visitor.seenAt < cutoff) visitors.delete(id)
  }
  while (visitors.size > 500) {
    const oldest = visitors.keys().next().value
    if (!oldest) break
    visitors.delete(oldest)
  }
}

function clientIp(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers['x-forwarded-for']
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0]?.trim().slice(0, 80) || 'unknown'
    }
  }
  return request.socket.remoteAddress ?? 'unknown'
}

function readBody(request: IncomingMessage): Promise<string | null> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      resolvePromise(value)
    }
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 8_000) {
        finish(null)
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => finish(Buffer.concat(chunks).toString('utf8')))
    request.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
  })
}

function serveStatic(pathname: string, head: boolean, response: ServerResponse): void {
  const route = pathname === '/' ? '/index.html' : pathname === '/play' ? '/play.html' : pathname
  const filePath = resolve(PUBLIC_DIR, `.${normalize(route)}`)
  const inside = filePath === PUBLIC_DIR || filePath.startsWith(`${PUBLIC_DIR}/`)
  if (!inside || !existsSync(filePath) || !statSync(filePath).isFile()) {
    sendJson(response, 404, { error: 'Not found.' })
    return
  }
  const type = MIME[extname(filePath)] ?? 'application/octet-stream'
  response.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  })
  if (head) {
    response.end()
    return
  }
  createReadStream(filePath).pipe(response)
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  if (response.headersSent || response.writableEnded) return
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  })
  response.end(body)
}

function flag(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes'
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  const port = Number(process.env.PORT ?? process.env.WEB_PORT ?? 47821)
  const host = process.env.WEB_HOST ?? '0.0.0.0'
  const server = createWebServer()
  server.listen(port, host, () => {
    const config = loadConfig()
    const tutor = config.anthropicApiKey ? `Claude ${config.anthropicModel}` : config.openaiApiKey ? `OpenAI ${config.openaiModel}` : 'local practice tutor'
    const voice = loadVoiceConfig()
    console.log(`[web] Multiplayer browser demo at http://127.0.0.1:${port}`)
    console.log(`[web] Tutor: ${tutor}`)
    console.log('[web] This page is not Minecraft Java. Classroom voice: npm start, then open the mic URL it prints.')
    console.log(`[web] Voice: ${voice.enabled ? 'Doubao realtime (keys stay on this server)' : 'off — type in the chat, or set DOUBAO_APP_ID and DOUBAO_ACCESS_KEY'}`)
  })
}
