import Anthropic from '@anthropic-ai/sdk'
import type { Effort } from '../config.js'
import { lessonText } from '../behavior/recipes.js'
import { describeIntent, type HistoryEntry } from '../types.js'
import type { TutorInput } from './fallback.js'
import { activeSystemPrompt } from './prompt.js'

export interface ClaudeSettings {
  apiKey: string
  model: string
  maxTokens: number
  effort: Effort
}

export function renderUserTurn(input: TutorInput): string {
  const lines = [
    '[session]',
    `player: ${input.username}`,
    `address_as: ${input.username} (always say this Minecraft username when you talk to them)`,
    `difficulty: ${input.difficulty}`,
    `difficulty_changed: ${input.difficultyChanged ? 'yes' : 'no'}`,
    `intents: ${input.intents.map(describeIntent).join(', ')}`,
    ...input.world.actionNotes.map((note) => `action: ${note}`),
    '',
    '[world]',
    `dimension: ${input.world.dimension}`,
    `biome: ${input.world.biome}`,
    `time: ${input.world.timeOfDay}`,
    `weather: ${input.world.weather}`,
    `looking_at: ${input.world.lookingAt ?? 'unknown'}`,
    `player_holding: ${input.world.playerHeldItem ?? 'nothing'}`,
    `maple_holding: ${input.world.heldItem ?? 'nothing'}`,
    `nearby_blocks: ${input.world.nearbyBlocks.join(', ') || 'unknown'}`,
    ...(input.world.observations.length
      ? ['', '[noticed]', ...input.world.observations.map((line) => `- ${line}`)]
      : []),
  ]
  if (input.craftLesson) {
    lines.push('', '[known recipe]', lessonText(input.craftLesson, input.difficulty))
  }
  lines.push('', '[say]', input.text)
  return lines.join('\n')
}

export function buildClaudeParams(settings: ClaudeSettings, history: HistoryEntry[], input: TutorInput) {
  return {
    model: settings.model,
    max_tokens: settings.maxTokens,
    system: activeSystemPrompt(),
    output_config: { effort: settings.effort },
    messages: [
      ...history.map((entry) => ({ role: entry.role, content: entry.content })),
      { role: 'user' as const, content: renderUserTurn(input) },
    ],
  }
}

export async function claudeReply(
  settings: ClaudeSettings,
  history: HistoryEntry[],
  input: TutorInput,
): Promise<string> {
  const client = new Anthropic({ apiKey: settings.apiKey })
  const params = buildClaudeParams(settings, history, input)
  // Adaptive thinking is always on for Claude Opus 5.5. Do not send thinking.type disabled.
  const response = await client.messages.create(params)
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join(' ')
    .trim()
  if (!text) {
    throw new Error(`Claude returned no text (stop_reason=${response.stop_reason}). Raise ANTHROPIC_MAX_TOKENS.`)
  }
  return text
}
