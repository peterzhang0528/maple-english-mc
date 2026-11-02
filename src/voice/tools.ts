import type { Difficulty } from '../config.js'
import { explainBlock } from '../behavior/blocks.js'
import { parseIntents } from '../behavior/intents.js'
import { explainCraft, lessonText } from '../behavior/recipes.js'
import type { Intent } from '../types.js'
import { planWebAction, type WebAction } from '../web/chat.js'
import { MAPLE_TOOL_NAME } from './protocol.js'

export interface ToolWorld {
  lookingAt: string | null
  difficulty: Difficulty
}

export interface MapleToolEffect {
  action: WebAction
  intents: Intent[]
  note: string
  output: string
  /** Show this note in the text chat (recipes and block lessons). */
  chat: boolean
}

const BLOCK_NAME = /^[a-z0-9_]{1,64}$/

export function effectFromToolCall(name: string, argumentsJson: string, world: ToolWorld): MapleToolEffect {
  if (name !== MAPLE_TOOL_NAME) {
    return idle(`Unknown tool ${name}. Tell the player you can follow, wait, look, name a block, or teach a recipe.`)
  }
  let args: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(argumentsJson) as unknown
    if (parsed && typeof parsed === 'object') args = parsed as Record<string, unknown>
  } catch {
    return idle('The tool arguments were not valid JSON.')
  }
  const action = typeof args.action === 'string' ? args.action : ''
  const item = typeof args.item === 'string' ? args.item : ''
  const block = typeof args.block === 'string' && BLOCK_NAME.test(args.block) ? args.block : null
  if (action === 'craft') return effectFromIntents([{ type: 'craft', query: item || 'pickaxe' }], world)
  if (action === 'inspect_block') {
    return effectFromIntents([{ type: 'inspect_block' }], { ...world, lookingAt: block ?? world.lookingAt })
  }
  if (action === 'follow' || action === 'come' || action === 'stop' || action === 'look' || action === 'dig' || action === 'build' || action === 'build_house' || action === 'give' || action === 'assist') {
    return effectFromIntents([{ type: action }], world)
  }
  return idle('Choose follow, come, stop, look, dig, build, build_house, give, assist, inspect_block, or craft.')
}

export function effectFromSpeech(text: string, world: ToolWorld): MapleToolEffect | null {
  const intents = parseIntents(text).filter(
    (intent) =>
      intent.type === 'follow' ||
      intent.type === 'come' ||
      intent.type === 'stop' ||
      intent.type === 'look' ||
      intent.type === 'inspect_block' ||
      intent.type === 'dig' ||
      intent.type === 'build' ||
      intent.type === 'build_house' ||
      intent.type === 'give' ||
      intent.type === 'assist' ||
      intent.type === 'craft',
  )
  if (intents.length === 0) return null
  return effectFromIntents(intents, world)
}

export function effectFromIntents(intents: Intent[], world: ToolWorld): MapleToolEffect {
  const planned = planWebAction(intents, world.lookingAt)
  const lessons: string[] = []
  for (const intent of intents) {
    if (intent.type === 'craft') {
      const lesson = explainCraft(intent.query)
      lessons.push(lesson ? lessonText(lesson, world.difficulty) : `I do not know a crafting recipe for ${intent.query}.`)
    }
    if (intent.type === 'inspect_block') {
      lessons.push(
        world.lookingAt
          ? explainBlock(world.lookingAt, world.difficulty)
          : 'Look at a block, then ask me what it is.',
      )
    }
  }
  const note = [...planned.notes, ...lessons].join(' ').replace(/\s+/g, ' ').trim()
  return {
    action: planned.action,
    intents,
    note,
    output: note || 'Done.',
    chat: lessons.length > 0,
  }
}

function idle(output: string): MapleToolEffect {
  return { action: 'idle', intents: [], note: output, output, chat: false }
}
