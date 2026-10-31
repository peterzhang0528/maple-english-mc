import { randomBytes } from 'node:crypto'
import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer } from 'ws'
import type { AppConfig } from '../config.js'
import { TurnLimiter } from '../chat/limiter.js'
import { newWebSession, readChatBody, replyInWebWorld } from './chat.js'
import type { Session } from '../types.js'

const MAX_PLAYERS = 4
const ROOM_IDLE_MS = 45 * 60_000
const NAME_RE = /^[\p{L}\p{N} _.-]{1,20}$/u
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export interface RoomPlayerPublic {
  id: string
  name: string
  color: number
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
}

interface RoomPlayer extends RoomPlayerPublic {
  ws: WebSocket
  seenAt: number
}

interface Room {
  code: string
  players: Map<string, RoomPlayer>
  session: Session
  createdAt: number
  seenAt: number
  greetingDone: Set<string>
}

export interface RoomHubOptions {
  config: AppConfig
  playerMinIntervalMs?: number
  muteMs?: number
  perIpTurns?: number
  perIpWindowMs?: number
  siteTurns?: number
  siteWindowMs?: number
  trustProxy?: boolean
  log?: (message: string) => void
}

const COLORS = [0x3d8a34, 0x3c88c8, 0xc45c2a, 0x8b5cf6]

export function attachRoomHub(server: Server, options: RoomHubOptions): {
  rooms: Map<string, Room>
  close: () => void
} {
  const rooms = new Map<string, Room>()
  const ipLimiters = new Map<string, TurnLimiter>()
  const siteLimiter = new TurnLimiter(0, 1_000, options.siteTurns ?? 90, options.siteWindowMs ?? 60_000)
  let activeReplies = 0
  const log = options.log ?? ((message: string) => console.error(`[room] ${message}`))
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16_000 })

  const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? '/', 'http://maple.local')
    if (url.pathname !== '/api/room') return
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  }
  server.on('upgrade', onUpgrade)

  wss.on('connection', (ws, request) => {
    const ip = clientIp(request, options.trustProxy === true)
    let joined: { room: Room; player: RoomPlayer } | null = null

    const send = (payload: Record<string, unknown>) => {
      if (ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify(payload))
    }

    ws.on('message', (raw) => {
      void handleMessage(raw).catch((error: unknown) => {
        log(error instanceof Error ? error.message : String(error))
        send({ type: 'error', message: 'Something went wrong. Please try again.' })
      })
    })

    ws.on('close', () => {
      if (!joined) return
      leaveRoom(joined.room, joined.player.id)
      joined = null
    })

    async function handleMessage(raw: WebSocket.RawData): Promise<void> {
      let parsed: unknown
      try {
        parsed = JSON.parse(String(raw))
      } catch {
        send({ type: 'error', message: 'Send a JSON room message.' })
        return
      }
      if (!parsed || typeof parsed !== 'object') return
      const message = parsed as Record<string, unknown>
      const type = typeof message.type === 'string' ? message.type : ''

      if (type === 'create' || type === 'join') {
        if (joined) {
          send({ type: 'error', message: 'You are already in a room.' })
          return
        }
        const name = cleanName(message.name)
        if (!name) {
          send({ type: 'error', message: 'Enter a short display name (1–20 letters). / 请输入昵称（1–20字）。' })
          return
        }
        let room: Room | null = null
        if (type === 'create') {
          room = makeRoom(options.config)
          rooms.set(room.code, room)
        } else {
          const code = cleanCode(message.room)
          if (!code) {
            send({ type: 'error', message: 'Enter a room code like ABCD. / 请输入房间码。' })
            return
          }
          room = rooms.get(code) ?? null
          if (!room) {
            send({ type: 'error', message: 'Room not found. Check the code. / 找不到房间，请核对房间码。' })
            return
          }
        }
        if (room.players.size >= MAX_PLAYERS) {
          send({ type: 'room_full', message: 'This room is full (max 4). / 房间已满（最多4人）。' })
          if (type === 'create') rooms.delete(room.code)
          return
        }
        const player = makePlayer(ws, name, room)
        room.players.set(player.id, player)
        room.seenAt = Date.now()
        joined = { room, player }
        send({
          type: 'welcome',
          room: room.code,
          playerId: player.id,
          you: publicPlayer(player),
          players: [...room.players.values()].map(publicPlayer),
          maxPlayers: MAX_PLAYERS,
        })
        broadcast(room, { type: 'player_joined', player: publicPlayer(player) }, player.id)
        void greetPlayer(room, player)
        pruneRooms(rooms)
        return
      }

      if (!joined) {
        send({ type: 'error', message: 'Join or create a room first.' })
        return
      }
      const { room, player } = joined
      player.seenAt = Date.now()
      room.seenAt = Date.now()

      if (type === 'move') {
        const pose = cleanPose(message)
        if (!pose) return
        const changed =
          Math.abs(pose.x - player.x) > 0.01 ||
          Math.abs(pose.y - player.y) > 0.01 ||
          Math.abs(pose.z - player.z) > 0.01 ||
          Math.abs(pose.yaw - player.yaw) > 0.02 ||
          Math.abs(pose.pitch - player.pitch) > 0.02
        Object.assign(player, pose)
        if (changed) broadcast(room, { type: 'move', playerId: player.id, ...pose }, player.id)
        return
      }

      if (type === 'say') {
        const decision = takeTurn(ip)
        if (decision !== 'ok') {
          send({
            type: 'chat',
            from: 'Maple',
            kind: 'maple',
            text:
              decision === 'busy'
                ? 'Maple is helping many people right now. Please wait a minute and try again.'
                : 'Please wait a moment. In English we can say: Let us speak a little slower.',
            action: 'idle',
          })
          return
        }
        if (activeReplies >= 4) {
          send({
            type: 'chat',
            from: 'Maple',
            kind: 'maple',
            text: 'Maple is helping many people right now. Please wait a minute and try again.',
            action: 'idle',
          })
          return
        }
        const body = readChatBody({
          text: message.text,
          lookingAt: message.lookingAt,
          position: message.position,
          nearbyBlocks: message.nearbyBlocks,
        })
        if ('error' in body) {
          send({ type: 'error', message: body.error })
          return
        }
        broadcast(room, { type: 'chat', from: player.name, kind: 'player', text: body.text, playerId: player.id })
        activeReplies += 1
        try {
          const payload = await replyInWebWorld({
            config: options.config,
            session: room.session,
            text: body.text,
            lookingAt: body.lookingAt,
            position: body.position,
            nearbyBlocks: body.nearbyBlocks,
            username: player.name,
            log,
          })
          broadcast(room, {
            type: 'chat',
            from: 'Maple',
            kind: 'maple',
            text: payload.reply,
            action: payload.action,
            playerId: player.id,
          })
        } finally {
          activeReplies -= 1
        }
        return
      }

      if (type === 'ping') {
        send({ type: 'pong', t: Date.now() })
      }
    }

    function takeTurn(remote: string): 'ok' | 'slow' | 'mute' | 'busy' {
      let limiter = ipLimiters.get(remote)
      if (!limiter) {
        limiter = new TurnLimiter(
          options.playerMinIntervalMs ?? 1_500,
          options.muteMs ?? 2_000,
          options.perIpTurns ?? 20,
          options.perIpWindowMs ?? 10 * 60_000,
        )
        ipLimiters.set(remote, limiter)
        if (ipLimiters.size > 2_000) {
          const oldest = ipLimiters.keys().next().value
          if (oldest) ipLimiters.delete(oldest)
        }
      }
      const decision = limiter.take(remote, Date.now())
      if (decision === 'busy' || decision === 'mute' || decision === 'slow') return decision
      const site = siteLimiter.take('site', Date.now())
      if (site === 'busy') return 'busy'
      return 'ok'
    }
  })

  async function greetPlayer(room: Room, player: RoomPlayer): Promise<void> {
    if (room.greetingDone.has(player.id)) return
    room.greetingDone.add(player.id)
    const others = [...room.players.values()].filter((p) => p.id !== player.id).map((p) => p.name)
    const prompt =
      others.length === 0
        ? `Hi Maple, my name is ${player.name}. Please greet me by name and invite me to build a bridge or dig together in simple English.`
        : `Hi Maple, my name is ${player.name}. Friends here: ${others.join(', ')}. Greet me by name and invite us to play together in simple English.`
    activeReplies += 1
    try {
      const payload = await replyInWebWorld({
        config: options.config,
        session: room.session,
        text: prompt,
        lookingAt: null,
        position: { x: player.x, y: player.y, z: player.z },
        nearbyBlocks: ['grass_block', 'oak_log', 'water'],
        username: player.name,
        log,
      })
      broadcast(room, {
        type: 'chat',
        from: 'Maple',
        kind: 'maple',
        text: payload.reply,
        action: payload.action,
        playerId: player.id,
      })
    } catch (error) {
      log(error instanceof Error ? error.message : String(error))
      const fallback =
        others.length === 0
          ? `Hi ${player.name}! I am Maple. Let's build a bridge or dig together. Say hello in English!`
          : `Hi ${player.name}! Welcome. Say hi to ${others[0]} and let's dig together!`
      broadcast(room, {
        type: 'chat',
        from: 'Maple',
        kind: 'maple',
        text: fallback,
        action: 'idle',
        playerId: player.id,
      })
    } finally {
      activeReplies -= 1
    }
  }

  return {
    rooms,
    close: () => {
      server.off('upgrade', onUpgrade)
      wss.close()
    },
  }
}

export function makeRoom(config: AppConfig): Room {
  return {
    code: freshCode(),
    players: new Map(),
    session: newWebSession(config.difficulty, config.historyTurns),
    createdAt: Date.now(),
    seenAt: Date.now(),
    greetingDone: new Set(),
  }
}

export function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.replace(/\s+/g, ' ').trim()
  if (!NAME_RE.test(name)) return null
  return name
}

export function cleanCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (code.length < 4 || code.length > 6) return null
  return code
}

function makePlayer(ws: WebSocket, name: string, room: Room): RoomPlayer {
  const index = room.players.size
  const angle = (index / MAX_PLAYERS) * Math.PI * 2
  return {
    id: randomBytes(8).toString('hex'),
    name,
    color: COLORS[index % COLORS.length] ?? COLORS[0]!,
    x: 0.5 + Math.cos(angle) * 1.4,
    y: 4,
    z: 0.5 + Math.sin(angle) * 1.4,
    yaw: 0,
    pitch: -0.2,
    ws,
    seenAt: Date.now(),
  }
}

function publicPlayer(player: RoomPlayer): RoomPlayerPublic {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw,
    pitch: player.pitch,
  }
}

function leaveRoom(room: Room, playerId: string): void {
  const player = room.players.get(playerId)
  if (!player) return
  room.players.delete(playerId)
  room.greetingDone.delete(playerId)
  broadcast(room, { type: 'player_left', playerId, name: player.name })
}

function broadcast(room: Room, payload: Record<string, unknown>, exceptId?: string): void {
  const raw = JSON.stringify(payload)
  for (const player of room.players.values()) {
    if (exceptId && player.id === exceptId) continue
    if (player.ws.readyState === WebSocket.OPEN) player.ws.send(raw)
  }
}

function freshCode(): string {
  let code = ''
  const bytes = randomBytes(4)
  for (let i = 0; i < 4; i += 1) {
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]
  }
  return code
}

function pruneRooms(rooms: Map<string, Room>): void {
  const cutoff = Date.now() - ROOM_IDLE_MS
  for (const [code, room] of rooms) {
    if (room.players.size === 0 && room.seenAt < cutoff) rooms.delete(code)
  }
  while (rooms.size > 200) {
    const oldest = rooms.keys().next().value
    if (!oldest) break
    rooms.delete(oldest)
  }
}

function cleanPose(message: Record<string, unknown>): {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
} | null {
  const x = axis(message.x, -64, 64)
  const y = axis(message.y, -8, 48)
  const z = axis(message.z, -64, 64)
  const yaw = axis(message.yaw, -20, 20)
  const pitch = axis(message.pitch, -2, 2)
  if (x == null || y == null || z == null || yaw == null || pitch == null) return null
  return { x, y, z, yaw, pitch }
}

function axis(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(min, Math.min(max, Math.round(value * 100) / 100))
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

