import type { Difficulty } from './config.js'

export type { Difficulty }

export type Intent =
  | { type: 'follow' }
  | { type: 'come' }
  | { type: 'stop' }
  | { type: 'look' }
  | { type: 'inspect_block' }
  | { type: 'craft'; query: string }
  | { type: 'set_difficulty'; difficulty: Difficulty }
  | { type: 'help' }
  | { type: 'chat' }

export interface WorldSnapshot {
  dimension: string
  biome: string
  timeOfDay: 'day' | 'night' | 'unknown'
  weather: 'clear' | 'rain' | 'thunder' | 'unknown'
  position: { x: number; y: number; z: number } | null
  heldItem: string | null
  playerHeldItem: string | null
  lookingAt: string | null
  nearbyBlocks: string[]
  actionNotes: string[]
  /** Recent eyes/ears notes (dig, place, nearby, etc.). */
  observations: string[]
}

export interface HistoryEntry {
  role: 'user' | 'assistant'
  content: string
}

export interface Session {
  difficulty: Difficulty
  history: HistoryEntry[]
  historyTurns: number
}

export function createSession(difficulty: Difficulty, historyTurns: number): Session {
  return { difficulty, history: [], historyTurns }
}

export function emptyWorld(notes: string[] = []): WorldSnapshot {
  return {
    dimension: 'unknown',
    biome: 'unknown',
    timeOfDay: 'unknown',
    weather: 'unknown',
    position: null,
    heldItem: null,
    playerHeldItem: null,
    lookingAt: null,
    nearbyBlocks: [],
    actionNotes: notes,
    observations: [],
  }
}

export function describeIntent(intent: Intent): string {
  if (intent.type === 'craft') return `craft ${intent.query}`
  if (intent.type === 'set_difficulty') return `difficulty ${intent.difficulty}`
  return intent.type
}
