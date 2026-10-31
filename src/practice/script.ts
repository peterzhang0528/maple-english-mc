import type { AppConfig, Difficulty } from '../config.js'
import { parseIntents } from '../behavior/intents.js'
import { completeTurn } from '../chat/turn.js'
import { createSession, emptyWorld, type Intent } from '../types.js'

export interface PracticeLine {
  say: string
  lookingAt?: string
}

/** The in-game walkthrough from the README, played through the local tutor. */
export const PRACTICE_SCRIPT: PracticeLine[] = [
  { say: 'Hello! I want go mining.' },
  { say: 'follow me' },
  { say: 'what is this block?', lookingAt: 'oak_log' },
  { say: 'how do I craft a pickaxe?' },
  { say: 'let us use intermediate English' },
  { say: 'come here' },
]

export interface PracticeBeat {
  say: string
  reply: string
  lines: string[]
  intents: Intent[]
  difficulty: Difficulty
}

export async function runPracticeScript(config?: Partial<AppConfig>): Promise<PracticeBeat[]> {
  const session = createSession('beginner', 8)
  const beats: PracticeBeat[] = []
  const app = {
    chatMaxLineChars: 180,
    chatMaxLines: 3,
    anthropicModel: 'claude-opus-5-5',
    anthropicMaxTokens: 2048,
    anthropicEffort: 'low' as const,
    openaiModel: 'gpt-4.1',
    openaiMaxTokens: 512,
    versionLabel: '1.21.4',
    ...config,
  }
  for (const line of PRACTICE_SCRIPT) {
    const intents = parseIntents(line.say)
    const world = emptyWorld(notesFor(intents))
    world.biome = 'plains'
    world.timeOfDay = 'day'
    world.weather = 'clear'
    world.dimension = 'overworld'
    world.lookingAt = line.lookingAt ?? null
    world.nearbyBlocks = ['grass block', 'oak log', 'dirt']
    const turn = await completeTurn({
      config: app,
      session,
      username: 'Steve',
      text: line.say,
      world,
      intents,
    })
    beats.push({
      say: line.say,
      reply: turn.reply,
      lines: turn.lines,
      intents: turn.intents,
      difficulty: session.difficulty,
    })
  }
  return beats
}

function notesFor(intents: Intent[]): string[] {
  const notes: string[] = []
  for (const intent of intents) {
    if (intent.type === 'follow') notes.push('I am following Steve.')
    if (intent.type === 'come') notes.push('I am walking to Steve.')
    if (intent.type === 'stop') notes.push('I will wait here.')
    if (intent.type === 'look') notes.push('I am looking at Steve.')
    if (intent.type === 'inspect_block') notes.push('I am looking at oak log.')
  }
  return notes
}
