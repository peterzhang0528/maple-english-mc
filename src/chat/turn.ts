import type { AppConfig } from '../config.js'
import { explainCraft } from '../behavior/recipes.js'
import type { Intent, Session, WorldSnapshot } from '../types.js'
import { claudeReply, type ClaudeSettings } from './claude.js'
import { openaiReply, type OpenAISettings } from './openai.js'
import { fallbackReply, type TutorInput } from './fallback.js'
import { toChatLines } from './split.js'

export type ReplySource = 'openai' | 'claude' | 'fallback' | 'local'

export interface TurnResult {
  lines: string[]
  reply: string
  source: ReplySource
  intents: Intent[]
}

export async function completeTurn(input: {
  config: Pick<
    AppConfig,
    | 'chatMaxLineChars'
    | 'chatMaxLines'
    | 'anthropicApiKey'
    | 'anthropicModel'
    | 'anthropicMaxTokens'
    | 'anthropicEffort'
    | 'openaiApiKey'
    | 'openaiModel'
    | 'openaiMaxTokens'
    | 'versionLabel'
  >
  session: Session
  username: string
  text: string
  world: WorldSnapshot
  intents: Intent[]
  log?: (message: string) => void
}): Promise<TurnResult> {
  const text = input.text.trim()
  if (text.startsWith('/')) {
    const reply = 'I cannot run server commands. Talk to me in English, or say help.'
    return { lines: toChatLines(reply, input.config.chatMaxLineChars, 1), reply, source: 'local', intents: input.intents }
  }
  if (text.length > 256) {
    const reply = 'That message is too long for me. Please use a shorter sentence.'
    return { lines: toChatLines(reply, input.config.chatMaxLineChars, 1), reply, source: 'local', intents: input.intents }
  }

  const previous = input.session.difficulty
  const change = input.intents.find((intent) => intent.type === 'set_difficulty')
  if (change?.type === 'set_difficulty') input.session.difficulty = change.difficulty

  const craft = input.intents.find((intent) => intent.type === 'craft')
  const version = input.config.versionLabel === 'auto' ? '1.21.4' : input.config.versionLabel
  const craftLesson = craft?.type === 'craft' ? explainCraft(craft.query, version) : null
  const tutorInput: TutorInput = {
    username: input.username,
    text,
    difficulty: input.session.difficulty,
    difficultyChanged: input.session.difficulty !== previous,
    world: input.world,
    intents: input.intents,
    craftLesson,
  }

  let source: ReplySource = 'fallback'
  let reply = fallbackReply(tutorInput)
  if (input.config.openaiApiKey && process.env.OPENAI_TYPED === '1') {
    const settings: OpenAISettings = {
      apiKey: input.config.openaiApiKey,
      model: input.config.openaiModel,
      maxTokens: input.config.openaiMaxTokens,
    }
    try {
      reply = await openaiReply(settings, input.session.history, tutorInput)
      source = 'openai'
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      input.log?.(`OpenAI failed, using the local tutor: ${message}`)
      reply = fallbackReply(tutorInput)
      source = 'fallback'
    }
  } else if (input.config.anthropicApiKey) {
    const settings: ClaudeSettings = {
      apiKey: input.config.anthropicApiKey,
      model: input.config.anthropicModel,
      maxTokens: input.config.anthropicMaxTokens,
      effort: input.config.anthropicEffort,
    }
    try {
      reply = await claudeReply(settings, input.session.history, tutorInput)
      source = 'claude'
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      input.log?.(`Claude failed, using the local tutor: ${message}`)
      reply = fallbackReply(tutorInput)
      source = 'fallback'
    }
  }

  input.session.history.push({ role: 'user', content: text })
  input.session.history.push({ role: 'assistant', content: reply })
  const maxEntries = input.session.historyTurns * 2
  while (input.session.history.length > maxEntries) input.session.history.splice(0, 2)

  return {
    lines: toChatLines(reply, input.config.chatMaxLineChars, input.config.chatMaxLines),
    reply,
    source,
    intents: input.intents,
  }
}
