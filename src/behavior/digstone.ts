/**
 * Dig-three-stones tutorial (digstone / dig_stone / digStone).
 * Maple says hello, asks a name, then invites play. Only after that does she
 * lead to stone. Chat cannot skip the dig. A name reply is the one chat that
 * moves a step; silence falls back to the join username.
 *
 * Perception dig notes dedupe by block name, so the guide counts real breaks.
 */
export type DigStoneStep = 'hello' | 'name' | 'invite' | 'find' | 'dig' | 'done'

/**
 * Shown in chat and on the Paper title once the hello is done.
 * Not the first line — she introduces herself first.
 */
export const DIG_STONE_OBJECTIVE = 'Quest: Dig three stones.'
export const DIG_STONE_TITLE = 'Dig three stones'
export const DIG_STONE_SUBTITLE = 'Follow Maple'

/** Short spoken lines. Each lesson line stays at or under 10 words. */
export const DIG_STONE_LINES = {
  hello: 'Hi! You can call me Maple.',
  name: "What's your name?",
  invite: 'Hey, wanna play something cool?',
  find: 'Come with me. Dig three stones.',
  dig: 'Dig three stones.',
  done: 'Good job! Three stones!',
} as const

/** Spoken once each when the dig count hits 1 or 2. The third break celebrates. */
export const DIG_STONE_PROGRESS = {
  1: 'One stone.',
  2: 'Two stones.',
} as const

/** Tiny stuck hints. Chinese only — the quest itself stays in English. */
export const DIG_STONE_HINTS = {
  find: '跟着我去挖石头。',
  dig: '挖三块石头。',
} as const

export const DIG_STONE_TARGET = 3
export const DIG_STONE_REPEAT_MS = 14_000
export const DIG_STONE_HINT_MS = 18_000
/** Pause so the hello, and then the invite, can be heard before the next line. */
export const DIG_STONE_BEAT_MS = 1_600
export const DIG_STONE_POLL_MS = 400
/** Chebyshev radius around the player's feet. Standing beside exposed stone counts. */
export const DIG_STONE_NEAR_RADIUS = 2
/** How close a player must be to a broken block to get credit when no dig animation was seen. */
export const DIG_STONE_REACH = 6

/**
 * Natural stone-like blocks a kid actually meets in the first cave.
 * Exact ids only: ores, bricks, stairs, and sandstone do not count.
 */
export const DIG_STONE_BLOCKS = [
  'stone',
  'cobblestone',
  'mossy_cobblestone',
  'deepslate',
  'cobbled_deepslate',
  'tuff',
  'andesite',
  'diorite',
  'granite',
  'calcite',
  'dripstone_block',
  'blackstone',
  'basalt',
  'smooth_basalt',
] as const

const STONE_BLOCK_SET = new Set<string>(DIG_STONE_BLOCKS)

export interface DigStoneQuest {
  player: string
  /** Name she will use. Null until the name step settles. */
  called: string | null
  step: DigStoneStep
  dug: number
  stepEnteredAt: number
  lastSpokenAt: number
  hinted: boolean
  finished: boolean
}

export type DigStoneEvent =
  | { type: 'objective'; text: string }
  | { type: 'say'; step: DigStoneStep; text: string }
  | { type: 'progress'; dug: number; text: string }
  | { type: 'hint'; step: 'find' | 'dig'; text: string }
  | { type: 'advance'; from: DigStoneStep; to: DigStoneStep; reason: string }

export type DigStoneTitlePhase = 'find' | 'dig' | 'done' | 'actionbar'

export interface StoneSpot {
  x: number
  y: number
  z: number
  exposed: boolean
  standX?: number
  standY?: number
  standZ?: number
}

export interface LeadTarget {
  x: number
  y: number
  z: number
  kind: 'stone' | 'down'
  exposed: boolean
}

/** Live quest hooks hung on the bot so voice and other chat can defer to the lesson. */
export interface MapleQuestHooks {
  guiding: () => boolean
  stepLine: () => string | null
}

export interface DigStoneTickInput {
  now: number
  /** False when the player's body is not loaded. Do not advance the dig. */
  visible: boolean
  nearStone: boolean
  /** Allowed stone breaks to apply on this tick. The find tick never spends these. */
  stoneDug: number
  repeatMs?: number
  hintAfterMs?: number
  beatMs?: number
}

export interface DigStoneWorldInput {
  now: number
  visible: boolean
  nearStone: boolean
  /**
   * Completed allowed breaks since the previous call.
   * Each break is applied on its own tick so the dig line is heard before the count,
   * and three breaks can finish the quest without skipping the dig step.
   */
  breaks?: number
  repeatMs?: number
  hintAfterMs?: number
  beatMs?: number
}

export interface StoneBreakClaim {
  blockName: string | null | undefined
  questPlayer: string
  /** Digger seen in the break animation for this block, if any. */
  progressPlayer?: string | null
  /** Closest other player within reach, used only when no animation digger was seen. */
  nearestPlayer?: string | null
}

export function digStoneQuestEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const quest = (env.QUEST ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (quest === 'digstone') return true
  const flag = (env.DIG_STONE_QUEST ?? '').trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on'
}

/** Maple only. Spark (and any other persona) ignores the flag. */
export function digStoneQuestArmed(persona: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return persona === 'maple' && digStoneQuestEnabled(env)
}

export function englishWordCount(line: string): number {
  return line.trim().split(/\s+/).filter(Boolean).length
}

export function isDigStoneBlock(name: string | null | undefined): boolean {
  if (!name) return false
  const id = name.trim().toLowerCase().replace(/^minecraft:/, '')
  return STONE_BLOCK_SET.has(id)
}

/**
 * Credit a completed break to the quest player.
 * A seen digger wins. Otherwise the nearest player within reach must be the kid.
 */
export function creditStoneBreak(claim: StoneBreakClaim): boolean {
  if (!isDigStoneBlock(claim.blockName)) return false
  const quest = cleanName(claim.questPlayer)
  if (!quest) return false
  const progress = cleanName(claim.progressPlayer)
  if (progress) return progress === quest
  return cleanName(claim.nearestPlayer) === quest
}

/** True when this position already counted a break a moment ago (duplicate block updates). */
export function sameBreakTwice(lastCountedAt: number | null, now: number, windowMs = 800): boolean {
  return lastCountedAt != null && now - lastCountedAt < windowMs
}

export function digStoneScanOffsets(radius = DIG_STONE_NEAR_RADIUS): Array<{ dx: number; dy: number; dz: number }> {
  const cells: Array<{ dx: number; dy: number; dz: number }> = []
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        cells.push({ dx, dy, dz })
      }
    }
  }
  return cells
}

/** Paper 1.21 title commands. Subtitle is sent before title so both show. Empty if the name is unsafe. */
export function digStoneTitleCommands(player: string, phase: DigStoneTitlePhase): string[] {
  const name = player.trim()
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) return []
  if (phase === 'actionbar') {
    return [`/title ${name} actionbar {text:"${DIG_STONE_TITLE}",color:"gold"}`]
  }
  if (phase === 'done') {
    return [`/title ${name} actionbar {text:"Good job!",color:"green"}`]
  }
  const subtitle = phase === 'dig' ? 'Break three blocks' : DIG_STONE_SUBTITLE
  return [
    `/title ${name} times 5 70 10`,
    `/title ${name} subtitle {text:"${subtitle}",color:"yellow"}`,
    `/title ${name} title {text:"${DIG_STONE_TITLE}",bold:true,color:"gold"}`,
    `/title ${name} actionbar {text:"${DIG_STONE_TITLE}",color:"gold"}`,
  ]
}

/**
 * Lines that put Maple behind the kid. Suppressed while she is leading the quest.
 * "Come with me" and "Follow me" (she is the leader) are not trailing lines.
 */
export function isTrailingLine(line: string): boolean {
  return /\b(right behind|behind you|behind me|follow you|following you|i(?:'| a)?m following|i will follow|walk behind|stay behind)\b/i.test(
    line,
  )
}

/** While guiding, replace a trailing line with the current English step. Null means say nothing. */
export function speakDuringQuest(line: string, hooks: MapleQuestHooks | null | undefined): string | null {
  if (!hooks?.guiding() || !isTrailingLine(line)) return line
  return hooks.stepLine()
}

/**
 * Where Maple should walk. Exposed stone wins over a closer buried block.
 * The goal is the stand spot beside the stone when one is known.
 * No stone in range: step down so she can lead a tunnel.
 */
export function chooseDigStoneLead(
  stones: StoneSpot[],
  from: { x: number; y: number; z: number },
): LeadTarget {
  let best: { spot: StoneSpot; d2: number } | null = null
  for (const spot of stones) {
    const goal = standOf(spot)
    const dx = goal.x + 0.5 - from.x
    const dy = goal.y - from.y
    const dz = goal.z + 0.5 - from.z
    const d2 = dx * dx + dy * dy + dz * dz
    const closerSameKind = best != null && spot.exposed === best.spot.exposed && d2 < best.d2
    const exposedWins = best != null && spot.exposed && !best.spot.exposed
    if (!best || exposedWins || closerSameKind) best = { spot, d2 }
  }
  if (!best) {
    return {
      x: Math.floor(from.x),
      y: Math.floor(from.y) - 6,
      z: Math.floor(from.z),
      kind: 'down',
      exposed: false,
    }
  }
  const goal = standOf(best.spot)
  return { x: goal.x, y: goal.y, z: goal.z, kind: 'stone', exposed: best.spot.exposed }
}

/** Prefer a side face at the same height, then the block above, then any air, else the stone itself. */
export function leadStand(
  stone: { x: number; y: number; z: number },
  air: Array<{ x: number; y: number; z: number }>,
): { x: number; y: number; z: number } {
  const beside = air.find((cell) => cell.y === stone.y)
  if (beside) return beside
  const above = air.find((cell) => cell.y === stone.y + 1)
  if (above) return above
  return air[0] ?? { x: stone.x, y: stone.y, z: stone.z }
}

export function digStoneStepLine(quest: Pick<DigStoneQuest, 'step' | 'finished'> | null): string | null {
  if (!quest || quest.finished || quest.step === 'done') return null
  return DIG_STONE_LINES[quest.step]
}

/** True only while she should path toward stone. Hello, name, and invite stay put. */
export function digStoneLeading(step: DigStoneStep): boolean {
  return step === 'find' || step === 'dig'
}

const NAME_STOP = new Set([
  'hi', 'hello', 'hey', 'ok', 'okay', 'yes', 'no', 'yeah', 'yep', 'nope',
  'maple', 'what', 'whats', 'your', 'name', 'cool', 'play', 'wanna', 'something',
  'please', 'thanks', 'thank', 'my', 'the', 'a', 'an', 'is',
])

/**
 * A short name from a chat reply, or null when the reply is not a name.
 * "I'm Tom" and "my name is Tom" both become "Tom".
 */
export function parseKidName(text: string): string | null {
  let rest = text.trim()
  if (!rest || rest.startsWith('/')) return null
  for (let i = 0; i < 3; i += 1) {
    const next = rest.replace(/^(?:hi|hello|hey|my name is|i am|i'm|im|call me|this is|it is|it's|its)[,!.\s]+/i, '').trim()
    if (next === rest) break
    rest = next
  }
  const words = rest.replace(/[^A-Za-z'\-\s]/g, ' ').trim().split(/\s+/).filter(Boolean)
  const kept = words.filter((word) => {
    const key = word.toLowerCase().replace(/'/g, '')
    return !NAME_STOP.has(key) && word.length <= 16
  })
  if (kept.length < 1 || kept.length > 2) return null
  return kept.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
}

/** Use a parsed name when they answered with one. Otherwise the join username. Null ignores slash chat. */
export function nameFromReply(text: string, username: string): string | null {
  const raw = text.trim()
  if (!raw || raw.startsWith('/')) return null
  return parseKidName(raw) ?? displayJoinName(username)
}

export function digStoneNameLine(called: string, fromReply: boolean): string {
  return fromReply ? `Nice to meet you, ${called}.` : `I will call you ${called}.`
}

/**
 * Name step only. A real reply settles the name and says the invite.
 * Other steps ignore chat, so typing cannot skip the dig.
 */
export function noteDigStoneChat(
  quest: DigStoneQuest,
  input: { now: number; text: string },
): { quest: DigStoneQuest; events: DigStoneEvent[] } {
  if (quest.finished || quest.step !== 'name') return { quest, events: [] }
  const called = nameFromReply(input.text, quest.player)
  if (!called) return { quest, events: [] }
  const fromReply = parseKidName(input.text) != null
  return enterInvite(quest, called, input.now, fromReply)
}

export function createDigStoneQuest(player: string, now: number): { quest: DigStoneQuest; events: DigStoneEvent[] } {
  const quest: DigStoneQuest = {
    player,
    called: null,
    step: 'hello',
    dug: 0,
    stepEnteredAt: now,
    lastSpokenAt: now,
    hinted: false,
    finished: false,
  }
  return {
    quest,
    events: [{ type: 'say', step: 'hello', text: DIG_STONE_LINES.hello }],
  }
}

/**
 * One poll. At most one step change. A break cannot be counted on the same tick
 * that "find" advances, so the kid always hears "Dig three stones." before a tally.
 * Passing stoneDug while still on find only proves they found stone; the count stays 0.
 */
export function tickDigStone(
  quest: DigStoneQuest,
  input: DigStoneTickInput,
): { quest: DigStoneQuest; events: DigStoneEvent[] } {
  if (quest.finished || quest.step === 'done') return { quest, events: [] }

  const repeatMs = input.repeatMs ?? DIG_STONE_REPEAT_MS
  const hintAfterMs = input.hintAfterMs ?? DIG_STONE_HINT_MS
  const beatMs = input.beatMs ?? DIG_STONE_BEAT_MS
  const dugNow = finiteFloor(input.stoneDug)
  let next: DigStoneQuest = { ...quest }
  const events: DigStoneEvent[] = []

  if (next.step === 'hello' && input.now - next.stepEnteredAt >= beatMs) {
    next = {
      ...next,
      step: 'name',
      stepEnteredAt: input.now,
      lastSpokenAt: input.now,
      hinted: false,
    }
    events.push({ type: 'advance', from: 'hello', to: 'name', reason: 'hello' })
    events.push({ type: 'say', step: 'name', text: DIG_STONE_LINES.name })
    return { quest: next, events }
  }

  if (next.step === 'name' && input.now - next.stepEnteredAt >= hintAfterMs) {
    return enterInvite(next, displayJoinName(next.player), input.now, false)
  }

  if (next.step === 'invite' && input.now - next.stepEnteredAt >= beatMs) {
    next = {
      ...next,
      step: 'find',
      stepEnteredAt: input.now,
      lastSpokenAt: input.now,
      hinted: false,
    }
    events.push({ type: 'advance', from: 'invite', to: 'find', reason: 'play' })
    events.push({ type: 'objective', text: DIG_STONE_OBJECTIVE })
    events.push({ type: 'say', step: 'find', text: DIG_STONE_LINES.find })
    return { quest: next, events }
  }

  if (input.visible && next.step === 'find' && (input.nearStone || dugNow > 0)) {
    next = {
      ...next,
      step: 'dig',
      dug: 0,
      stepEnteredAt: input.now,
      lastSpokenAt: input.now,
      hinted: false,
    }
    events.push({
      type: 'advance',
      from: 'find',
      to: 'dig',
      reason: input.nearStone ? 'near-stone' : 'broke-stone',
    })
    events.push({ type: 'say', step: 'dig', text: DIG_STONE_LINES.dig })
    return { quest: next, events }
  }

  if (input.visible && next.step === 'dig' && dugNow > 0) {
    const dug = Math.min(DIG_STONE_TARGET, next.dug + dugNow)
    if (dug >= DIG_STONE_TARGET) {
      next = {
        ...next,
        step: 'done',
        dug: DIG_STONE_TARGET,
        finished: true,
        stepEnteredAt: input.now,
        lastSpokenAt: input.now,
        hinted: false,
      }
      events.push({ type: 'advance', from: 'dig', to: 'done', reason: `dug-${DIG_STONE_TARGET}` })
      events.push({ type: 'say', step: 'done', text: DIG_STONE_LINES.done })
      return { quest: next, events }
    }
    next = {
      ...next,
      dug,
      stepEnteredAt: input.now,
      lastSpokenAt: input.now,
      hinted: false,
    }
    events.push({ type: 'progress', dug, text: progressText(dug) })
    return { quest: next, events }
  }

  if (
    (next.step === 'name' || next.step === 'find' || next.step === 'dig') &&
    input.now - next.lastSpokenAt >= repeatMs
  ) {
    const step = next.step
    next = { ...next, lastSpokenAt: input.now }
    events.push({ type: 'say', step, text: DIG_STONE_LINES[step] })
    return { quest: next, events }
  }

  if (
    !next.hinted &&
    (next.step === 'find' || next.step === 'dig') &&
    input.now - next.stepEnteredAt >= hintAfterMs
  ) {
    const step = next.step
    next = { ...next, hinted: true }
    events.push({ type: 'hint', step, text: DIG_STONE_HINTS[step] })
  }

  return { quest: next, events }
}

/**
 * Apply proximity, repeats, hints, and completed breaks.
 * Breaks are fed one at a time. The break that leaves "find" is counted
 * on the following tick, so three real breaks still finish the quest.
 */
export function applyDigStoneWorld(
  quest: DigStoneQuest,
  input: DigStoneWorldInput,
): { quest: DigStoneQuest; events: DigStoneEvent[] } {
  const breaks = finiteFloor(input.breaks ?? 0)
  const rapport = quest.step === 'hello' || quest.step === 'name' || quest.step === 'invite'
  if (rapport || !input.visible || breaks <= 0) {
    return tickDigStone(quest, {
      now: input.now,
      visible: input.visible,
      nearStone: input.nearStone,
      stoneDug: 0,
      repeatMs: input.repeatMs,
      hintAfterMs: input.hintAfterMs,
      beatMs: input.beatMs,
    })
  }

  let current = quest
  const events: DigStoneEvent[] = []
  for (let i = 0; i < breaks; i += 1) {
    if (current.finished || current.step === 'done') break
    if (current.step === 'find') {
      const advanced = tickDigStone(current, {
        now: input.now,
        visible: true,
        nearStone: true,
        stoneDug: 0,
        repeatMs: input.repeatMs,
        hintAfterMs: input.hintAfterMs,
        beatMs: input.beatMs,
      })
      current = advanced.quest
      events.push(...advanced.events)
      if (current.step !== 'dig') break
    }
    if (current.step !== 'dig') break
    const counted = tickDigStone(current, {
      now: input.now,
      visible: true,
      nearStone: true,
      stoneDug: 1,
      repeatMs: input.repeatMs,
      hintAfterMs: input.hintAfterMs,
      beatMs: input.beatMs,
    })
    current = counted.quest
    events.push(...counted.events)
  }
  return { quest: current, events }
}

function enterInvite(
  quest: DigStoneQuest,
  called: string,
  now: number,
  fromReply: boolean,
): { quest: DigStoneQuest; events: DigStoneEvent[] } {
  const reason = fromReply ? 'answered' : 'username'
  return {
    quest: {
      ...quest,
      called,
      step: 'invite',
      stepEnteredAt: now,
      lastSpokenAt: now,
      hinted: false,
    },
    events: [
      { type: 'advance', from: 'name', to: 'invite', reason },
      { type: 'say', step: 'name', text: digStoneNameLine(called, fromReply) },
      { type: 'say', step: 'invite', text: DIG_STONE_LINES.invite },
    ],
  }
}

function displayJoinName(username: string): string {
  const name = username.trim()
  if (/^[A-Za-z0-9_]{1,16}$/.test(name)) return name
  return 'friend'
}

function standOf(spot: StoneSpot): { x: number; y: number; z: number } {
  return {
    x: spot.standX ?? spot.x,
    y: spot.standY ?? spot.y,
    z: spot.standZ ?? spot.z,
  }
}

function progressText(dug: number): string {
  if (dug === 1) return DIG_STONE_PROGRESS[1]
  if (dug === 2) return DIG_STONE_PROGRESS[2]
  return DIG_STONE_LINES.dig
}

function finiteFloor(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
}

function cleanName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase()
}
