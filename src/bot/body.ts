/**
 * Keep Maple/Spark as a visible survival player body (skin + surface near humans).
 * Mineflayer already joins as a real client player; this fights bury/creative/invisible quirks.
 */
import type { Bot } from 'mineflayer'
import { isCompanionUsername } from '../chat/persona.js'

export interface BodySnapshot {
  bodyVisible: true
  name: string
  dimension: string
  gamemode: number | null
  position: { x: number; y: number; z: number } | null
  skinUrl: string | null
  nearHuman: string | null
}

const SKIN_BY_USERNAME: Record<string, string> = {
  maple: 'verity',
  spark: 'verity', // distinctive custom skin already on the Paper SkinsRestorer store
}

export function bodySnapshot(bot: Bot | null | undefined): BodySnapshot | null {
  if (!bot?.entity) return null
  const self = bot.players[bot.username]
  const pos = bot.entity.position
  const human = nearestHumanName(bot)
  return {
    bodyVisible: true,
    name: bot.username,
    dimension: bot.game?.dimension ?? 'unknown',
    gamemode: typeof self?.gamemode === 'number' ? self.gamemode : null,
    position: pos
      ? { x: Number(pos.x.toFixed(2)), y: Number(pos.y.toFixed(2)), z: Number(pos.z.toFixed(2)) }
      : null,
    skinUrl: self?.skinData?.url ?? null,
    nearHuman: human,
  }
}

export function nearestHumanName(bot: Bot): string | null {
  const me = bot.entity?.position
  let best: { name: string; d: number } | null = null
  for (const name of Object.keys(bot.players)) {
    if (name.toLowerCase() === bot.username.toLowerCase()) continue
    if (isCompanionUsername(name)) continue
    const ent = bot.players[name]?.entity
    if (!ent?.position || !me) {
      if (!best) best = { name, d: Number.POSITIVE_INFINITY }
      continue
    }
    const d = me.distanceTo(ent.position)
    if (!best || d < best.d) best = { name, d }
  }
  return best?.name ?? null
}

/** Survival + clear invis + refresh SkinsRestorer skin + short glow so kids can spot Maple. */
export function ensureVisibleBody(bot: Bot, tag: string): void {
  try {
    bot.chat('/gamemode survival')
  } catch {
    /* ignore */
  }
  try {
    bot.chat('/effect clear @s')
  } catch {
    /* ignore */
  }
  const skin = SKIN_BY_USERNAME[bot.username.toLowerCase()]
  if (skin) {
    try {
      bot.chat(`/skin set ${skin}`)
    } catch {
      /* ignore */
    }
  }
  try {
    bot.chat('/effect give @s minecraft:glowing 20 0 true')
  } catch {
    /* ignore */
  }
  // Local world often left bots in a y=60 dirt pocket — nudge up once on ensure.
  try {
    const y = bot.entity?.position?.y
    const guiding = (bot as { mapleQuest?: { guiding: () => boolean } }).mapleQuest?.guiding()
    if (!guiding && typeof y === 'number' && y < 64) {
      bot.chat('/tp @s ~ 72 ~')
    }
  } catch {
    /* ignore */
  }
  const snap = bodySnapshot(bot)
  console.log(
    `[${tag}] body visible as ${bot.username}` +
      (snap?.position ? ` @ ${snap.position.x},${snap.position.y},${snap.position.z}` : '') +
      (snap?.skinUrl ? ` skin=${snap.skinUrl}` : ' skin=default-or-pending') +
      ` gamemode=${snap?.gamemode ?? '?'}`,
  )
}

/**
 * If a human is online and we are buried / far below them, cancel pathing and walk up to them.
 * Returns the human username when a rescue walk should start.
 */
export function rescueIfBuried(bot: Bot, tag: string): string | null {
  const human = nearestHumanName(bot)
  if (!human || !bot.entity) return null
  const target = bot.players[human]?.entity
  if (!target?.position) return null
  const me = bot.entity.position
  const dy = me.y - target.position.y
  const horiz = Math.hypot(me.x - target.position.x, me.z - target.position.z)
  const buried = dy < -2.5
  const far = horiz > 14
  if (!buried && !far) return null
  bot.pathfinder?.setGoal(null)
  console.log(
    `[${tag}] body rescue -> ${human} (dy=${dy.toFixed(1)} horiz=${horiz.toFixed(1)} buried=${buried})`,
  )
  return human
}
