import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseIntents } from '../src/behavior/intents.js'
import { buildClaudeParams } from '../src/chat/claude.js'
import { suggestRewrite } from '../src/chat/fallback.js'
import { SYSTEM_PROMPT } from '../src/chat/prompt.js'
import { completeTurn } from '../src/chat/turn.js'
import { DEFAULT_ANTHROPIC_MODEL, loadConfig } from '../src/config.js'
import { runPracticeScript } from '../src/practice/script.js'
import { createSession, emptyWorld } from '../src/types.js'
import { parsePublicChat } from '../src/bot/chatParse.js'

const baseConfig = {
  chatMaxLineChars: 180,
  chatMaxLines: 3,
  anthropicModel: DEFAULT_ANTHROPIC_MODEL,
  anthropicMaxTokens: 2048,
  anthropicEffort: 'low' as const,
  openaiModel: 'gpt-4.1',
  openaiMaxTokens: 512,
  versionLabel: '1.21.4',
}

test('corrects a beginner sentence and keeps chat short', async () => {
  const session = createSession('beginner', 8)
  const text = 'Hello! I want go mining.'
  const turn = await completeTurn({
    config: baseConfig,
    session,
    username: 'Steve',
    text,
    world: emptyWorld(),
    intents: parseIntents(text),
  })
  assert.equal(turn.source, 'fallback')
  assert.match(turn.reply, /I want to go mining/)
  assert.ok(turn.lines.every((line) => line.length <= 180))
  assert.equal(session.history.length, 2)
})

test('refuses server commands without calling them through', async () => {
  const session = createSession('beginner', 4)
  const turn = await completeTurn({
    config: baseConfig,
    session,
    username: 'Steve',
    text: '/op Maple',
    world: emptyWorld(),
    intents: [{ type: 'chat' }],
  })
  assert.equal(turn.source, 'local')
  assert.match(turn.reply, /cannot run server commands/)
  assert.ok(turn.lines.every((line) => !line.startsWith('/')))
  assert.equal(session.history.length, 0)
})

test('practice script teaches the oak log and the pickaxe, then steps up', async () => {
  const beats = await runPracticeScript()
  assert.match(beats[0]?.reply ?? '', /I want to go mining/)
  assert.match(beats[1]?.reply ?? '', /Follow me/)
  assert.match(beats[2]?.reply ?? '', /oak log/i)
  assert.match(beats[3]?.reply ?? '', /Oak Planks/)
  assert.match(beats[3]?.reply ?? '', /Stick/)
  assert.equal(beats[4]?.difficulty, 'intermediate')
  assert.match(beats[5]?.reply ?? '', /On my way/)
  for (const beat of beats) {
    assert.ok(beat.lines.length >= 1)
    assert.ok(beat.lines.length <= 3)
    for (const line of beat.lines) assert.ok(line.length <= 180)
  }
})

test('Claude request uses Opus 5.5 and does not disable thinking', () => {
  const params = buildClaudeParams(
    {
      apiKey: 'test-key',
      model: DEFAULT_ANTHROPIC_MODEL,
      maxTokens: 2048,
      effort: 'low',
    },
    [],
    {
      username: 'Steve',
      text: 'hello',
      difficulty: 'beginner',
      difficultyChanged: false,
      world: emptyWorld(),
      intents: [{ type: 'chat' }],
      craftLesson: null,
    },
  )
  assert.equal(params.model, 'claude-opus-5-5')
  assert.equal(params.output_config.effort, 'low')
  assert.equal('thinking' in params, false)
  assert.match(params.system, /speak only English/)
  assert.equal(params.system, SYSTEM_PROMPT)
  assert.match(suggestRewrite('i want go') ?? '', /I want to go/)
})

test('config reads the model and never requires a key', () => {
  const config = loadConfig({
    MC_USERNAME: 'Maple',
    MC_AUTH: 'offline',
    MC_VERSION: '1.21.4',
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_MODEL: '',
  })
  assert.equal(config.anthropicApiKey, undefined)
  assert.equal(config.anthropicModel, DEFAULT_ANTHROPIC_MODEL)
  assert.equal(config.version, '1.21.4')
  assert.equal(parsePublicChat('<Steve> follow me')?.text, 'follow me')
  assert.equal(parsePublicChat('Steve joined the game'), null)
})
