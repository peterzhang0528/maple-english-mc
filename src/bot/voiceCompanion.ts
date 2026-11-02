import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import type { Bot } from 'mineflayer'
import type { AppConfig } from '../config.js'
import { SendQueue } from '../chat/limiter.js'
import { loadVoiceConfig, secretValues, type VoiceConfig } from '../voice/config.js'
import { bodySnapshot } from './body.js'
import { attachVoiceGateway, type VoiceConnector } from '../voice/gateway.js'
import { applySpokenTurn, createVoiceMouth, listCompanionPlayers } from './voiceBridge.js'
import { botDisplayName, voiceInstructions } from '../chat/persona.js'
import { livePlayfulnessRules } from '../behavior/fun.js'

const PAGE = readFileSync(fileURLToPath(new URL('../../web/companion/index.html', import.meta.url)))
const SCRIPT = readFileSync(fileURLToPath(new URL('../../web/companion/companion.js', import.meta.url)))

export interface JavaVoiceCompanion {
  url: string | null
  close: () => Promise<void>
}

export function voiceCompanionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.VOICE_COMPANION
  if (raw == null || raw.trim() === '') return true
  return !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase())
}

export async function startJavaVoiceCompanion(options: {
  config: AppConfig
  getBot: () => Bot | null
  voice?: VoiceConfig
  connectUpstream?: VoiceConnector
  port?: number
  host?: string
  env?: NodeJS.ProcessEnv
}): Promise<JavaVoiceCompanion> {
  const env = options.env ?? process.env
  const voice = options.voice ?? loadVoiceConfig(env)
  const host = options.host ?? ((env.VOICE_HOST ?? '127.0.0.1').trim() || '127.0.0.1')
  const port = options.port ?? readPort(env.VOICE_PORT)
  const secrets = secretValues(voice)
  const queue = new SendQueue(options.config.chatMinIntervalMs)
  const mouth = createVoiceMouth()
  let requestedPlayer: string | null = null
  let chain: Promise<void> = Promise.resolve()
  const display = botDisplayName(options.config.persona)
  const tag = options.config.persona === 'spark' ? 'spark' : 'maple'
  type PartyLine = { id: number; speaker: string; text: string; at: number }
  let partySeq = 0
  const partyLines: PartyLine[] = []
  const pushPartyLine = (speaker: string, line: string): PartyLine | null => {
    const clean = line.replace(/\s+/g, ' ').trim().slice(0, 300)
    if (!clean) return null
    partySeq += 1
    const entry: PartyLine = { id: partySeq, speaker: speaker.trim() || display, text: clean, at: Date.now() }
    partyLines.push(entry)
    while (partyLines.length > 80) partyLines.shift()
    return entry
  }

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      console.error(`[${tag}] voice page: ${error instanceof Error ? error.message : String(error)}`)
      sendJson(response, 500, { error: 'The voice window hit an error. Refresh the page.' })
    })
  })

  attachVoiceGateway(server, {
    voice,
    difficulty: options.config.difficulty,
    ...(options.connectUpstream ? { connectUpstream: options.connectUpstream } : {}),
    onClientMessage: (message) => {
      chain = chain
        .then(() =>
          applySpokenTurn({
            bot: options.getBot(),
            config: options.config,
            queue,
            mouth,
            requestedPlayer,
            message,
            secrets,
          }),
        )
        .catch((error: unknown) => {
          console.error(`[${tag}] voice: ${error instanceof Error ? error.message : String(error)}`)
        })
    },
  })

  try {
    await listen(server, port, host)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[${tag}] Mic window did not start (${message}). In-game chat still works.`)
    server.close()
    return { url: null, close: async () => {} }
  }

  const address = server.address() as AddressInfo
  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${address.port}`

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const urlPath = new URL(request.url ?? '/', 'http://maple.local')
    if (request.method === 'GET' && urlPath.pathname === '/api/health') {
      const bot = safeBot(options.getBot)
      const body = bodySnapshot(bot)
      const situate = bot
        ? (bot as { mapleSituate?: () => { hint: Record<string, unknown>; memory: string } }).mapleSituate?.()
        : null
      sendJson(response, 200, {
        ok: true,
        demo: 'java-minecraft',
        voice: openaiLiveEnabled(env) ? 'gpt-live' : voice.enabled ? 'doubao' : 'off',
        partyTts: Boolean((env.PARTY_VOICE_URL ?? '').trim()),
        sparkMuted: ['0', 'false', 'no', 'off'].includes((env.PARTY_IDLE_CHAT ?? '0').trim().toLowerCase()),
        persona: options.config.persona,
        bot: bot ? 'online' : 'offline',
        botName: options.config.username,
        server: `${options.config.host}:${options.config.port}`,
        players: listCompanionPlayers(bot),
        player: requestedPlayer,
        bodyVisible: Boolean(body),
        body,
        situate: situate ?? null,
        shortMemory: situate?.memory ?? '',
      })
      return
    }
    if (request.method === 'POST' && urlPath.pathname === '/api/player') {
      const body = await readBody(request, 2_000)
      if (body == null) {
        sendJson(response, 413, { error: 'That name is too long.' })
        return
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(body)
      } catch {
        sendJson(response, 400, { error: 'Send a JSON name.' })
        return
      }
      const username = cleanUsername(parsed && typeof parsed === 'object' ? (parsed as { username?: unknown }).username : undefined)
      if (username === 'invalid') {
        sendJson(response, 400, { error: 'Use 3-16 letters, numbers, or underscores.' })
        return
      }
      requestedPlayer = username
      console.log(`[${tag}] Voice window player: ${requestedPlayer ?? '(auto)'}`)
      sendJson(response, 200, { ok: true, player: requestedPlayer })
      return
    }
    if (request.method === 'GET' && urlPath.pathname === '/') {
      sendBytes(response, 200, 'text/html; charset=utf-8', PAGE)
      return
    }
    if (request.method === 'GET' && urlPath.pathname === '/companion.js') {
      sendBytes(response, 200, 'text/javascript; charset=utf-8', SCRIPT)
      return
    }
    if (request.method === 'POST' && urlPath.pathname === '/api/session') {
      await createLiveSession(request, response, env, options.config.persona, options.getBot)
      return
    }
    if (request.method === 'POST' && urlPath.pathname === '/api/live-event') {
      const body = await readBody(request, 8_000)
      if (body == null) {
        sendJson(response, 413, { error: 'Event too large.' })
        return
      }
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(body) as Record<string, unknown>
      } catch {
        sendJson(response, 400, { error: 'Bad JSON.' })
        return
      }
      chain = chain
        .then(() =>
          applySpokenTurn({
            bot: options.getBot(),
            config: options.config,
            queue,
            mouth,
            requestedPlayer,
            message: parsed,
            secrets,
          }),
        )
        .catch((error: unknown) => {
          console.error(`[${tag}] live-event: ${error instanceof Error ? error.message : String(error)}`)
        })
      sendJson(response, 200, { ok: true })
      return
    }
    if (request.method === 'POST' && urlPath.pathname === '/api/party-say') {
      const body = await readBody(request, 4_000)
      if (body == null) {
        sendJson(response, 413, { error: 'Line too long.' })
        return
      }
      let parsed: { speaker?: unknown; text?: unknown }
      try {
        parsed = JSON.parse(body) as { speaker?: unknown; text?: unknown }
      } catch {
        sendJson(response, 400, { error: 'Send JSON { speaker, text }.' })
        return
      }
      const speaker = typeof parsed.speaker === 'string' ? parsed.speaker.trim().slice(0, 32) : ''
      const line = typeof parsed.text === 'string' ? parsed.text : ''
      const entry = pushPartyLine(speaker || 'Spark', line)
      if (!entry) {
        sendJson(response, 400, { error: 'Need a short text line.' })
        return
      }
      console.log(`[${tag}] party-say <${entry.speaker}> ${entry.text}`)
      sendJson(response, 200, { ok: true, id: entry.id })
      return
    }
    if (request.method === 'GET' && urlPath.pathname === '/api/party-say') {
      const afterRaw = urlPath.searchParams.get('after')
      const after = afterRaw != null && afterRaw !== '' ? Number(afterRaw) : 0
      const since = Number.isFinite(after) ? after : 0
      const lines = partyLines.filter((item) => item.id > since)
      sendJson(response, 200, { ok: true, lines, latest: partySeq })
      return
    }
    sendJson(response, 404, { error: 'Not found.' })
  }

  return {
    url,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve())
      }),
  }
}

function safeBot(getBot: () => Bot | null): Bot | null {
  try {
    return getBot()
  } catch {
    return null
  }
}

function readPort(raw: string | undefined): number {
  const text = (raw ?? '47822').trim() || '47822'
  const value = Number(text)
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new Error('VOICE_PORT must be an integer from 0 to 65535')
  }
  return value
}

function cleanUsername(value: unknown): string | null | 'invalid' {
  if (typeof value !== 'string') return 'invalid'
  const name = value.trim()
  if (!name) return null
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return 'invalid'
  return name
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('error', onError)
      reject(error)
    }
    server.once('error', onError)
    server.listen(port, host, () => {
      server.off('error', onError)
      resolve()
    })
  })
}

function readBody(request: IncomingMessage, maxBytes = 2_000): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
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

function openaiLiveEnabled(env: NodeJS.ProcessEnv): boolean {
  const flag = (env.OPENAI_LIVE ?? '').trim().toLowerCase()
  if (['0', 'false', 'no', 'off'].includes(flag)) return false
  return Boolean(env.OPENAI_API_KEY?.trim())
}

async function createLiveSession(
  request: IncomingMessage,
  response: ServerResponse,
  env: NodeJS.ProcessEnv,
  persona: AppConfig['persona'],
  optionsGetBot?: () => Bot | null,
): Promise<void> {
  const key = env.OPENAI_API_KEY?.trim()
  if (!key) {
    sendJson(response, 503, { error: 'Set OPENAI_API_KEY for GPT Live.' })
    return
  }
  const body = await readBody(request, 200_000)
  if (body == null) {
    sendJson(response, 413, { error: 'SDP offer too large.' })
    return
  }
  let sdp = ''
  try {
    const parsed = JSON.parse(body) as { sdp?: unknown }
    // Do not trimEnd(): OpenAI's SDP parser returns EOF if the final newline is missing.
    sdp = typeof parsed.sdp === 'string' ? parsed.sdp.replace(/^\uFEFF/, '').replace(/^\s+/, '') : ''
  } catch {
    sendJson(response, 400, { error: 'Send JSON { sdp }.' })
    return
  }
  if (!sdp.trim()) {
    sendJson(response, 400, { error: 'An SDP offer is required.' })
    return
  }
  if (!sdp.endsWith('\n')) sdp += '\n'

  const model = (env.OPENAI_LIVE_MODEL ?? 'gpt-live-1').trim() || 'gpt-live-1'
  const backend = (env.OPENAI_LIVE_BACKEND_MODEL ?? 'gpt-5.6-terra').trim() || 'gpt-5.6-terra'
  const who = botDisplayName(persona)
  const buddy = persona === 'spark' ? 'Maple' : 'Spark'
  const spoken = voiceInstructions(persona)
  const play = livePlayfulnessRules()
  const bodyRule = `You already have a real visible player body named ${who} inside the Java Minecraft world (Mineflayer client on 127.0.0.1:25565, SkinsRestorer skin). You walk, follow, dig, and chat in-game. ${buddy} may stay silent (muted). Never say you have no body, cannot join, or are only a voice. If asked about your body, say: Yes — look for the player named ${who} near you; I can walk to you.`
  let memoryBit = ''
  try {
    const liveBot = optionsGetBot?.()
    const situate = liveBot
      ? (liveBot as { mapleSituate?: () => { hint: Record<string, unknown>; memory: string } }).mapleSituate?.()
      : null
    if (situate?.memory) memoryBit = ` Short memory of recent turns: ${situate.memory}.`
    else if (situate?.hint) memoryBit = ` Current situate: ${JSON.stringify(situate.hint)}.`
  } catch {
    /* ignore */
  }
  const payload = {
    session: {
      model,
      instructions: `${spoken} ${play} ${bodyRule}${memoryBit} Short kid-catchable phrases. Buddy first. React to what the kid just said; propose varied mini-quests when quiet; notice nearby blocks/mobs/time. Beginner level: common words, short sentences.`,
      delegation: {
        type: 'responses',
        responses: {
          model: backend,
          instructions: `You help ${who}, a warm English playmate with a real Minecraft body named ${who}. ${buddy} may be silent. Prefer fresh, short spoken English for kids. React to the kid's last words. No markdown. No secrets.`,
        },
      },
    },
    transport: { type: 'webrtc', sdp },
  }

  // macOS system proxy is on 127.0.0.1:7897; Node fetch ignores it, so use curl.
  const proxy =
    (env.HTTPS_PROXY || env.HTTP_PROXY || env.ALL_PROXY || 'http://127.0.0.1:7897').trim() ||
    'http://127.0.0.1:7897'
  const requestBody = JSON.stringify(payload)
  console.log(`[voice] GPT Live offer sdpChars=${sdp.length} bodyBytes=${Buffer.byteLength(requestBody)}`)
  try {
    const { writeFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    await writeFile(join(process.cwd(), '.local-logs/last-live-request.json'), requestBody, 'utf8')
  } catch (error) {
    console.error(`[voice] could not save live request: ${error instanceof Error ? error.message : String(error)}`)
  }
  const { status, text } = await postOpenAILive(key, requestBody, proxy)
  if (status < 200 || status >= 300) {
    console.error(`[voice] GPT Live session failed: HTTP ${status} ${text.slice(0, 400)}`)
    let message = `GPT Live failed (${status}). Check the API key, Live access, and proxy ${proxy}.`
    if (status === 429 || /credit_balance_exhausted|insufficient_quota|no credits/i.test(text)) {
      message = 'OpenAI 余额不足（credit_balance_exhausted）。请到 platform.openai.com 充值，或换有额度的公司 key；也可先切回豆包语音。'
    } else if (/invalid_offer|unmarshal SDP|EOF/i.test(text)) {
      message = `GPT Live SDP 无效 (${status}): ${text.slice(0, 180)}`
    }
    sendJson(response, status === 401 ? 401 : 502, { error: message })
    return
  }
  if (response.headersSent || response.writableEnded) return
  response.writeHead(201, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  })
  response.end(text)
}

async function postOpenAILive(
  key: string,
  body: string,
  proxy: string,
): Promise<{ status: number; text: string }> {
  const { spawn } = await import('node:child_process')
  const { writeFile, unlink } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const file = join(tmpdir(), `maple-live-${process.pid}-${Date.now()}.json`)
  await writeFile(file, body, 'utf8')
  try {
    const args = [
      '-sS',
      '-x',
      proxy,
      '--connect-timeout',
      '20',
      '-o',
      '-',
      '-w',
      '\n__HTTP_STATUS__%{http_code}',
      '-H',
      `Authorization: Bearer ${key}`,
      '-H',
      'Content-Type: application/json',
      '-X',
      'POST',
      '--data-binary',
      `@${file}`,
      'https://api.openai.com/v1/live/sessions',
    ]
    const text = await new Promise<string>((resolve, reject) => {
      const child = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] })
      const out: Buffer[] = []
      const err: Buffer[] = []
      child.stdout.on('data', (c) => out.push(c))
      child.stderr.on('data', (c) => err.push(c))
      child.on('error', reject)
      child.on('close', (code) => {
        if (code !== 0 && out.length === 0) {
          reject(new Error(Buffer.concat(err).toString('utf8') || `curl exit ${code}`))
          return
        }
        resolve(Buffer.concat(out).toString('utf8'))
      })
    })
    const marker = '\n__HTTP_STATUS__'
    const at = text.lastIndexOf(marker)
    if (at < 0) return { status: 502, text }
    const status = Number(text.slice(at + marker.length)) || 502
    return { status, text: text.slice(0, at) }
  } finally {
    await unlink(file).catch(() => {})
  }
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

function sendBytes(response: ServerResponse, status: number, type: string, body: Buffer): void {
  if (response.headersSent || response.writableEnded) return
  response.writeHead(status, {
    'Content-Type': type,
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  })
  response.end(body)
}
