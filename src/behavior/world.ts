import type { Bot } from 'mineflayer'
import type { WorldSnapshot } from '../types.js'
import { prettyName } from './phrases.js'

export function snapshotWorld(
  bot: Bot,
  username: string,
  actionNotes: string[],
  observations: string[] = [],
): WorldSnapshot {
  const position = bot.entity?.position
  const feet = position ? bot.blockAt(position) : null
  return {
    dimension: bot.game?.dimension ?? 'unknown',
    biome: feet?.biome?.name ?? 'unknown',
    timeOfDay: timeOfDay(bot.time?.timeOfDay),
    weather: weather(bot),
    position: position
      ? { x: Math.round(position.x), y: Math.round(position.y), z: Math.round(position.z) }
      : null,
    heldItem: bot.heldItem?.name ?? null,
    playerHeldItem: heldName(bot, username),
    lookingAt: lookingAt(bot, username),
    nearbyBlocks: nearbyBlocks(bot),
    actionNotes,
    observations: observations.slice(0, 6),
  }
}

function timeOfDay(ticks: number | undefined): WorldSnapshot['timeOfDay'] {
  if (ticks == null) return 'unknown'
  return ticks >= 0 && ticks < 12_000 ? 'day' : 'night'
}

function weather(bot: Bot): WorldSnapshot['weather'] {
  if (bot.thunderState > 0) return 'thunder'
  if (bot.isRaining) return 'rain'
  return 'clear'
}

function lookingAt(bot: Bot, username: string): string | null {
  const entity = bot.players[username]?.entity
  if (!entity) return null
  try {
    const block = bot.blockAtEntityCursor(entity, 5)
    if (!block || block.name === 'air' || block.name === 'cave_air' || block.name === 'void_air') return null
    return block.name
  } catch {
    return null
  }
}

function nearbyBlocks(bot: Bot): string[] {
  try {
    const positions = bot.findBlocks({
      matching: (block) => block.name !== 'air' && block.name !== 'cave_air' && block.name !== 'void_air',
      maxDistance: 6,
      count: 40,
    })
    const counts = new Map<string, number>()
    for (const position of positions) {
      const block = bot.blockAt(position)
      if (!block) continue
      counts.set(block.name, (counts.get(block.name) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => prettyName(name))
  } catch {
    return []
  }
}

function heldName(bot: Bot, username: string): string | null {
  const entity = bot.players[username]?.entity as { heldItem?: { name?: string } } | undefined
  return entity?.heldItem?.name ?? null
}
