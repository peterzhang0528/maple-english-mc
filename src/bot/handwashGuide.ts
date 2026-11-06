/**
 * Mineflayer wiring for the wash-hands quest.
 * Polls the human's body. Speech and step changes come only from the gate in handwash.ts.
 */
import type { Bot } from 'mineflayer'
import { isCompanionUsername } from '../chat/persona.js'
import {
  HANDWASH_AWAY_POLLS,
  HANDWASH_HINT_MS,
  HANDWASH_HOLD_MS,
  HANDWASH_POLL_MS,
  HANDWASH_REPEAT_MS,
  HANDWASH_WATER_RADIUS,
  HANDWASH_LINES,
  createHandwashQuest,
  handwashScanOffsets,
  isWashWaterBlock,
  tickHandwash,
  usedWaterBucket,
  type HandwashEvent,
  type HandwashQuest,
} from '../behavior/handwash.js'

export interface HandwashGuide {
  stop: () => void
  /** True from the first line until the celebrate line. */
  guiding: () => boolean
  /** English line for the current step, or null when the quest is idle or done. */
  stepLine: () => string | null
  /** Start once, for the first allowed human. Later calls do nothing. */
  noteHuman: (username: string) => void
}

const SCAN = handwashScanOffsets(HANDWASH_WATER_RADIUS)

export function attachHandwashGuide(options: {
  bot: Bot
  playerAllowed: (username: string) => boolean
  say: (line: string) => void
  log: (message: string) => void
  follow: (username: string) => void
}): HandwashGuide {
  const { bot, playerAllowed, say, log, follow } = options
  let quest: HandwashQuest | null = null
  let stopped = false
  const lastHeld = new Map<string, string>()

  const emit = (player: string, events: HandwashEvent[]) => {
    for (const event of events) {
      if (event.type === 'advance') {
        log(`handwash step ${event.from} -> ${event.to} player=${player} reason=${event.reason}`)
        if (event.to === 'done') log(`handwash quest done player=${player}`)
        if (event.to === 'wash') follow(player)
      } else if (event.type === 'say') {
        log(`handwash say step=${event.step} player=${player}: ${event.text}`)
        say(event.text)
      } else if (event.type === 'hint') {
        log(`handwash hint step=${event.step} player=${player}: ${event.text}`)
        say(event.text)
      } else if (event.type === 'reset') {
        log(`handwash wash timer reset player=${player} reason=${event.reason}`)
      }
    }
  }

  const noteHuman = (username: string) => {
    if (stopped || quest) return
    const name = username.trim()
    if (!name) return
    if (name.toLowerCase() === bot.username.toLowerCase()) return
    if (isCompanionUsername(name)) return
    if (!playerAllowed(name)) return
    const started = createHandwashQuest(name, Date.now())
    quest = started.quest
    log(`handwash quest start player=${name} step=go`)
    emit(name, started.events)
    follow(name)
  }

  const timer = setInterval(() => {
    if (stopped || !quest || quest.finished) return
    const sensed = sensePlayer(bot, quest.player, lastHeld)
    const ticked = tickHandwash(quest, {
      now: Date.now(),
      visible: sensed.visible,
      nearWater: sensed.nearWater,
      holdMs: HANDWASH_HOLD_MS,
      repeatMs: HANDWASH_REPEAT_MS,
      hintAfterMs: HANDWASH_HINT_MS,
      awayPollsToReset: HANDWASH_AWAY_POLLS,
    })
    quest = ticked.quest
    emit(quest.player, ticked.events)
  }, HANDWASH_POLL_MS)

  return {
    stop: () => {
      stopped = true
      clearInterval(timer)
    },
    guiding: () => quest != null && !quest.finished,
    stepLine: () => {
      if (!quest || quest.finished) return null
      if (quest.step === 'go') return HANDWASH_LINES.go
      if (quest.step === 'wash') return HANDWASH_LINES.wash
      return null
    },
    noteHuman,
  }
}

function sensePlayer(
  bot: Bot,
  username: string,
  lastHeld: Map<string, string>,
): { visible: boolean; nearWater: boolean } {
  const entity = bot.players[username]?.entity
  if (!entity?.position) return { visible: false, nearWater: false }

  const currentHeld = heldItemName(entity)
  const previousHeld = lastHeld.get(username) ?? null
  if (currentHeld) lastHeld.set(username, currentHeld)
  const poured = usedWaterBucket(previousHeld, currentHeld)
  if (poured || Boolean((entity as { isInWater?: boolean }).isInWater)) {
    return { visible: true, nearWater: true }
  }

  const feet = entity.position.floored()
  for (const cell of SCAN) {
    let block: { name?: string; getProperties?: () => unknown } | null = null
    try {
      block = bot.blockAt(feet.offset(cell.dx, cell.dy, cell.dz))
    } catch {
      block = null
    }
    if (!block?.name) continue
    if (isWashWaterBlock({ name: block.name, properties: readProperties(block) })) {
      return { visible: true, nearWater: true }
    }
  }
  return { visible: true, nearWater: false }
}

function heldItemName(entity: object): string | null {
  const record = entity as {
    heldItem?: { name?: string } | null
    equipment?: Array<{ name?: string } | null> | null
  }
  return record.heldItem?.name ?? record.equipment?.[0]?.name ?? null
}

function readProperties(block: { getProperties?: () => unknown }): Record<string, unknown> | null {
  if (typeof block.getProperties !== 'function') return null
  try {
    const raw = block.getProperties()
    if (raw && typeof raw === 'object') return raw as Record<string, unknown>
    return null
  } catch {
    return null
  }
}
