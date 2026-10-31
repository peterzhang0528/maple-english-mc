import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { loadConfig } from '../src/config.js'
import { planWebAction, toPublicChatResponse } from '../src/web/chat.js'
import { createWebServer } from '../src/web/server.js'
import { buildTerrain } from '../web/client/terrain.js'

const tutorConfig = loadConfig({
  MC_USERNAME: 'Maple',
  MC_AUTH: 'offline',
  ANTHROPIC_API_KEY: '',
  OPENAI_API_KEY: '',
  ANTHROPIC_MODEL: 'claude-opus-5-5',
  ENGLISH_DIFFICULTY: 'beginner',
})

test('the practice island has trees, a crafting table, and a safe spawn', () => {
  const terrain = buildTerrain()
  const names = new Set(terrain.cells.map((cell) => cell.name))
  assert.ok(names.has('oak_log'))
  assert.ok(names.has('crafting_table'))
  assert.ok(names.has('coal_ore'))
  assert.ok(names.has('water'))
  assert.equal(
    terrain.solids.has(`${Math.floor(terrain.spawn.x)}|${Math.floor(terrain.spawn.y)}|${Math.floor(terrain.spawn.z)}`),
    false,
  )
})

test('public chat payload does not grow extra secret fields', () => {
  const payload = toPublicChatResponse('Hi.', ['Hi.'], 'follow', 'beginner', 'fallback', [{ type: 'follow' }], 'oak_log')
  assert.deepEqual(Object.keys(payload).sort(), [
    'action',
    'difficulty',
    'intents',
    'lines',
    'lookingAt',
    'reply',
    'source',
  ])
  assert.equal(payload.lookingAt, 'oak log')
  assert.equal(planWebAction([{ type: 'follow' }, { type: 'inspect_block' }], 'stone').action, 'follow')
})

test('browser chat corrects English, teaches a pickaxe, and remembers difficulty', async () => {
  await withServer({ config: tutorConfig, playerMinIntervalMs: 0, perIpTurns: 20 }, async (base) => {
    const home = await fetch(`${base}/`)
    const html = await home.text()
    assert.equal(home.status, 200)
    assert.match(html, /Create room/)
    assert.match(html, /怎么玩/)

    const hello = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello! I want go mining.', lookingAt: 'grass_block' }),
    })
    const helloBody = await hello.json()
    assert.equal(hello.status, 200)
    assert.match(helloBody.reply, /I want to go mining/)
    assert.equal(helloBody.source, 'fallback')
    const cookie = cookieOf(hello)

    const craft = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ text: 'how do I craft a pickaxe?', lookingAt: 'oak_log' }),
    })
    const craftBody = await craft.json()
    assert.match(craftBody.reply, /Oak Planks/)
    assert.match(craftBody.reply, /Stick/)

    const level = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ text: 'let us use intermediate English' }),
    })
    assert.equal((await level.json()).difficulty, 'intermediate')

    const come = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ text: 'come here' }),
    })
    const comeBody = await come.json()
    assert.equal(comeBody.action, 'come')
    assert.match(comeBody.reply, /On my way/)

    const block = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ text: 'what is this block?', lookingAt: 'oak_log' }),
    })
    assert.match((await block.json()).reply, /oak log/i)
  })
})

test('public pages hide the API key and rate-limit repeats', async () => {
  const secret = 'sk-test-secret-maple'
  const config = { ...tutorConfig, anthropicApiKey: secret }
  await withServer({ config, playerMinIntervalMs: 0, perIpTurns: 8 }, async (base) => {
    const health = await fetch(`${base}/api/health`)
    const healthText = await health.text()
    assert.match(healthText, /"tutor":"claude"/)
    assert.equal(healthText.includes(secret), false)
    const page = await fetch(`${base}/`)
    assert.equal((await page.text()).includes(secret), false)
    const missing = await fetch(`${base}/assets/../../package.json`)
    assert.equal(missing.status, 404)
  })

  await withServer({ config: tutorConfig, playerMinIntervalMs: 10_000, muteMs: 10_000, perIpTurns: 5 }, async (base) => {
    const first = await post(base, 'hello')
    assert.equal(first.status, 200)
    const second = await post(base, 'hello again')
    assert.equal(second.status, 429)
    const body = await second.json()
    assert.match(body.reply, /slower/)
    assert.equal(JSON.stringify(body).includes('sk-'), false)
  })
})

async function post(base: string, text: string): Promise<Response> {
  return fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
}

function cookieOf(response: Response): string {
  const raw = response.headers.get('set-cookie') ?? ''
  const pair = raw.split(';')[0] ?? ''
  assert.match(pair, /^maple_sid=[a-f0-9]{32}$/)
  return pair
}

async function withServer(
  options: Parameters<typeof createWebServer>[0],
  run: (base: string) => Promise<void>,
): Promise<void> {
  const server = createWebServer(options)
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve())
    server.on('error', reject)
  })
  const address = server.address() as AddressInfo
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
