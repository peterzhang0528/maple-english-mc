import type { Difficulty } from '../config.js'
import type { Intent } from '../types.js'
import { resolveItemName } from './recipes.js'

export function parseIntents(text: string): Intent[] {
  const raw = text.trim()
  const lower = raw.toLowerCase()
  const intents: Intent[] = []

  // House blueprint wins over generic "help me" so we do not dig first.
  if (isBuildHouse(lower)) intents.push({ type: 'build_house' })
  else if (isAssist(lower)) intents.push({ type: 'assist' })
  else if (isHelp(lower)) intents.push({ type: 'help' })

  const difficulty = matchDifficulty(lower)
  if (difficulty) intents.push({ type: 'set_difficulty', difficulty })

  if (isStop(lower)) intents.push({ type: 'stop' })
  else if (isFollow(lower)) intents.push({ type: 'follow' })

  if (isCome(lower)) intents.push({ type: 'come' })
  if (isInspect(lower)) intents.push({ type: 'inspect_block' })
  else if (isLook(lower)) intents.push({ type: 'look' })

  if (isDig(lower)) intents.push({ type: 'dig' })
  if (!isBuildHouse(lower) && isBuild(lower)) intents.push({ type: 'build' })
  if (isGive(lower)) intents.push({ type: 'give' })

  const craft = matchCraft(raw)
  if (craft) intents.push({ type: 'craft', query: craft })

  if (intents.length === 0) intents.push({ type: 'chat' })
  return intents
}

/** Gameplay help: come help / dig / build with me — not the meta !help list. */
function isAssist(lower: string): boolean {
  if (/\b(help me|need help|can you help|please help|come help|help please)\b/.test(lower)) return true
  if (/^help[!?.]*$/.test(lower)) return true
  return false
}

function isHelp(lower: string): boolean {
  if (/^!help\b/.test(lower)) return true
  return /^(what can you do|what can you help with)\b/.test(lower)
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
  return (
    /\b(follow me|come with me|stay with me|walk with me|follow us)\b|!follow\b/.test(lower) ||
    /^follow\b/.test(lower) ||
    /\b(can you move|move around|start moving|walk around|please move)\b/.test(lower) ||
    /\b(lead the way|lead me|go ahead|let'?s go|go go go)\b/.test(lower) ||
    /\bgo,? go\b/.test(lower)
  )
}

function isCome(lower: string): boolean {
  if (/\bcome with me\b/.test(lower)) return false
  if (/\bcome help\b/.test(lower)) return false
  return (
    /\b(come here|come to me|come over|over here|come maple|maple,? come|come spark|spark,? come)\b|!come\b/.test(
      lower,
    ) || /^come\b/.test(lower)
  )
}

function isInspect(lower: string): boolean {
  return /what(?:'s| is) this(?: block)?|what block|what am i looking at|look at (?:this|that)(?: block)?|!block\b/.test(
    lower,
  )
}

function isLook(lower: string): boolean {
  return /\b(look at me|look here|eyes on me)\b|!look\b/.test(lower)
}

function isDig(lower: string): boolean {
  if (/\b(how (?:do i|can i|to) (?:craft|make)|recipe for)\b/.test(lower)) return false
  return (
    /\b(dig with me|let'?s dig|dig together|mine with me|chop with me|help me dig|dig here|start digging)\b|!dig\b/.test(
      lower,
    ) ||
    /^dig\b/.test(lower) ||
    /\b(chop (?:this|that|wood|tree)|mine (?:this|that|stone|here))\b/.test(lower)
  )
}

function isBuildHouse(lower: string): boolean {
  return (
    /\b(build (?:a |our |the |my )?house|let'?s build (?:a |our |the |my )?house|make (?:a |our |the |my )?house|help me build (?:a |our |the |my )?house|build house|house please)\b|!house\b/.test(
      lower,
    ) || /^house\b/.test(lower)
  )
}

function isBuild(lower: string): boolean {
  if (isBuildHouse(lower)) return false
  return (
    /\b(build with me|let'?s build|build together|help me build|build a bridge|place (?:a |the )?block|put it here|put one here|one more block)\b|!build\b/.test(
      lower,
    ) || /^build\b/.test(lower)
  )
}

function isGive(lower: string): boolean {
  return (
    /\b(give me|give (?:me )?(?:some )?(?:wood|stone|dirt|food|blocks|items)|share with me|can i have|toss me|drop me)\b|!give\b/.test(
      lower,
    ) || /^give\b/.test(lower)
  )
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
