import type { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import { goals } from '../pathfinder.js'
import type { Intent } from '../types.js'
import {
  assistOk,
  buildMiss,
  buildOk,
  cannotWalk,
  comeBlind,
  comeOk,
  digMiss,
  digOk,
  followBlind,
  followOk,
  giveMiss,
  giveOk,
  houseMiss,
  houseOk,
  inspectMiss,
  inspectOk,
  lookBlind,
  lookOk,
  waitOk,
} from './phrases.js'

const FOLLOW_RANGE = 2
const DIG_NAMES = /(_log|wood|leaves|_planks|dirt|grass_block|sand|gravel|clay|snow|cobblestone|stone|netherrack)$/i
const PLACE_NAMES = /(_log|_planks|dirt|grass_block|cobblestone|stone|sand|oak_planks|spruce_planks|birch_planks)$/i
const GIVE_FALLBACK = 'oak_log'

export async function performIntents(bot: Bot, username: string, intents: Intent[]): Promise<string[]> {
  const notes: string[] = []
  for (const intent of intents) {
    if (intent.type === 'follow') notes.push(follow(bot, username))
    else if (intent.type === 'come') notes.push(come(bot, username))
    else if (intent.type === 'stop') notes.push(stop(bot))
    else if (intent.type === 'look') notes.push(await look(bot, username))
    else if (intent.type === 'inspect_block') notes.push(await inspect(bot, username))
    else if (intent.type === 'dig') notes.push(await digNear(bot, username))
    else if (intent.type === 'build') notes.push(await buildNear(bot, username))
    else if (intent.type === 'build_house') notes.push(await buildHouseNear(bot, username))
    else if (intent.type === 'give') notes.push(await giveTo(bot, username))
    else if (intent.type === 'assist') notes.push(await assist(bot, username))
  }
  return notes
}

function follow(bot: Bot, username: string): string {
  if (!bot.pathfinder) return cannotWalk()
  const entity = bot.players[username]?.entity
  if (!entity) return followBlind(username)
  bot.pathfinder.setGoal(new goals.GoalFollow(entity, FOLLOW_RANGE), true)
  return followOk(username)
}

function come(bot: Bot, username: string): string {
  if (!bot.pathfinder) return cannotWalk()
  const entity = bot.players[username]?.entity
  if (!entity) return comeBlind(username)
  const { x, y, z } = entity.position
  bot.pathfinder.setGoal(new goals.GoalNear(Math.floor(x), Math.floor(y), Math.floor(z), FOLLOW_RANGE))
  return comeOk(username)
}

function stop(bot: Bot): string {
  bot.pathfinder?.setGoal(null)
  return waitOk()
}

async function look(bot: Bot, username: string): Promise<string> {
  const entity = bot.players[username]?.entity
  if (!entity) return lookBlind(username)
  const height = typeof entity.height === 'number' ? entity.height : 1.62
  await bot.lookAt(entity.position.offset(0, height * 0.9, 0), true)
  return lookOk(username)
}

async function inspect(bot: Bot, username: string): Promise<string> {
  const entity = bot.players[username]?.entity
  if (!entity) return inspectMiss()
  let block: ReturnType<Bot['blockAtEntityCursor']> = null
  try {
    block = bot.blockAtEntityCursor(entity, 5)
  } catch {
    block = null
  }
  if (!block || block.name === 'air' || block.name === 'cave_air' || block.name === 'void_air') return inspectMiss()
  await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true)
  return inspectOk(block.name)
}

async function assist(bot: Bot, username: string): Promise<string> {
  const walk = come(bot, username)
  // Soft dig once if a soft block is already in reach; otherwise just come help.
  const digNote = await digNear(bot, username).catch(() => digMiss())
  if (!/cannot find|cannot walk|cannot see/i.test(digNote)) return `${assistOk(username)} ${digNote}`
  return `${assistOk(username)} ${walk}`
}

async function digNear(bot: Bot, username: string): Promise<string> {
  if (!bot.entity) return digMiss()
  const target = bot.players[username]?.entity
  if (!target?.position) {
    if (!bot.pathfinder) return cannotWalk()
    return digMiss()
  }
  // Walk close first so dig looks cooperative.
  if (bot.pathfinder) {
    const { x, y, z } = target.position
    bot.pathfinder.setGoal(new goals.GoalNear(Math.floor(x), Math.floor(y), Math.floor(z), 2))
  }
  const block = findDiggableNear(bot, target.position, 5)
  if (!block) return digMiss()
  try {
    bot.pathfinder?.setGoal(null)
    await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true)
    await bot.dig(block)
    return digOk(block.name)
  } catch {
    return digMiss()
  }
}

async function buildNear(bot: Bot, username: string): Promise<string> {
  if (!bot.entity) return buildMiss()
  const target = bot.players[username]?.entity
  if (!target?.position) return buildMiss()
  if (bot.pathfinder) {
    const { x, y, z } = target.position
    bot.pathfinder.setGoal(new goals.GoalNear(Math.floor(x), Math.floor(y), Math.floor(z), 2))
  }
  const itemName = await ensurePlaceItem(bot)
  if (!itemName) return buildMiss()
  const spot = findPlaceSpotNear(bot, target.position, 4)
  if (!spot) return buildMiss()
  try {
    bot.pathfinder?.setGoal(null)
    await bot.lookAt(spot.ref.position.offset(0.5, 0.5, 0.5), true)
    await bot.placeBlock(spot.ref, spot.face)
    return buildOk(itemName)
  } catch {
    return buildMiss()
  }
}

async function buildHouseNear(bot: Bot, username: string): Promise<string> {
  if (!bot.entity) return houseMiss()
  const target = bot.players[username]?.entity
  if (!target?.position) return houseMiss()
  const baseX = Math.floor(target.position.x) + 2
  const baseY = Math.floor(target.position.y)
  const baseZ = Math.floor(target.position.z) + 2
  if (bot.pathfinder) {
    bot.pathfinder.setGoal(new goals.GoalNear(baseX + 2, baseY, baseZ + 2, 2))
  }
  // Share materials with the kid so they can place too.
  try {
    bot.chat(`/give ${username} oak_planks 32`)
  } catch {
    /* ignore */
  }
  const itemName = (await ensurePlaceItem(bot)) ?? (await ensureHouseItem(bot))
  if (!itemName) return houseMiss()

  const cells = houseBlueprintCells(baseX, baseY, baseZ)
  // Duo split: Maple starts early in the list, Spark starts mid-way so both place near the kid.
  const name = (bot.username || 'maple').toLowerCase()
  const start = name.includes('spark') ? Math.floor(cells.length / 2) : 0
  const ordered = cells.slice(start).concat(cells.slice(0, start))
  let placed = 0
  const maxPlace = 16
  for (const cell of ordered) {
    if (placed >= maxPlace) break
    const block = bot.blockAt(new Vec3(cell.x, cell.y, cell.z))
    if (!block || (block.name !== 'air' && block.name !== 'cave_air' && block.name !== 'void_air')) continue
    const ok = await placeAt(bot, cell.x, cell.y, cell.z)
    if (ok) placed += 1
  }
  if (placed === 0) {
    // Op fallback: stamp a few setblocks so the house still appears.
    for (const cell of ordered.slice(0, 12)) {
      const block = bot.blockAt(new Vec3(cell.x, cell.y, cell.z))
      if (block && block.name !== 'air' && block.name !== 'cave_air' && block.name !== 'void_air') continue
      try {
        bot.chat(`/setblock ${cell.x} ${cell.y} ${cell.z} oak_planks`)
        placed += 1
        await sleep(40)
      } catch {
        /* ignore */
      }
      if (placed >= 12) break
    }
  }
  if (placed === 0) return houseMiss()
  const remaining = ordered.filter((cell) => {
    const block = bot.blockAt(new Vec3(cell.x, cell.y, cell.z))
    return !block || block.name === 'air' || block.name === 'cave_air' || block.name === 'void_air'
  }).length
  return houseOk(placed, remaining)
}

/** Simple 5x5 cottage: walls (h=3), door gap on south, flat roof. */
function houseBlueprintCells(baseX: number, baseY: number, baseZ: number): { x: number; y: number; z: number }[] {
  const W = 5
  const H = 3
  const cells: { x: number; y: number; z: number }[] = []
  const doorX = baseX + 2
  const doorZ = baseZ
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < W; z++) {
        const edge = x === 0 || x === W - 1 || z === 0 || z === W - 1
        if (!edge) continue
        // Door: two-high gap on the south wall center.
        if (z === 0 && x === 2 && y < 2) continue
        // Keep corners/walls solid otherwise.
        void doorX
        void doorZ
        cells.push({ x: baseX + x, y: baseY + y, z: baseZ + z })
      }
    }
  }
  // Flat roof layer.
  for (let x = 0; x < W; x++) {
    for (let z = 0; z < W; z++) {
      cells.push({ x: baseX + x, y: baseY + H, z: baseZ + z })
    }
  }
  return cells
}

async function placeAt(bot: Bot, x: number, y: number, z: number): Promise<boolean> {
  const faces = [
    { face: new Vec3(0, 1, 0), ref: new Vec3(x, y - 1, z) },
    { face: new Vec3(1, 0, 0), ref: new Vec3(x - 1, y, z) },
    { face: new Vec3(-1, 0, 0), ref: new Vec3(x + 1, y, z) },
    { face: new Vec3(0, 0, 1), ref: new Vec3(x, y, z - 1) },
    { face: new Vec3(0, 0, -1), ref: new Vec3(x, y, z + 1) },
  ]
  try {
    bot.pathfinder?.setGoal(null)
    // Walk closer if far.
    if (bot.entity && bot.pathfinder) {
      const d = bot.entity.position.distanceTo(new Vec3(x + 0.5, y, z + 0.5))
      if (d > 3.8) {
        bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 2))
        await sleep(250)
        bot.pathfinder.setGoal(null)
      }
    }
    for (const step of faces) {
      const ref = bot.blockAt(step.ref)
      if (!ref || ref.name === 'air' || ref.name === 'cave_air' || ref.name === 'void_air') continue
      if (ref.name.includes('water') || ref.name.includes('lava')) continue
      await bot.lookAt(ref.position.offset(0.5, 0.5, 0.5), true)
      try {
        await bot.placeBlock(ref, step.face)
        await sleep(80)
        return true
      } catch {
        continue
      }
    }
  } catch {
    return false
  }
  return false
}

async function ensureHouseItem(bot: Bot): Promise<string | null> {
  try {
    bot.chat('/give @s oak_planks 64')
    await sleep(400)
    const stack = bot.inventory?.items()?.find((it) => it.name === 'oak_planks' || PLACE_NAMES.test(it.name))
    if (stack) {
      try {
        await bot.equip(stack, 'hand')
      } catch {
        /* ignore */
      }
      return stack.name
    }
  } catch {
    /* ignore */
  }
  return ensurePlaceItem(bot)
}

async function giveTo(bot: Bot, username: string): Promise<string> {
  const item = pickGiveItem(bot) ?? GIVE_FALLBACK
  // Prefer server give when op; works even with empty inventory.
  try {
    bot.chat(`/give ${username} ${item} 8`)
    return giveOk(item, username)
  } catch {
    /* fall through */
  }
  const stack = bot.inventory?.items()?.find((it) => PLACE_NAMES.test(it.name) || /_log|dirt|cobble|planks|apple|bread|cooked/i.test(it.name))
  if (!stack) return giveMiss(username)
  try {
    const entity = bot.players[username]?.entity
    if (entity?.position) await bot.lookAt(entity.position.offset(0, 1, 0), true)
    await bot.toss(stack.type, null, Math.min(8, stack.count))
    return giveOk(stack.name, username)
  } catch {
    return giveMiss(username)
  }
}

/** Soft autonomous wander / look-at / come-near while idle (no dig). */
export async function softIdleMove(
  bot: Bot,
  options: {
    lookName?: string | null
    comeName?: string | null
    wander?: boolean
  },
): Promise<string | null> {
  if (!bot.entity) return null
  const lookName = options.lookName?.trim() || null
  const comeName = options.comeName?.trim() || null

  if (comeName && bot.pathfinder) {
    const entity = bot.players[comeName]?.entity
    if (entity?.position) {
      const { x, y, z } = entity.position
      bot.pathfinder.setGoal(new goals.GoalNear(Math.floor(x), Math.floor(y), Math.floor(z), 3))
      return comeOk(comeName)
    }
  }

  if (lookName) {
    const entity = bot.players[lookName]?.entity
    if (entity?.position) {
      const height = typeof entity.height === 'number' ? entity.height : 1.62
      await bot.lookAt(entity.position.offset(0, height * 0.9, 0), true)
      return lookOk(lookName)
    }
  }

  if (options.wander && bot.pathfinder) {
    const me = bot.entity.position
    const dx = Math.floor(Math.random() * 9) - 4
    const dz = Math.floor(Math.random() * 9) - 4
    if (dx === 0 && dz === 0) return null
    const tx = Math.floor(me.x + dx)
    const ty = Math.floor(me.y)
    const tz = Math.floor(me.z + dz)
    bot.pathfinder.setGoal(new goals.GoalNear(tx, ty, tz, 1))
    return `I am walking around near ${tx}, ${tz}.`
  }

  return null
}

/**
 * When the kid digs/places nearby, lightly join in (one block) so co-op feels real.
 * Returns a short note or null if nothing to do.
 */
export async function softAssistNear(
  bot: Bot,
  username: string,
  kind: 'dig' | 'build',
): Promise<string | null> {
  const entity = bot.players[username]?.entity
  if (!entity?.position || !bot.entity?.position) return null
  const dist = bot.entity.position.distanceTo(entity.position)
  if (dist > 8) {
    if (bot.pathfinder) {
      const { x, y, z } = entity.position
      bot.pathfinder.setGoal(new goals.GoalNear(Math.floor(x), Math.floor(y), Math.floor(z), 2))
    }
    return comeOk(username)
  }
  if (kind === 'dig') {
    const note = await digNear(bot, username)
    return /cannot find|cannot walk/i.test(note) ? null : note
  }
  const note = await buildNear(bot, username)
  return /cannot place|cannot walk/i.test(note) ? null : note
}

function findDiggableNear(
  bot: Bot,
  around: { x: number; y: number; z: number; offset?: (dx: number, dy: number, dz: number) => { x: number; y: number; z: number } },
  maxDistance: number,
) {
  try {
    const positions = bot.findBlocks({
      matching: (block) => Boolean(block?.name && DIG_NAMES.test(block.name)),
      maxDistance,
      count: 24,
      point: around as never,
    })
    const me = bot.entity?.position
    let best: { block: NonNullable<ReturnType<Bot['blockAt']>>; d: number } | null = null
    for (const pos of positions) {
      const block = bot.blockAt(pos)
      if (!block) continue
      // Prefer blocks we can reach without scaffolding.
      const dMe = me ? me.distanceTo(block.position) : 99
      if (dMe > 4.5) continue
      if (!best || dMe < best.d) best = { block, d: dMe }
    }
    return best?.block ?? null
  } catch {
    return null
  }
}

function findPlaceSpotNear(
  bot: Bot,
  around: { x: number; y: number; z: number },
  maxDistance: number,
): { ref: NonNullable<ReturnType<Bot['blockAt']>>; face: Vec3 } | null {
  const me = bot.entity?.position
  if (!me) return null
  const faces = [
    new Vec3(0, 1, 0),
    new Vec3(1, 0, 0),
    new Vec3(-1, 0, 0),
    new Vec3(0, 0, 1),
    new Vec3(0, 0, -1),
  ]
  try {
    const positions = bot.findBlocks({
      matching: (block) => {
        if (!block?.name) return false
        if (block.name === 'air' || block.name === 'cave_air' || block.name === 'void_air') return false
        if (block.name.includes('water') || block.name.includes('lava')) return false
        return true
      },
      maxDistance,
      count: 30,
      point: around as never,
    })
    for (const pos of positions) {
      const ref = bot.blockAt(pos)
      if (!ref) continue
      if (me.distanceTo(ref.position) > 4.2) continue
      for (const face of faces) {
        const dest = ref.position.offset(face.x, face.y, face.z)
        const air = bot.blockAt(dest)
        if (!air || (air.name !== 'air' && air.name !== 'cave_air')) continue
        // Avoid placing inside the player.
        if (Math.abs(dest.x + 0.5 - around.x) < 0.7 && Math.abs(dest.z + 0.5 - around.z) < 0.7 && Math.abs(dest.y - around.y) < 1.6) {
          continue
        }
        return { ref, face }
      }
    }
  } catch {
    return null
  }
  return null
}

async function ensurePlaceItem(bot: Bot): Promise<string | null> {
  const held = bot.heldItem
  if (held && PLACE_NAMES.test(held.name)) return held.name
  const stack = bot.inventory?.items()?.find((it) => PLACE_NAMES.test(it.name))
  if (stack) {
    try {
      await bot.equip(stack, 'hand')
      return stack.name
    } catch {
      return stack.name
    }
  }
  // Op bots can spawn a few dirt blocks to place with the kid.
  try {
    bot.chat('/give @s dirt 16')
    await sleep(350)
    const again = bot.inventory?.items()?.find((it) => it.name === 'dirt')
    if (again) {
      try {
        await bot.equip(again, 'hand')
      } catch {
        /* ignore */
      }
      return 'dirt'
    }
  } catch {
    /* ignore */
  }
  return null
}

function pickGiveItem(bot: Bot): string | null {
  const stack = bot.inventory?.items()?.find((it) => PLACE_NAMES.test(it.name) || /apple|bread|cooked|torch/i.test(it.name))
  return stack?.name ?? null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
