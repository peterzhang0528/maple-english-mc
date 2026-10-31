import type { Bot } from 'mineflayer'
import { goals } from '../pathfinder.js'
import type { Intent } from '../types.js'
import {
  cannotWalk,
  comeBlind,
  comeOk,
  followBlind,
  followOk,
  inspectMiss,
  inspectOk,
  lookBlind,
  lookOk,
  waitOk,
} from './phrases.js'

const FOLLOW_RANGE = 2

export async function performIntents(bot: Bot, username: string, intents: Intent[]): Promise<string[]> {
  const notes: string[] = []
  for (const intent of intents) {
    if (intent.type === 'follow') notes.push(follow(bot, username))
    else if (intent.type === 'come') notes.push(come(bot, username))
    else if (intent.type === 'stop') notes.push(stop(bot))
    else if (intent.type === 'look') notes.push(await look(bot, username))
    else if (intent.type === 'inspect_block') notes.push(await inspect(bot, username))
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
