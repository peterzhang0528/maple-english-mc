/**
 * Dig-three-stones tutorial (digstone / dig_stone / digStone).
 * One gated quest: find stone, break three allowed blocks, then celebrate.
 * Maple does not speak the next English line until the current step is met.
 * Chat is not an input. Only world observations move the step.
 *
 * Perception already hears digs, but it dedupes by block name for about 45s,
 * so those notes cannot count three stones. This gate counts completed breaks
 * the guide reports, one step change per tick.
 */
export type DigStoneStep = 'find' | 'dig' | 'done'

/** Short spoken lines. The lesson lines stay at or under 10 words. */
export const DIG_STONE_LINES = {
  find: 'Find some stone.',
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
  find: '去找石头。',
  dig: '挖三块石头。',
} as const

export const DIG_STONE_TARGET = 3
export const DIG_STONE_REPEAT_MS = 14_000
export const DIG_STONE_HINT_MS = 18_000
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
  step: DigStoneStep
  dug: number
  stepEnteredAt: number
  lastSpokenAt: number
  hinted: boolean
  finished: boolean
}

export type DigStoneEvent =
  | { type: 'say'; step: DigStoneStep; text: string }
  | { type: 'progress'; dug: number; text: string }
  | { type: 'hint'; step: 'find' | 'dig'; text: string }
  | { type: 'advance'; from: DigStoneStep; to: DigStoneStep; reason: string }

export interface DigStoneTickInput {
  now: number
  /** False when the player's body is not loaded. Do not advance. */
  visible: boolean
  nearStone: boolean
  /** Allowed stone breaks to apply on this tick. The find tick never spends these. */
  stoneDug: number
  repeatMs?: number
  hintAfterMs?: number
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

export function digStoneStepLine(quest: Pick<DigStoneQuest, 'step' | 'finished'> | null): string | null {
  if (!quest || quest.finished || quest.step === 'done') return null
  if (quest.step === 'find') return DIG_STONE_LINES.find
  return DIG_STONE_LINES.dig
}

export function createDigStoneQuest(player: string, now: number): { quest: DigStoneQuest; events: DigStoneEvent[] } {
  const quest: DigStoneQuest = {
    player,
    step: 'find',
    dug: 0,
    stepEnteredAt: now,
    lastSpokenAt: now,
    hinted: false,
    finished: false,
  }
  return {
    quest,
    events: [{ type: 'say', step: 'find', text: DIG_STONE_LINES.find }],
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
  const dugNow = finiteFloor(input.stoneDug)
  let next: DigStoneQuest = { ...quest }
  const events: DigStoneEvent[] = []

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

  if (input.now - next.lastSpokenAt >= repeatMs) {
    const step = next.step === 'dig' ? 'dig' : 'find'
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
  if (!input.visible || breaks <= 0) {
    return tickDigStone(quest, {
      now: input.now,
      visible: input.visible,
      nearStone: input.nearStone,
      stoneDug: 0,
      repeatMs: input.repeatMs,
      hintAfterMs: input.hintAfterMs,
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
      })
      current = advanced.quest
      events.push(...advanced.events)
      if (current.step !== 'dig') break
    }
    const counted = tickDigStone(current, {
      now: input.now,
      visible: true,
      nearStone: true,
      stoneDug: 1,
      repeatMs: input.repeatMs,
      hintAfterMs: input.hintAfterMs,
    })
    current = counted.quest
    events.push(...counted.events)
  }
  return { quest: current, events }
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
