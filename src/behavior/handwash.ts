/**
 * Wash-hands tutorial (handwash / washHands).
 * One gated quest: go to water, stay and wash, then celebrate.
 * Maple does not speak the next English line until the current step is met.
 */
export type HandwashStep = 'go' | 'wash' | 'done'

/** Short spoken/chat lines. Keep each one at or under 10 words. */
export const HANDWASH_LINES = {
  go: 'Go to the water.',
  wash: 'Wash your hands.',
  done: 'Good job! Clean hands!',
} as const

/** Tiny stuck hints. Chinese only — the quest itself stays in English. */
export const HANDWASH_HINTS = {
  go: '去水边。',
  wash: '在水边站一会儿。',
} as const

export const HANDWASH_HOLD_MS = 4_000
export const HANDWASH_REPEAT_MS = 14_000
export const HANDWASH_HINT_MS = 18_000
export const HANDWASH_AWAY_POLLS = 3
export const HANDWASH_POLL_MS = 400
/** Chebyshev radius around the player's feet. Standing on the bank counts. */
export const HANDWASH_WATER_RADIUS = 2

export interface HandwashQuest {
  player: string
  step: HandwashStep
  stepEnteredAt: number
  /** When the current continuous "near water" stretch started, during wash. */
  washSince: number | null
  awayPolls: number
  lastSpokenAt: number
  hinted: boolean
  finished: boolean
}

export type HandwashEvent =
  | { type: 'say'; step: HandwashStep; text: string }
  | { type: 'hint'; step: 'go' | 'wash'; text: string }
  | { type: 'advance'; from: HandwashStep; to: HandwashStep; reason: string }
  | { type: 'reset'; reason: string }

export interface HandwashTickInput {
  now: number
  /** False when the player's body is not loaded. Do not advance or reset. */
  visible: boolean
  nearWater: boolean
  holdMs?: number
  repeatMs?: number
  hintAfterMs?: number
  awayPollsToReset?: number
}

export interface WashBlock {
  name?: string | null
  properties?: Record<string, unknown> | null
}

export function handwashQuestEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const quest = (env.QUEST ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (quest === 'handwash' || quest === 'washhands') return true
  const flag = (env.HANDWASH_QUEST ?? '').trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on'
}

export function englishWordCount(line: string): number {
  return line.trim().split(/\s+/).filter(Boolean).length
}

export function isWashWaterBlock(block: WashBlock | null | undefined): boolean {
  if (!block?.name) return false
  const name = block.name.toLowerCase().replace(/^minecraft:/, '')
  if (name === 'water' || name === 'flowing_water' || name === 'bubble_column' || name === 'water_cauldron') {
    return true
  }
  const props = block.properties
  if (name === 'cauldron') {
    const level = props?.level
    return level === true || level === 'true' || Number(level) > 0
  }
  return waterlogged(props)
}

export function usedWaterBucket(previous: string | null | undefined, current: string | null | undefined): boolean {
  return itemName(previous) === 'water_bucket' && itemName(current) === 'bucket'
}

export function handwashScanOffsets(radius = HANDWASH_WATER_RADIUS): Array<{ dx: number; dy: number; dz: number }> {
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

export function createHandwashQuest(player: string, now: number): { quest: HandwashQuest; events: HandwashEvent[] } {
  const quest: HandwashQuest = {
    player,
    step: 'go',
    stepEnteredAt: now,
    washSince: null,
    awayPolls: 0,
    lastSpokenAt: now,
    hinted: false,
    finished: false,
  }
  return {
    quest,
    events: [{ type: 'say', step: 'go', text: HANDWASH_LINES.go }],
  }
}

/**
 * One poll. At most one step change. Wash cannot finish on the same tick
 * that "go" advances, so the kid always hears "Wash your hands." first.
 */
export function tickHandwash(
  quest: HandwashQuest,
  input: HandwashTickInput,
): { quest: HandwashQuest; events: HandwashEvent[] } {
  if (quest.finished || quest.step === 'done') return { quest, events: [] }

  const holdMs = input.holdMs ?? HANDWASH_HOLD_MS
  const repeatMs = input.repeatMs ?? HANDWASH_REPEAT_MS
  const hintAfterMs = input.hintAfterMs ?? HANDWASH_HINT_MS
  const awayPollsToReset = input.awayPollsToReset ?? HANDWASH_AWAY_POLLS
  let next: HandwashQuest = { ...quest }
  const events: HandwashEvent[] = []

  if (input.visible && next.step === 'go' && input.nearWater) {
    next = {
      ...next,
      step: 'wash',
      stepEnteredAt: input.now,
      washSince: input.now,
      awayPolls: 0,
      hinted: false,
      lastSpokenAt: input.now,
    }
    events.push({ type: 'advance', from: 'go', to: 'wash', reason: 'near-water' })
    events.push({ type: 'say', step: 'wash', text: HANDWASH_LINES.wash })
    return { quest: next, events }
  }

  if (input.visible && next.step === 'wash') {
    if (!input.nearWater) {
      const awayPolls = next.awayPolls + 1
      if (next.washSince != null && awayPolls >= awayPollsToReset) {
        next = { ...next, washSince: null, awayPolls: 0 }
        events.push({ type: 'reset', reason: 'left-water' })
      } else {
        next = { ...next, awayPolls }
      }
    } else {
      const washSince = next.washSince ?? input.now
      next = { ...next, awayPolls: 0, washSince }
      if (input.now - washSince >= holdMs) {
        next = {
          ...next,
          step: 'done',
          finished: true,
          stepEnteredAt: input.now,
          lastSpokenAt: input.now,
          hinted: false,
          washSince: null,
          awayPolls: 0,
        }
        events.push({ type: 'advance', from: 'wash', to: 'done', reason: `held-${holdMs}ms` })
        events.push({ type: 'say', step: 'done', text: HANDWASH_LINES.done })
        return { quest: next, events }
      }
    }
  }

  if (input.now - next.lastSpokenAt >= repeatMs) {
    const step = next.step === 'wash' ? 'wash' : 'go'
    next = { ...next, lastSpokenAt: input.now }
    events.push({ type: 'say', step, text: HANDWASH_LINES[step] })
    return { quest: next, events }
  }

  if (
    !next.hinted &&
    (next.step === 'go' || next.step === 'wash') &&
    input.now - next.stepEnteredAt >= hintAfterMs
  ) {
    const step = next.step
    next = { ...next, hinted: true }
    events.push({ type: 'hint', step, text: HANDWASH_HINTS[step] })
  }

  return { quest: next, events }
}

function waterlogged(props: Record<string, unknown> | null | undefined): boolean {
  if (!props) return false
  const flag = props.waterlogged
  return flag === true || flag === 'true' || flag === 1 || flag === '1'
}

function itemName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/^minecraft:/, '')
}
