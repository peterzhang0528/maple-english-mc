import { loadPersona, type CompanionPersona } from './chat/persona.js'
/**
 * Claude Opus 5.5 on the Claude API.
 * Fixed model id with no date suffix (released 2026-09-22).
 * https://platform.claude.com/docs/en/models/opus-5-5/overview
 */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5'

export type Difficulty = 'beginner' | 'intermediate'
export type ChatMode = 'chat' | 'whisper'
export type AuthMode = 'offline' | 'microsoft'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type { CompanionPersona }

export interface AppConfig {
  host: string
  port: number
  username: string
  auth: AuthMode
  /** `false` lets Mineflayer detect the server version. */
  version: string | false
  versionLabel: string
  playerAllowlist: string[]
  chatMode: ChatMode
  chatMaxLineChars: number
  chatMaxLines: number
  chatMinIntervalMs: number
  playerMinIntervalMs: number
  muteMs: number
  globalTurns: number
  globalWindowMs: number
  difficulty: Difficulty
  greet: boolean
  reconnects: number
  anthropicApiKey?: string
  anthropicModel: string
  anthropicMaxTokens: number
  anthropicEffort: Effort
  openaiApiKey?: string
  openaiModel: string
  openaiMaxTokens: number
  historyTurns: number
  profilesFolder: string
  persona: CompanionPersona
}

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const auth = oneOf(env, 'MC_AUTH', ['offline', 'microsoft'] as const, 'offline')
  const username = (env.MC_USERNAME ?? 'Maple').trim() || 'Maple'
  if (auth === 'offline' && !/^[A-Za-z0-9_]{3,16}$/.test(username)) {
    throw new Error('MC_USERNAME must be 3-16 letters, numbers, or underscores when MC_AUTH=offline')
  }

  const versionRaw = (env.MC_VERSION ?? '1.21.4').trim()
  const auto = versionRaw === '' || versionRaw.toLowerCase() === 'auto'
  const host = (env.MC_HOST ?? '127.0.0.1').trim()
  if (!host) throw new Error('MC_HOST is empty')

  const allow = (env.MC_PLAYER ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)

  const key = env.ANTHROPIC_API_KEY?.trim()
  const openaiKey = env.OPENAI_API_KEY?.trim()

  return {
    host,
    port: integer(env, 'MC_PORT', 25565, 1, 65535),
    username,
    auth,
    version: auto ? false : versionRaw,
    versionLabel: auto ? 'auto' : versionRaw,
    playerAllowlist: allow,
    chatMode: oneOf(env, 'CHAT_MODE', ['chat', 'whisper'] as const, 'chat'),
    chatMaxLineChars: integer(env, 'CHAT_MAX_LINE_CHARS', 180, 40, 240),
    chatMaxLines: integer(env, 'CHAT_MAX_LINES', 3, 1, 5),
    chatMinIntervalMs: integer(env, 'CHAT_MIN_INTERVAL_MS', 900, 0, 10_000),
    playerMinIntervalMs: integer(env, 'PLAYER_MIN_INTERVAL_MS', 1200, 0, 30_000),
    muteMs: 5_000,
    globalTurns: integer(env, 'GLOBAL_TURNS', 6, 1, 100),
    globalWindowMs: integer(env, 'GLOBAL_WINDOW_MS', 30_000, 1_000, 120_000),
    difficulty: oneOf(env, 'ENGLISH_DIFFICULTY', ['beginner', 'intermediate'] as const, 'beginner'),
    greet: flag(env, 'MC_GREET', true),
    reconnects: integer(env, 'MC_RECONNECTS', 3, 0, 20),
    ...(key ? { anthropicApiKey: key } : {}),
    anthropicModel: (env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL).trim() || DEFAULT_ANTHROPIC_MODEL,
    anthropicMaxTokens: integer(env, 'ANTHROPIC_MAX_TOKENS', 2048, 256, 32_000),
    anthropicEffort: oneOf(env, 'ANTHROPIC_EFFORT', EFFORTS, 'low'),
    ...(openaiKey ? { openaiApiKey: openaiKey } : {}),
    openaiModel: (env.OPENAI_MODEL ?? 'gpt-4.1').trim() || 'gpt-4.1',
    openaiMaxTokens: integer(env, 'OPENAI_MAX_TOKENS', 512, 64, 8192),
    historyTurns: integer(env, 'HISTORY_TURNS', 8, 1, 20),
    profilesFolder: '.minecraft-auth',
    persona: loadPersona(env),
  }
}

function integer(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name]
  if (raw == null || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`)
  }
  return value
}

function oneOf<T extends string>(
  env: NodeJS.ProcessEnv,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = env[name]
  const value = (raw == null || raw.trim() === '' ? fallback : raw.trim().toLowerCase()) as T
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`)
  }
  return value
}

function flag(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name]
  if (raw == null || raw.trim() === '') return fallback
  const value = raw.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(value)) return true
  if (['0', 'false', 'no', 'off'].includes(value)) return false
  throw new Error(`${name} must be true or false`)
}

export function playerAllowed(config: AppConfig, username: string): boolean {
  if (config.playerAllowlist.length === 0) return true
  return config.playerAllowlist.includes(username.toLowerCase())
}
