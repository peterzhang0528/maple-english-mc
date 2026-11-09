/**
 * Mineflayer wiring for the dig-three-stones quest.
 * Speech and step changes come only from the gate in digstone.ts.
 * After the hello, Maple pathfinds toward stone. She does not follow the kid.
 * A count is a stone-like block turning into air, attributed to the kid.
 */
import type { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { isCompanionUsername } from '../chat/persona.js'
import { goals } from '../pathfinder.js'
import {
  DIG_STONE_HINT_MS,
  DIG_STONE_POLL_MS,
  DIG_STONE_REACH,
  DIG_STONE_REPEAT_MS,
  applyDigStoneWorld,
  chooseDigStoneLead,
  createDigStoneQuest,
  creditStoneBreak,
  digStoneLeading,
  digStoneScanOffsets,
  digStoneStepLine,
  digStoneTitleCommands,
  isDigStoneBlock,
  leadStand,
  noteDigStoneChat,
  noteDigStoneScene,
  sameBreakTwice,
  type DigStoneEvent,
  type DigStoneQuest,
  type DigStoneTitlePhase,
  type StoneSpot,
} from '../behavior/digstone.js'

export interface DigStoneGuide {
  stop: () => void
  /** True from the hello until the celebrate line. */
  guiding: () => boolean
  /** True only while she is pathing toward stone. */
  leading: () => boolean
  /** English line for the current step, or null when the quest is idle or done. */
  stepLine: () => string | null
  /** Start once, for the first allowed human. Later calls do nothing. */
  noteHuman: (username: string) => void
  /** Name step, or a scene reply during find/dig. True when Maple answered. */
  noteChat: (text: string) => boolean
  /** True from arm until the quest is finished, including before hello. */
  blocksIdle: () => boolean
}

const SCAN = digStoneScanOffsets()
const PROGRESS_TTL_MS = 5_000
const BREAK_DEDUPE_MS = 800
const LEAD_MS = 1_500
const ACTIONBAR_MS = 5_000
const SEARCH_MS = 8_000
const SEARCH_DIRS = [
  [8, 0],
  [0, 8],
  [-8, 0],
  [0, -8],
] as const

export function attachDigStoneGuide(options: {
  bot: Bot
  playerAllowed: (username: string) => boolean
  say: (line: string) => void
  log: (message: string) => void
}): DigStoneGuide {
  const { bot, playerAllowed, say, log } = options
  let quest: DigStoneQuest | null = null
  let stopped = false
  let flushing = false
  let pendingBreaks = 0
  let lastGoalKey = ''
  let lastActionbarAt = 0
  let searchDir = 0
  let searchDirAt = 0
  let idleBlocked = true
  let lastKidKey = ''
  let lastKidAt = 0
  const progressByPos = new Map<string, { player: string; at: number }>()
  const countedAt = new Map<string, number>()

  const showTitles = (phase: DigStoneTitlePhase) => {
    if (!quest) return
    const commands = digStoneTitleCommands(quest.player, phase)
    if (commands.length === 0) {
      log(`digstone title skipped player=${quest.player}`)
      return
    }
    for (const command of commands) {
      try {
        bot.chat(command)
      } catch (error) {
        log(`digstone title failed: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
    }
    lastActionbarAt = Date.now()
    log(`digstone title phase=${phase} player=${quest.player}`)
  }

  const stopLeading = () => {
    const movements = bot.pathfinder?.movements
    if (movements) movements.canDig = false
    lastGoalKey = ''
    try {
      bot.pathfinder?.setGoal(null)
    } catch {
      /* pathfinder may not be ready */
    }
  }

  const leadTowardStone = () => {
    if (stopped || !quest || !digStoneLeading(quest.step) || !bot.entity || !bot.pathfinder) return
    const now = Date.now()
    if (now - lastActionbarAt >= ACTIONBAR_MS) showTitles('actionbar')
    const from = bot.entity.position
    let target = chooseDigStoneLead(scanStones(bot), { x: from.x, y: from.y, z: from.z })
    if (target.kind === 'down') {
      if (now - searchDirAt >= SEARCH_MS) {
        searchDir = (searchDir + 1) % SEARCH_DIRS.length
        searchDirAt = now
      }
      const [dx, dz] = SEARCH_DIRS[searchDir] ?? [8, 0]
      const minY = (bot.game as { minY?: number } | undefined)?.minY
      const floorY = typeof minY === 'number' ? minY + 1 : -60
      target = {
        ...target,
        x: Math.floor(from.x) + dx,
        y: Math.max(floorY, target.y),
        z: Math.floor(from.z) + dz,
      }
    }
    const movements = bot.pathfinder.movements
    if (movements) movements.canDig = !(target.kind === 'stone' && target.exposed)
    const dist = Math.hypot(from.x - (target.x + 0.5), from.y - target.y, from.z - (target.z + 0.5))
    if (target.kind === 'stone' && dist < 3) {
      bot.pathfinder.setGoal(null)
      lastGoalKey = ''
      void bot.lookAt(new Vec3(target.x + 0.5, target.y + 0.5, target.z + 0.5), true).catch(() => {})
      return
    }
    const key = `${target.kind}:${target.x}:${target.y}:${target.z}`
    if (key === lastGoalKey && bot.pathfinder.isMoving()) return
    lastGoalKey = key
    try {
      bot.pathfinder.setGoal(new goals.GoalNear(target.x, target.y, target.z, target.kind === 'stone' ? 2 : 1))
    } catch (error) {
      log(`digstone lead failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const emit = (player: string, events: DigStoneEvent[]) => {
    for (const event of events) {
      if (event.type === 'advance') {
        log(`digstone step ${event.from} -> ${event.to} player=${player} reason=${event.reason}`)
        if (event.to === 'done') {
          log(`digstone quest done player=${player}`)
          idleBlocked = false
          stopLeading()
          showTitles('done')
        } else if (event.to === 'dig') {
          showTitles('dig')
        } else if (event.to === 'find') {
          leadTowardStone()
        }
      } else if (event.type === 'objective') {
        log(`digstone objective player=${player}: ${event.text}`)
        say(event.text)
        showTitles('find')
      } else if (event.type === 'say') {
        log(`digstone say step=${event.step} player=${player}: ${event.text}`)
        say(event.text)
      } else if (event.type === 'progress') {
        log(`digstone progress dug=${event.dug} player=${player}: ${event.text}`)
        say(event.text)
      } else if (event.type === 'hint') {
        log(`digstone hint step=${event.step} player=${player}: ${event.text}`)
        say(event.text)
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
    stopLeading()
    const started = createDigStoneQuest(name, Date.now())
    quest = started.quest
    log(`digstone quest start player=${name} step=hello`)
    emit(name, started.events)
  }

  const noteChat = (text: string) => {
    if (stopped || !quest || quest.finished) return false
    const now = Date.now()
    const key = `${quest.step}:${text.trim().toLowerCase()}`
    if (key === lastKidKey && now - lastKidAt < 1_500) return true
    const noted =
      quest.step === 'find' || quest.step === 'dig'
        ? noteDigStoneScene(quest, { now, text })
        : noteDigStoneChat(quest, { now, text })
    if (noted.events.length === 0) return false
    lastKidKey = key
    lastKidAt = now
    quest = noted.quest
    emit(quest.player, noted.events)
    return true
  }

  const flush = () => {
    if (flushing || stopped || !quest || quest.finished) return
    flushing = true
    try {
      for (let i = 0; i < 8 && quest && !quest.finished; i += 1) {
        const breaks = pendingBreaks
        pendingBreaks = 0
        const sensed = sensePlayer(bot, quest.player)
        // A credited break is itself proof the kid is here, even if the feet scan missed them.
        const ticked = applyDigStoneWorld(quest, {
          now: Date.now(),
          visible: sensed.visible || breaks > 0,
          nearStone: sensed.nearStone,
          breaks,
          repeatMs: DIG_STONE_REPEAT_MS,
          hintAfterMs: DIG_STONE_HINT_MS,
        })
        quest = ticked.quest
        emit(quest.player, ticked.events)
        if (pendingBreaks === 0) break
      }
    } finally {
      flushing = false
    }
  }

  const rememberDigger = (
    block: { position?: { x: number; y: number; z: number } } | null,
    entity: { username?: string } | null,
  ) => {
    if (stopped || !quest || quest.finished) return
    const name = entity?.username?.trim()
    const key = positionKey(block?.position)
    if (!name || !key) return
    const now = Date.now()
    progressByPos.set(key, { player: name, at: now })
    if (progressByPos.size <= 32) return
    for (const [pos, mark] of progressByPos) {
      if (now - mark.at > PROGRESS_TTL_MS) progressByPos.delete(pos)
    }
  }

  const onBlockUpdate = (
    oldBlock: { name?: string; position?: { x: number; y: number; z: number } } | null,
    newBlock: { name?: string; position?: { x: number; y: number; z: number } } | null,
  ) => {
    if (stopped || !quest || quest.finished) return
    const oldName = oldBlock?.name
    const newName = newBlock?.name || 'air'
    if (!oldName || !becameAir(oldName, newName) || !isDigStoneBlock(oldName)) return
    const pos = oldBlock?.position ?? newBlock?.position
    const key = positionKey(pos)
    if (!key || !pos) return
    const now = Date.now()
    const mark = progressByPos.get(key)
    progressByPos.delete(key)
    const progressPlayer = mark && now - mark.at <= PROGRESS_TTL_MS ? mark.player : null
    const nearest = nearestBreaker(bot, pos, bot.username)
    if (
      !creditStoneBreak({
        blockName: oldName,
        questPlayer: quest.player,
        progressPlayer,
        nearestPlayer: nearest,
      })
    ) {
      return
    }
    if (sameBreakTwice(countedAt.get(key) ?? null, now, BREAK_DEDUPE_MS)) return
    countedAt.set(key, now)
    pendingBreaks += 1
    flush()
  }

  // Typed defs omit the digger entity. Runtime still passes it (block_actions.js).
  const onBreakProgressLoose = ((
    block: { position?: { x: number; y: number; z: number } } | null,
    _stage: number,
    entity: { username?: string } | null,
  ) => {
    rememberDigger(block, entity)
  }) as (...args: unknown[]) => void
  const onBreakEndLoose = ((
    block: { position?: { x: number; y: number; z: number } } | null,
    entity: { username?: string } | null,
  ) => {
    rememberDigger(block, entity)
  }) as (...args: unknown[]) => void

  bot.on('blockBreakProgressObserved', onBreakProgressLoose)
  bot.on('blockBreakProgressEnd', onBreakEndLoose)
  bot.on('blockUpdate', onBlockUpdate)

  const timer = setInterval(() => {
    flush()
  }, DIG_STONE_POLL_MS)
  const leadTimer = setInterval(() => {
    leadTowardStone()
  }, LEAD_MS)

  return {
    stop: () => {
      stopped = true
      clearInterval(timer)
      clearInterval(leadTimer)
      stopLeading()
      bot.removeListener('blockBreakProgressObserved', onBreakProgressLoose)
      bot.removeListener('blockBreakProgressEnd', onBreakEndLoose)
      bot.removeListener('blockUpdate', onBlockUpdate)
    },
    guiding: () => quest != null && !quest.finished,
    leading: () => quest != null && digStoneLeading(quest.step),
    blocksIdle: () => idleBlocked,
    stepLine: () => digStoneStepLine(quest),
    noteHuman,
    noteChat,
  }
}

function scanStones(bot: Bot): StoneSpot[] {
  let positions: Vec3[] = []
  try {
    positions = bot.findBlocks({
      matching: (block) => isDigStoneBlock(block?.name),
      maxDistance: 32,
      count: 24,
    })
  } catch {
    return []
  }
  const spots: StoneSpot[] = []
  for (const pos of positions) {
    const block = bot.blockAt(pos)
    if (!block || !isDigStoneBlock(block.name)) continue
    const air = airNeighbors(bot, pos)
    const stand = leadStand({ x: pos.x, y: pos.y, z: pos.z }, air)
    spots.push({
      x: pos.x,
      y: pos.y,
      z: pos.z,
      exposed: air.length > 0,
      standX: stand.x,
      standY: stand.y,
      standZ: stand.z,
    })
  }
  return spots
}

function airNeighbors(bot: Bot, pos: Vec3): Array<{ x: number; y: number; z: number }> {
  const cells: Array<{ x: number; y: number; z: number }> = []
  const offsets = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ]
  for (const [dx, dy, dz] of offsets) {
    let block: { name?: string } | null = null
    try {
      block = bot.blockAt(pos.offset(dx ?? 0, dy ?? 0, dz ?? 0))
    } catch {
      block = null
    }
    if (!block?.name || !isAirName(block.name)) continue
    cells.push({ x: pos.x + (dx ?? 0), y: pos.y + (dy ?? 0), z: pos.z + (dz ?? 0) })
  }
  return cells
}

function sensePlayer(bot: Bot, username: string): { visible: boolean; nearStone: boolean } {
  const entity = bot.players[username]?.entity
  if (!entity?.position) return { visible: false, nearStone: false }
  const feet = entity.position.floored()
  for (const cell of SCAN) {
    let block: { name?: string } | null = null
    try {
      block = bot.blockAt(feet.offset(cell.dx, cell.dy, cell.dz))
    } catch {
      block = null
    }
    if (isDigStoneBlock(block?.name)) return { visible: true, nearStone: true }
  }
  return { visible: true, nearStone: false }
}

function nearestBreaker(
  bot: Bot,
  position: { x: number; y: number; z: number },
  selfName: string,
): string | null {
  let best: { name: string; distance: number } | null = null
  const target = position as Parameters<NonNullable<Bot['entity']>['position']['distanceTo']>[0]
  for (const name of Object.keys(bot.players)) {
    if (name.toLowerCase() === selfName.toLowerCase()) continue
    const entity = bot.players[name]?.entity
    if (!entity?.position) continue
    let distance = Number.POSITIVE_INFINITY
    try {
      distance = entity.position.distanceTo(target)
    } catch {
      continue
    }
    if (!Number.isFinite(distance) || distance > DIG_STONE_REACH) continue
    if (!best || distance < best.distance) best = { name, distance }
  }
  return best?.name ?? null
}

function positionKey(position: { x: number; y: number; z: number } | null | undefined): string | null {
  if (!position) return null
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) return null
  return `${Math.floor(position.x)},${Math.floor(position.y)},${Math.floor(position.z)}`
}

function becameAir(oldName: string, newName: string): boolean {
  return !isAirName(oldName) && isAirName(newName)
}

function isAirName(name: string): boolean {
  const id = name.trim().toLowerCase().replace(/^minecraft:/, '')
  return id === 'air' || id === 'cave_air' || id === 'void_air'
}
