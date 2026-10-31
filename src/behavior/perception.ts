/**
 * Lightweight eyes/ears for companions: nearby players, dig/place, hurt, water, day/night.
 * Event-driven + short poll; throttled English notes for chat/prompts.
 */
import type { Bot } from 'mineflayer'
import type { CompanionPersona } from '../chat/persona.js'
import {
  envDigLine,
  envHurtLine,
  envPlaceLine,
  envTimeLine,
  envWaterLine,
  isCompanionUsername,
} from '../chat/persona.js'
import { prettyName } from './phrases.js'

// mineflayer event payloads — keep loose to match runtime + typed defs
type AnyBlock = { name?: string; position: { distanceTo: (other: { x: number; y: number; z: number }) => number } }
type AnyEntity = { position?: { distanceTo: (other: { x: number; y: number; z: number }) => number }; username?: string }

export type PerceptionKind = 'dig' | 'place' | 'nearby' | 'hurt' | 'water' | 'time' | 'peer'

export interface PerceptionEvent {
  kind: PerceptionKind
  text: string
  actor?: string
  notable: boolean
  at: number
  key: string
}

export interface PerceptionHandle {
  stop: () => void
  /** Recent observation lines for LLM / voice context. */
  recentNotes: (maxAgeMs?: number) => string[]
  /** Throttled line for proactive in-game chat, or null. */
  takeComment: (now?: number) => string | null
  /** Prefer nearby human, else peer companion. */
  nearestPlayTarget: () => string | null
  /** Snapshot of who is close right now. */
  nearbyPlayers: () => Array<{ name: string; distance: number; companion: boolean }>
  /** Nearest non-companion player username, if any. */
  nearestHuman: () => string | null
}

const VIEW_RANGE = 18
const POLL_MS = 3_000
const NOTE_TTL_MS = 45_000
const COMMENT_COOLDOWN_MS = 18_000
const DEDUPE_MS = 22_000
const MAX_NOTES = 8

const DIG_INTEREST = /(_log|wood|leaves|_planks|dirt|grass_block|stone|cobblestone|sand|gravel|ore)$/i

function dist(a: { distanceTo: (o: never) => number } | undefined, b: unknown): number | null {
  if (!a || b == null) return null
  try {
    return a.distanceTo(b as never)
  } catch {
    return null
  }
}

export function attachPerception(
  bot: Bot,
  options: {
    persona: CompanionPersona
    onEvent?: (event: PerceptionEvent) => void
  },
): PerceptionHandle {
  const notes: PerceptionEvent[] = []
  const lastKeyAt = new Map<string, number>()
  let lastCommentAt = 0
  let pendingComment: string | null = null
  let lastHealth = typeof bot.health === 'number' ? bot.health : 20
  let lastTimeBucket: 'day' | 'night' | 'unknown' = 'unknown'
  let lastNearbyKey = ''
  let stopped = false

  const buddyName = (): string | null => {
    const nearby = listNearby(bot)
    const human = nearby.find((p) => !p.companion)
    if (human) return human.name
    // Fallback: any online non-companion even if entity not loaded yet.
    for (const name of Object.keys(bot.players)) {
      if (name.toLowerCase() === bot.username.toLowerCase()) continue
      if (!isCompanionUsername(name)) return name
    }
    return null
  }


  const remember = (event: PerceptionEvent) => {
    if (stopped) return
    const prev = lastKeyAt.get(event.key) ?? 0
    if (event.at - prev < DEDUPE_MS) return
    lastKeyAt.set(event.key, event.at)
    notes.push(event)
    while (notes.length > MAX_NOTES) notes.shift()
    if (event.notable) {
      pendingComment = event.text
      options.onEvent?.(event)
    }
  }


  const actorName = (entity: AnyEntity | null | undefined): string | undefined => {
    if (!entity) return undefined
    const named = (entity as { username?: string }).username
    if (named) return named
    return undefined
  }

  const onBreakProgress = (block: AnyBlock | null, _stage: number, entity: AnyEntity | null) => {
    if (!block?.name || !bot.entity?.position) return
    if ((dist(bot.entity.position, block.position) ?? 999) > VIEW_RANGE) return
    if (!DIG_INTEREST.test(block.name) && !/log|wood|dirt|stone/i.test(block.name)) return
    const actor = actorName(entity) ?? nearestDiggerNear(block)
    const label = prettyName(block.name)
    const who = actor ?? 'someone'
    const text = envDigLine(options.persona, who, label, buddyName())
    remember({
      kind: 'dig',
      text,
      actor,
      notable: true,
      at: Date.now(),
      key: `dig:${who}:${block.name}`,
    })
  }

  const onBlockUpdate = (oldBlock: AnyBlock | null, newBlock: AnyBlock | null) => {
    if (!bot.entity?.position) return
    const pos = newBlock?.position ?? oldBlock?.position
    if (!pos || (dist(bot.entity.position, pos) ?? 999) > VIEW_RANGE) return
    const oldName = oldBlock?.name || 'air'
    const newName = newBlock?.name || 'air'
    const wasSolid = oldName !== 'air' && oldName !== 'cave_air' && oldName !== 'void_air'
    const nowSolid = newName !== 'air' && newName !== 'cave_air' && newName !== 'void_air'
    if (wasSolid && !nowSolid) {
      if (!DIG_INTEREST.test(oldName)) return
      const who = nearestDiggerNear(oldBlock!) ?? 'someone'
      remember({
        kind: 'dig',
        text: envDigLine(options.persona, who, prettyName(oldName), buddyName()),
        actor: who === 'someone' ? undefined : who,
        notable: true,
        at: Date.now(),
        key: `broke:${who}:${oldName}`,
      })
      return
    }
    if (!wasSolid && nowSolid) {
      const who = nearestDiggerNear(newBlock!) ?? 'someone'
      remember({
        kind: 'place',
        text: envPlaceLine(options.persona, who, prettyName(newName), buddyName()),
        actor: who === 'someone' ? undefined : who,
        notable: true,
        at: Date.now(),
        key: `place:${who}:${newName}`,
      })
    }
  }

  const nearestDiggerNear = (block: AnyBlock): string | undefined => {
    let best: { name: string; d: number } | null = null
    for (const name of Object.keys(bot.players)) {
      if (name.toLowerCase() === bot.username.toLowerCase()) continue
      const entity = bot.players[name]?.entity
      if (!entity?.position) continue
      const d = dist(entity.position, block.position)
      if (d == null || d > 6) continue
      if (!best || d < best.d) best = { name, d }
    }
    return best?.name
  }

  const onHealth = () => {
    const health = typeof bot.health === 'number' ? bot.health : lastHealth
    if (health < lastHealth - 0.5) {
      remember({
        kind: 'hurt',
        text: envHurtLine(options.persona, buddyName()),
        notable: true,
        at: Date.now(),
        key: 'hurt:self',
      })
    }
    lastHealth = health
  }

  const poll = () => {
    if (stopped || !bot.entity) return
    const now = Date.now()
    const nearby = listNearby(bot)
    if (nearby.length > 0) {
      const key = nearby.map((p) => `${p.name}:${Math.round(p.distance)}`).join('|')
      if (key !== lastNearbyKey) {
        lastNearbyKey = key
        const bits = nearby.slice(0, 3).map((p) => `${p.name} (~${Math.round(p.distance)}m)`)
        remember({
          kind: 'nearby',
          text: `I can see ${bits.join(', ')}.`,
          notable: false,
          at: now,
          key: `near:${nearby.map((p) => p.name).sort().join(',')}`,
        })
      }
    }

    const inWater = Boolean((bot.entity as { isInWater?: boolean }).isInWater)
    if (inWater) {
      remember({
        kind: 'water',
        text: envWaterLine(options.persona, buddyName()),
        notable: true,
        at: now,
        key: 'water:self',
      })
    }

    const ticks = bot.time?.timeOfDay
    const bucket: 'day' | 'night' | 'unknown' =
      ticks == null ? 'unknown' : ticks >= 0 && ticks < 12_000 ? 'day' : 'night'
    if (bucket !== 'unknown' && bucket !== lastTimeBucket && lastTimeBucket !== 'unknown') {
      remember({
        kind: 'time',
        text: envTimeLine(options.persona, bucket, buddyName()),
        notable: true,
        at: now,
        key: `time:${bucket}`,
      })
    }
    if (bucket !== 'unknown') lastTimeBucket = bucket
  }

  // Typed defs omit the digger entity arg; runtime still passes it.
  const onBreakProgressLoose = onBreakProgress as (...args: unknown[]) => void
  const onBlockUpdateLoose = onBlockUpdate as (...args: unknown[]) => void
  bot.on('blockBreakProgressObserved', onBreakProgressLoose)
  bot.on('blockUpdate', onBlockUpdateLoose)
  bot.on('health', onHealth)
  const timer = setInterval(poll, POLL_MS)
  // First poll shortly after attach.
  setTimeout(poll, 1_500)

  return {
    stop: () => {
      stopped = true
      clearInterval(timer)
      bot.removeListener('blockBreakProgressObserved', onBreakProgressLoose)
      bot.removeListener('blockUpdate', onBlockUpdateLoose)
      bot.removeListener('health', onHealth)
    },
    recentNotes: (maxAgeMs = NOTE_TTL_MS) => {
      const cutoff = Date.now() - maxAgeMs
      return notes.filter((n) => n.at >= cutoff).map((n) => n.text)
    },
    takeComment: (now = Date.now()) => {
      if (!pendingComment) return null
      if (now - lastCommentAt < COMMENT_COOLDOWN_MS) return null
      const line = pendingComment
      pendingComment = null
      lastCommentAt = now
      return line
    },
    nearestPlayTarget: () => {
      const nearby = listNearby(bot)
      const human = nearby.find((p) => !p.companion)
      if (human) return human.name
      return nearby[0]?.name ?? null
    },
    nearbyPlayers: () => listNearby(bot),
    nearestHuman: () => buddyName(),
  }
}

function listNearby(bot: Bot): Array<{ name: string; distance: number; companion: boolean }> {
  if (!bot.entity?.position) return []
  const out: Array<{ name: string; distance: number; companion: boolean }> = []
  for (const name of Object.keys(bot.players)) {
    if (name.toLowerCase() === bot.username.toLowerCase()) continue
    const entity = bot.players[name]?.entity
    if (!entity?.position) continue
    const distance = dist(bot.entity.position, entity.position)
    if (distance == null || distance > VIEW_RANGE) continue
    out.push({ name, distance, companion: isCompanionUsername(name) })
  }
  out.sort((a, b) => a.distance - b.distance)
  return out
}


/** Play-invite / reaction from peer chat — ignore greet spam. */
export function isPeerPlayChat(text: string, selfUsername: string): boolean {
  const lower = text.trim().toLowerCase()
  if (!lower || lower.length > 200) return false
  // Spawn / self-intro lines (may mention race/follow as canned greet).
  if (/\bi am (maple|spark)\b/.test(lower)) return false
  if (/^(hi|hey|hello|howdy|good (morning|night|afternoon)|still here)[.!\s]*$/i.test(lower)) return false
  const self = selfUsername.toLowerCase()
  if (lower.includes(self)) return true
  if (/\b(race you and|dig with me|build a bridge|explore or build|together|or dig with me)\b/i.test(lower)) {
    return true
  }
  return /\b(race|dig|bridge|follow me|come here|let'?s|challenge|chop|mine|swim)\b/i.test(lower)
}

export function peerReplyAllowed(input: {
  lastPeerReplyAt: number
  now: number
  cooldownMs?: number
}): boolean {
  const cool = input.cooldownMs ?? 28_000
  return input.now - input.lastPeerReplyAt >= cool
}
