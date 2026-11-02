import type { Bot } from 'mineflayer'
import type { AppConfig } from '../config.js'
import { SendQueue } from '../chat/limiter.js'
import { toChatLines } from '../chat/split.js'
import { redactSecrets } from '../voice/config.js'
import { performIntents } from '../behavior/actions.js'
import { parseIntents } from '../behavior/intents.js'
import type { Intent } from '../types.js'
import { isCompanionUsername } from '../chat/persona.js'

const MOVE_TYPES = new Set(['follow', 'come', 'stop', 'look', 'inspect_block', 'dig', 'build', 'build_house', 'give', 'assist'])
const DEDUPE_MS = 8_000

export interface VoiceMouth {
  lastText: string
  lastAt: number
}

export function createVoiceMouth(): VoiceMouth {
  return { lastText: '', lastAt: 0 }
}

export function listCompanionPlayers(bot: Bot | null): string[] {
  if (!bot?.players) return []
  const self = bot.username.toLowerCase()
  return Object.keys(bot.players)
    .filter((name) => name.toLowerCase() !== self && !isCompanionUsername(name))
    .sort((a, b) => a.localeCompare(b))
}

/**
 * Who Maple should walk toward. A typed name wins when that player is online.
 * Otherwise one allowlisted player, or the only other person in the world.
 */
export function chooseVoicePlayer(input: {
  botUsername: string
  online: string[]
  allowlist: string[]
  requested: string | null
}): string | null {
  const self = input.botUsername.toLowerCase()
  const others = input.online.filter((name) => name.toLowerCase() !== self && !isCompanionUsername(name))
  const allowed = others.filter(
    (name) => input.allowlist.length === 0 || input.allowlist.includes(name.toLowerCase()),
  )
  if (input.requested) {
    return allowed.find((name) => name.toLowerCase() === input.requested?.toLowerCase()) ?? null
  }
  if (input.allowlist.length === 1) {
    return allowed.find((name) => name.toLowerCase() === input.allowlist[0]) ?? null
  }
  if (allowed.length === 1) return allowed[0] ?? null
  return null
}

export function readVoiceIntents(message: Record<string, unknown>): Intent[] {
  if (message.type !== 'action') return []
  const parsed = intentsFromList(message.intents)
  if (parsed.length > 0) return parsed
  const action = message.action
  if (action === 'follow' || action === 'come' || action === 'stop' || action === 'look') {
    return [{ type: action }]
  }
  return []
}

export async function applySpokenTurn(input: {
  bot: Bot | null
  config: AppConfig
  queue: SendQueue
  mouth: VoiceMouth
  requestedPlayer: string | null
  message: Record<string, unknown>
  secrets?: string[]
  now?: number
}): Promise<void> {
  const message = input.message
  if (message.type === 'user_text' && message.final === true && typeof message.text === 'string') {
    const heard = message.text.replace(/\s+/g, ' ').trim().slice(0, 300)
    if (heard) console.log(`[maple] heard: ${heard}`)
    // Pause peer party chat so Maple/Spark do not talk over the kid on mic.
    if (heard && input.bot) {
      ;(input.bot as { mapleHumanChatAt?: number }).mapleHumanChatAt = input.now ?? Date.now()
      const remember = (input.bot as { mapleRememberSaid?: (t: string) => void }).mapleRememberSaid
      if (typeof remember === 'function') remember(heard)
    }
    // GPT Live only posts transcripts (no tool/action channel). Parse walk intents here
    // the same way Doubao's effectFromSpeech does, so "come here / follow me" moves the body.
    const intents = parseIntents(heard).filter((intent) => MOVE_TYPES.has(intent.type))
    if (intents.length > 0) await performVoiceIntents(input, intents)
    return
  }

  if (message.type === 'action') {
    const intents = readVoiceIntents(message)
    if (intents.length === 0) return
    await performVoiceIntents(input, intents)
    return
  }

  if (message.type === 'maple_text' && message.final === true && typeof message.text === 'string') {
    await say(input, message.text)
  }
}

async function performVoiceIntents(
  input: {
    bot: Bot | null
    config: AppConfig
    queue: SendQueue
    mouth: VoiceMouth
    requestedPlayer: string | null
    secrets?: string[]
    now?: number
  },
  intents: Intent[],
): Promise<void> {
  const bot = input.bot
  if (!bot) {
    console.log('[maple] Voice action is waiting until Maple has joined the Java server.')
    return
  }
  const player = chooseVoicePlayer({
    botUsername: bot.username,
    online: listCompanionPlayers(bot),
    allowlist: input.config.playerAllowlist,
    requested: input.requestedPlayer,
  })
  if (!player) {
    const hint = input.requestedPlayer
      ? `I cannot see ${input.requestedPlayer} yet. Join the Java world, then say follow me again.`
      : 'I cannot see you yet. Type your Minecraft name in the voice window, then stand near me.'
    await say(input, hint)
    return
  }
  console.log(`[maple] voice ${intents.map((intent) => intent.type).join(', ')} -> ${player}`)
  const marked = bot as { mapleHoldStillUntil?: number }
  if (intents.some((intent) => intent.type === 'stop')) marked.mapleHoldStillUntil = Date.now() + 45_000
  else if (intents.some((intent) => intent.type === 'follow' || intent.type === 'come' || intent.type === 'dig' || intent.type === 'build' || intent.type === 'build_house' || intent.type === 'give' || intent.type === 'assist')) marked.mapleHoldStillUntil = 0
  let notes: string[] = []
  try {
    notes = await performIntents(bot, player, intents)
  } catch (error) {
    console.error(`[maple] voice action: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  for (const note of notes) {
    if (/cannot|not sure/i.test(note)) await say(input, note)
  }
}

async function say(
  input: {
    bot: Bot | null
    config: AppConfig
    queue: SendQueue
    mouth: VoiceMouth
    requestedPlayer: string | null
    secrets?: string[]
    now?: number
  },
  text: string,
): Promise<void> {
  const bot = input.bot
  if (!bot) return
  const clean = redactSecrets(text, input.secrets ?? []).replace(/\s+/g, ' ').trim()
  if (!clean) return
  const now = input.now ?? Date.now()
  if (clean === input.mouth.lastText && now - input.mouth.lastAt < DEDUPE_MS) return
  input.mouth.lastText = clean
  input.mouth.lastAt = now
  const lines = toChatLines(clean, input.config.chatMaxLineChars, input.config.chatMaxLines)
  if (lines.length === 0) return
  const player = chooseVoicePlayer({
    botUsername: bot.username,
    online: listCompanionPlayers(bot),
    allowlist: input.config.playerAllowlist,
    requested: input.requestedPlayer,
  })
  const whisper = input.config.chatMode === 'whisper' && Boolean(player)
  await input.queue.send(lines, (line) => {
    try {
      if (whisper && player) bot.whisper(player, line)
      else bot.chat(line)
    } catch (error) {
      console.error(`[maple] voice chat: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

function intentsFromList(value: unknown): Intent[] {
  if (!Array.isArray(value)) return []
  const intents: Intent[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const type = (item as { type?: unknown }).type
    if (typeof type === 'string' && MOVE_TYPES.has(type)) intents.push({ type } as Intent)
  }
  return intents
}
