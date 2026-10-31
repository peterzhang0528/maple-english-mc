import mineflayer, { type Bot } from 'mineflayer'
import { loadConfig } from '../src/config.js'
import { startCompanion } from '../src/bot/run.js'

const port = Number(process.env.SMOKE_PORT ?? 25565)
const config = loadConfig({
  ...process.env,
  MC_HOST: '127.0.0.1',
  MC_PORT: String(port),
  MC_USERNAME: 'Maple',
  MC_AUTH: 'offline',
  MC_VERSION: '1.21.4',
  MC_PLAYER: 'Steve',
  MC_GREET: 'false',
  MC_RECONNECTS: '0',
  ANTHROPIC_API_KEY: '',
  CHAT_MIN_INTERVAL_MS: '0',
  PLAYER_MIN_INTERVAL_MS: '0',
  ENGLISH_DIFFICULTY: 'beginner',
})

const heard: string[] = []
const companion = await startCompanion(config)
const steve = mineflayer.createBot({
  host: '127.0.0.1',
  port,
  username: 'Steve',
  auth: 'offline',
  version: '1.21.4',
})

try {
  await waitSpawn(steve)
  await waitFor(() => Boolean(companion.bot.players.Steve?.entity), 'Steve to appear near Maple')
  const hello = await sayAndWait(steve, 'Hello! I want go mining.', /want to go|mining|Nice try/i)
  const craft = await sayAndWait(steve, 'how do I craft a pickaxe?', /pickaxe|plank|stick/i)
  const follow = await sayAndWait(steve, 'follow me', /follow/i)
  await delay(1000)
  const goal = companion.bot.pathfinder?.goal
  if (!goal) throw new Error('Maple did not start following Steve')
  console.log('[smoke] hello:', hello)
  console.log('[smoke] craft:', craft)
  console.log('[smoke] follow:', follow)
  console.log('[smoke] pathfinder goal is set')
  console.log('[smoke] ok')
} finally {
  steve.quit()
  companion.stop()
  setTimeout(() => process.exit(process.exitCode ?? 0), 500)
}

function waitSpawn(bot: Bot): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${bot.username} did not spawn`)), 30_000)
    bot.once('spawn', () => {
      clearTimeout(timer)
      resolve()
    })
    bot.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function sayAndWait(bot: Bot, text: string, pattern: RegExp): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      bot.removeListener('messagestr', onMessage)
      reject(new Error(`No Maple reply matching ${pattern} after "${text}". Heard: ${heard.join(' | ')}`))
    }, 20_000)
    const onMessage = (message: string) => {
      heard.push(message)
      const match = message.match(/^<Maple>\s?([\s\S]*)$/)
      if (!match?.[1] || !pattern.test(match[1])) return
      clearTimeout(timer)
      bot.removeListener('messagestr', onMessage)
      resolve(match[1])
    }
    bot.on('messagestr', onMessage)
    bot.chat(text)
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(ready: () => boolean, label: string): Promise<void> {
  const start = Date.now()
  while (!ready()) {
    if (Date.now() - start > 20_000) throw new Error(`Timed out waiting for ${label}`)
    await delay(200)
  }
}
