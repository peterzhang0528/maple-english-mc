import 'dotenv/config'
import { loadConfig } from '../src/config.js'
import { claudeReply, renderUserTurn } from '../src/chat/claude.js'
import { runPracticeScript, type PracticeBeat } from '../src/practice/script.js'
import { createSession, emptyWorld } from '../src/types.js'
import { parseIntents } from '../src/behavior/intents.js'
import { explainCraft } from '../src/behavior/recipes.js'

const useClaude = process.argv.includes('--claude')

if (useClaude) {
  const config = loadConfig()
  if (!config.anthropicApiKey) {
    console.error('Set ANTHROPIC_API_KEY in .env before npm run demo -- --claude')
    process.exitCode = 1
  } else {
    const session = createSession(config.difficulty, config.historyTurns)
    const say = 'Hello! I want go mining. How do I craft a pickaxe?'
    const intents = parseIntents(say)
    const world = emptyWorld(['I am following Steve.'])
    world.biome = 'plains'
    world.lookingAt = 'oak_log'
    world.nearbyBlocks = ['grass block', 'oak log', 'dirt']
    const craft = intents.find((intent) => intent.type === 'craft')
    const input = {
      username: 'Steve',
      text: say,
      difficulty: session.difficulty,
      difficultyChanged: false,
      world,
      intents,
      craftLesson: craft?.type === 'craft' ? explainCraft(craft.query, '1.21.4') : null,
    }
    console.log(`Maple is asking ${config.anthropicModel} (effort ${config.anthropicEffort}).`)
    console.log(`<Steve> ${say}`)
    const reply = await claudeReply(
      {
        apiKey: config.anthropicApiKey,
        model: config.anthropicModel,
        maxTokens: config.anthropicMaxTokens,
        effort: config.anthropicEffort,
      },
      [],
      input,
    )
    console.log(`<Maple> ${reply}`)
    console.log('\nUser turn sent to Claude:\n')
    console.log(renderUserTurn(input))
  }
} else {
  console.log('Maple English companion — scripted practice')
  console.log('Tutor: local (no API key needed). Use `npm run demo -- --claude` to call Claude Opus 5.5.\n')
  const beats = await runPracticeScript()
  for (const beat of beats) printBeat(beat)
}

function printBeat(beat: PracticeBeat): void {
  const actions = beat.intents.map((intent) => (intent.type === 'craft' ? `craft:${intent.query}` : intent.type)).join(', ')
  console.log(`<Steve> ${beat.say}`)
  console.log(`<Maple> ${beat.reply}`)
  console.log(`  level=${beat.difficulty}  intents=${actions}  chat lines=${beat.lines.length}`)
  console.log('')
}
