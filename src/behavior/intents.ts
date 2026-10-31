import type { Difficulty } from '../config.js'
import type { Intent } from '../types.js'
import { resolveItemName } from './recipes.js'

export function parseIntents(text: string): Intent[] {
  const raw = text.trim()
  const lower = raw.toLowerCase()
  const intents: Intent[] = []

  if (isHelp(lower)) intents.push({ type: 'help' })

  const difficulty = matchDifficulty(lower)
  if (difficulty) intents.push({ type: 'set_difficulty', difficulty })

  if (isStop(lower)) intents.push({ type: 'stop' })
  else if (isFollow(lower)) intents.push({ type: 'follow' })

  if (isCome(lower)) intents.push({ type: 'come' })
  if (isInspect(lower)) intents.push({ type: 'inspect_block' })
  else if (isLook(lower)) intents.push({ type: 'look' })

  const craft = matchCraft(raw)
  if (craft) intents.push({ type: 'craft', query: craft })

  if (intents.length === 0) intents.push({ type: 'chat' })
  return intents
}

function isHelp(lower: string): boolean {
  if (/^!help\b/.test(lower)) return true
  return /^(help|what can you do|what can you help with)\b/.test(lower) && !/\b(craft|make|follow|block)\b/.test(lower)
}

function matchDifficulty(lower: string): Difficulty | null {
  if (/\b(intermediate|harder english|more advanced)\b|!mid\b|!intermediate\b/.test(lower)) {
    return 'intermediate'
  }
  if (/\b(beginner|easy english|simpler english|easier english)\b|!easy\b|!beginner\b/.test(lower)) {
    return 'beginner'
  }
  return null
}

function isStop(lower: string): boolean {
  return /\b(stop following|wait here|stay here|stay there|stand still|do not follow|don't follow)\b|!stop\b|!wait\b|!stay\b/.test(
    lower,
  ) || /^stop\b/.test(lower)
}

function isFollow(lower: string): boolean {
  return /\b(follow me|come with me|stay with me|walk with me)\b|!follow\b/.test(lower) || /^follow\b/.test(lower)
}

function isCome(lower: string): boolean {
  if (/\bcome with me\b/.test(lower)) return false
  return /\b(come here|come to me|come over|over here)\b|!come\b/.test(lower)
}

function isInspect(lower: string): boolean {
  return /what(?:'s| is) this(?: block)?|what block|what am i looking at|look at (?:this|that)(?: block)?|!block\b/.test(
    lower,
  )
}

function isLook(lower: string): boolean {
  return /\b(look at me|look here|eyes on me)\b|!look\b/.test(lower)
}

function matchCraft(text: string): string | null {
  const explicit =
    text.match(/how (?:do i|can i|to) (?:craft|make)\s+(?:a |an |the )?([a-z0-9][a-z0-9 _-]{0,40})/i) ??
    text.match(/\b(?:crafting|craft|recipe for)\s+(?:a |an |the )?([a-z0-9][a-z0-9 _-]{0,40})/i)
  if (explicit?.[1]) return cleanQuery(explicit[1])

  const made = text.match(/\bmake\s+(?:a |an |the )?([a-z0-9][a-z0-9 _-]{0,40})/i)
  if (!made?.[1]) return null
  const query = cleanQuery(made[1])
  if (/^(house|home|base|friend|shelter)$/.test(query)) return null
  if (!resolveItemName(query)) return null
  return query
}

function cleanQuery(query: string): string {
  return query.replace(/[?.!,]+$/g, '').replace(/^(a|an|the)\s+/i, '').trim()
}
