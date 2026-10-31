import type { AppConfig } from '../config.js'
import { parseIntents } from '../behavior/intents.js'
import {
  comeOk,
  followOk,
  inspectMiss,
  inspectOk,
  lookOk,
  prettyName,
  waitOk,
} from '../behavior/phrases.js'
import { completeTurn, type ReplySource } from '../chat/turn.js'
import type { Difficulty } from '../config.js'
import { createSession, type Intent, type Session, type WorldSnapshot } from '../types.js'

export type WebAction = 'follow' | 'come' | 'stop' | 'look' | 'idle'

export interface PublicChatResponse {
  reply: string
  lines: string[]
  action: WebAction
  difficulty: Difficulty
  source: ReplySource
  intents: string[]
  lookingAt: string | null
}

export interface WebChatBody {
  text?: unknown
  lookingAt?: unknown
  position?: unknown
  nearbyBlocks?: unknown
}

const BLOCK_NAME = /^[a-z0-9_]{1,40}$/

export function planWebAction(intents: Intent[], lookingAt: string | null): { action: WebAction; notes: string[] } {
  const notes: string[] = []
  let action: WebAction = 'idle'
  if (intents.some((intent) => intent.type === 'stop')) {
    action = 'stop'
    notes.push(waitOk())
  } else if (intents.some((intent) => intent.type === 'follow')) {
    action = 'follow'
    notes.push(followOk('friend'))
  } else if (intents.some((intent) => intent.type === 'come')) {
    action = 'come'
    notes.push(comeOk('friend'))
  }
  if (intents.some((intent) => intent.type === 'look')) {
    if (action === 'idle') action = 'look'
    notes.push(lookOk('friend'))
  }
  if (intents.some((intent) => intent.type === 'inspect_block')) {
    notes.push(lookingAt ? inspectOk(lookingAt) : inspectMiss())
  }
  return { action, notes }
}

export function readChatBody(body: WebChatBody): {
  text: string
  lookingAt: string | null
  position: { x: number; y: number; z: number } | null
  nearbyBlocks: string[]
} | { error: string } {
  if (typeof body.text !== 'string') return { error: 'Say something in English.' }
  const text = body.text.replace(/\s+/g, ' ').trim()
  if (!text) return { error: 'Say something in English.' }
  if (text.length > 200) return { error: 'That message is too long. Please use a shorter sentence.' }
  return {
    text,
    lookingAt: cleanBlock(body.lookingAt),
    position: cleanPosition(body.position),
    nearbyBlocks: cleanBlocks(body.nearbyBlocks),
  }
}

export function toPublicChatResponse(
  reply: string,
  lines: string[],
  action: WebAction,
  difficulty: Difficulty,
  source: ReplySource,
  intents: Intent[],
  lookingAt: string | null,
): PublicChatResponse {
  return {
    reply,
    lines,
    action,
    difficulty,
    source,
    intents: intents.map((intent) => (intent.type === 'craft' ? `craft ${intent.query}` : intent.type)),
    lookingAt: lookingAt ? prettyName(lookingAt) : null,
  }
}

export async function replyInWebWorld(input: {
  config: AppConfig
  session: Session
  text: string
  lookingAt: string | null
  position: { x: number; y: number; z: number } | null
  nearbyBlocks: string[]
  username?: string
  log?: (message: string) => void
}): Promise<PublicChatResponse> {
  const intents = parseIntents(input.text)
  const { action, notes } = planWebAction(intents, input.lookingAt)
  const world: WorldSnapshot = {
    dimension: 'overworld',
    biome: 'plains',
    timeOfDay: 'day',
    weather: 'clear',
    position: input.position,
    heldItem: null,
    playerHeldItem: null,
    lookingAt: input.lookingAt,
    nearbyBlocks: input.nearbyBlocks.map(prettyName),
    actionNotes: notes,
    observations: [],
  }
  const turn = await completeTurn({
    config: input.config,
    session: input.session,
    username: (input.username ?? 'friend').slice(0, 20) || 'friend',
    text: input.text,
    world,
    intents,
    ...(input.log ? { log: input.log } : {}),
  })
  return toPublicChatResponse(
    turn.reply,
    turn.lines,
    action,
    input.session.difficulty,
    turn.source,
    turn.intents,
    input.lookingAt,
  )
}

export function newWebSession(difficulty: Difficulty, historyTurns: number): Session {
  return createSession(difficulty, historyTurns)
}

function cleanBlock(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim().toLowerCase()
  return BLOCK_NAME.test(name) ? name : null
}

function cleanBlocks(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const names: string[] = []
  for (const entry of value) {
    const name = cleanBlock(entry)
    if (name && !names.includes(name)) names.push(name)
    if (names.length >= 8) break
  }
  return names
}

function cleanPosition(value: unknown): { x: number; y: number; z: number } | null {
  if (!value || typeof value !== 'object') return null
  const point = value as { x?: unknown; y?: unknown; z?: unknown }
  const x = axis(point.x)
  const y = axis(point.y)
  const z = axis(point.z)
  if (x == null || y == null || z == null) return null
  return { x, y, z }
}

function axis(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(-64, Math.min(64, Math.round(value * 10) / 10))
}
