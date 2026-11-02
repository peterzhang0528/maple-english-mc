import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Bot } from 'mineflayer'
import WebSocket from 'ws'
import { loadConfig } from '../src/config.js'
import { SendQueue } from '../src/chat/limiter.js'
import { loadVoiceConfig } from '../src/voice/config.js'
import type { VoiceSocket } from '../src/voice/relay.js'
import { startJavaVoiceCompanion } from '../src/bot/voiceCompanion.js'
import {
  applySpokenTurn,
  chooseVoicePlayer,
  createVoiceMouth,
  readVoiceIntents,
} from '../src/bot/voiceBridge.js'

const config = loadConfig({
  MC_USERNAME: 'Maple',
  MC_AUTH: 'offline',
  MC_HOST: '127.0.0.1',
  MC_PORT: '25565',
  CHAT_MIN_INTERVAL_MS: '0',
  CHAT_MODE: 'chat',
  ANTHROPIC_API_KEY: '',
})

test('the mic window follows the named Java player, or the only other player', () => {
  assert.equal(
    chooseVoicePlayer({ botUsername: 'Maple', online: ['Maple', 'Steve', 'Alex'], allowlist: [], requested: 'steve' }),
    'Steve',
  )
  assert.equal(
    chooseVoicePlayer({ botUsername: 'Maple', online: ['Alex'], allowlist: [], requested: 'Steve' }),
    null,
  )
  assert.equal(
    chooseVoicePlayer({ botUsername: 'Maple', online: ['Steve'], allowlist: [], requested: null }),
    'Steve',
  )
  assert.equal(
    chooseVoicePlayer({ botUsername: 'Maple', online: ['Steve', 'Alex'], allowlist: [], requested: null }),
    null,
  )
  assert.equal(
    chooseVoicePlayer({ botUsername: 'Maple', online: ['Steve', 'Alex'], allowlist: ['steve'], requested: null }),
    'Steve',
  )
  assert.equal(
    chooseVoicePlayer({ botUsername: 'Maple', online: ['Alex'], allowlist: ['steve'], requested: null }),
    null,
  )
  assert.deepEqual(readVoiceIntents({ type: 'action', action: 'follow' }), [{ type: 'follow' }])
  assert.deepEqual(readVoiceIntents({ type: 'action', action: 'idle', intents: [{ type: 'inspect_block' }] }), [
    { type: 'inspect_block' },
  ])
})

test('spoken text is chatted in Java and a follow intent walks toward the player', async () => {
  const world = fakeWorld()
  const mouth = createVoiceMouth()
  const queue = new SendQueue(0)
  await applySpokenTurn({
    bot: world.bot,
    config,
    queue,
    mouth,
    requestedPlayer: 'Steve',
    message: { type: 'action', action: 'follow', intents: [{ type: 'follow' }] },
  })
  assert.equal(world.goals.length, 1)
  await applySpokenTurn({
    bot: world.bot,
    config,
    queue,
    mouth,
    requestedPlayer: 'Steve',
    message: { type: 'maple_text', text: 'I will follow you.', final: false },
  })
  await applySpokenTurn({
    bot: world.bot,
    config,
    queue,
    mouth,
    requestedPlayer: 'Steve',
    message: { type: 'maple_text', text: 'I will follow you. access-secret-value', final: true },
    secrets: ['access-secret-value'],
  })
  await applySpokenTurn({
    bot: world.bot,
    config,
    queue,
    mouth,
    requestedPlayer: 'Steve',
    message: { type: 'maple_text', text: 'I will follow you. [redacted]', final: true },
    secrets: ['access-secret-value'],
    now: Date.now(),
  })
  assert.deepEqual(world.chats, ['I will follow you. [redacted]'])
})


test('GPT Live user_text come here walks toward the named player', async () => {
  const world = fakeWorld()
  const mouth = createVoiceMouth()
  const queue = new SendQueue(0)
  await applySpokenTurn({
    bot: world.bot,
    config,
    queue,
    mouth,
    requestedPlayer: 'Steve',
    message: { type: 'user_text', text: 'Come here, Maple', final: true },
  })
  assert.equal(world.goals.length, 1)
  await applySpokenTurn({
    bot: world.bot,
    config,
    queue,
    mouth,
    requestedPlayer: 'Steve',
    message: { type: 'user_text', text: 'can you move please', final: true },
  })
  assert.equal(world.goals.length, 2)
})

test('the Java mic page hides keys and drives the Mineflayer bot', async () => {
  const voice = loadVoiceConfig({
    DOUBAO_APP_ID: '3496507434',
    DOUBAO_ACCESS_KEY: 'access-secret-value',
    DOUBAO_SECRET_KEY: 'secret-key-value',
  })
  const world = fakeWorld()
  const upstream: { socket: FakeVoice | null } = { socket: null }
  const companion = await startJavaVoiceCompanion({
    config,
    getBot: () => world.bot,
    voice,
    port: 0,
    host: '127.0.0.1',
    connectUpstream: async () => {
      const socket = new FakeVoice()
      upstream.socket = socket
      return { socket: socket as VoiceSocket, protocol: 'duplex' }
    },
  })
  assert.ok(companion.url)
  try {
    const page = await (await fetch(`${companion.url}/`)).text()
    assert.match(page, /Java Minecraft/)
    assert.match(page, /not the browser voxel island/)
    assert.match(page, /不是浏览器里的方块小岛/)
    assert.equal(page.includes('access-secret-value'), false)
    assert.equal(page.includes('secret-key-value'), false)

    const health = await (await fetch(`${companion.url}/api/health`)).json()
    assert.equal(health.demo, 'java-minecraft')
    assert.equal(health.voice, 'doubao')
    assert.equal(health.bot, 'online')
    assert.equal(health.server, '127.0.0.1:25565')
    assert.deepEqual(health.players, ['Steve'])
    assert.equal(JSON.stringify(health).includes('access-secret-value'), false)

    const named = await fetch(`${companion.url}/api/player`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Steve' }),
    })
    assert.equal(named.status, 200)
    const bad = await fetch(`${companion.url}/api/player`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'no spaces' }),
    })
    assert.equal(bad.status, 400)

    const ws = new WebSocket(companion.url.replace('http', 'ws') + '/api/voice')
    const ready = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('voice ready timed out')), 2_000)
      ws.on('message', (data) => {
        const text = String(data)
        if (text.includes('"ready"')) {
          clearTimeout(timer)
          resolve(text)
        }
      })
      ws.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })
    assert.equal(ready.includes('access-secret-value'), false)
    const socket = upstream.socket
    if (!socket) throw new Error('voice upstream was not created')

    socket.emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'follow me' })
    socket.emit({ type: 'response.output_text.done', text: 'I will follow you.' })
    socket.emit({
      type: 'response.function_call_arguments.done',
      items: [{ call_id: 'call-craft', name: 'maple_action', arguments: '{"action":"craft","item":"wooden pickaxe"}' }],
    })
    await waitFor(() => world.goals.length >= 1 && world.chats.some((line) => line.includes('Oak Planks')))
    assert.match(world.chats.join('\n'), /I will follow you/)
    assert.equal(world.chats.join('\n').includes('access-secret-value'), false)
    ws.close()
  } finally {
    await companion.close()
  }
})

function fakeWorld(): { bot: Bot; goals: unknown[]; chats: string[] } {
  const goals: unknown[] = []
  const chats: string[] = []
  const bot = {
    username: 'Maple',
    players: {
      Maple: {},
      Steve: { entity: { position: { x: 10, y: 64, z: -4 }, height: 1.8 } },
    },
    chat(line: string) {
      chats.push(line)
    },
    whisper(_name: string, line: string) {
      chats.push(line)
    },
    pathfinder: {
      setGoal(goal: unknown) {
        goals.push(goal)
      },
    },
    async lookAt() {
      return undefined
    },
    blockAtEntityCursor() {
      return { name: 'oak_log', position: { offset: () => ({ x: 1, y: 2, z: 3 }) } }
    },
  }
  return { bot: bot as unknown as Bot, goals, chats }
}

class FakeVoice {
  readyState = 1
  private listeners: { message: Array<(data: Buffer | string) => void>; close: Array<() => void>; error: Array<(error: Error) => void> } = {
    message: [],
    close: [],
    error: [],
  }

  send(data: string | Buffer): void {
    const text = String(data)
    if (text.includes('session.create')) {
      queueMicrotask(() => this.emit({ type: 'session.created', session: { id: 'dlg-1' } }))
    }
  }

  close(): void {
    this.readyState = 3
    for (const listener of this.listeners.close) listener()
  }

  on(event: 'message' | 'close' | 'error', listener: (value?: unknown) => void): void {
    if (event === 'message') this.listeners.message.push(listener as (data: Buffer | string) => void)
    else if (event === 'close') this.listeners.close.push(listener as () => void)
    else this.listeners.error.push(listener as (error: Error) => void)
  }

  emit(payload: unknown): void {
    const encoded = Buffer.from(JSON.stringify(payload))
    for (const listener of this.listeners.message) listener(encoded)
  }
}

async function waitFor(check: () => boolean): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > 2_000) throw new Error('timed out waiting for the Java bot')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}


test('party-say queues Spark lines for mic-page TTS', async () => {
  const companion = await startJavaVoiceCompanion({
    config,
    getBot: () => null,
    voice: loadVoiceConfig({}),
    port: 0,
    host: '127.0.0.1',
    env: { VOICE_COMPANION: '1', OPENAI_LIVE: '0' },
  })
  assert.ok(companion.url)
  const post = await fetch(`${companion.url}/api/party-say`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ speaker: 'Spark', text: 'Race you to the bridge!' }),
  })
  assert.equal(post.status, 200)
  const queued = await post.json()
  assert.equal(queued.ok, true)
  const pull = await fetch(`${companion.url}/api/party-say?after=0`)
  const body = await pull.json()
  assert.equal(body.ok, true)
  assert.equal(body.lines.length, 1)
  assert.equal(body.lines[0].speaker, 'Spark')
  assert.match(body.lines[0].text, /Race you/)
  await companion.close()
})
