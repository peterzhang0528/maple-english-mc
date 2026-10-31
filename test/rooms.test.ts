import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import WebSocket from 'ws'
import { loadConfig } from '../src/config.js'
import { cleanCode, cleanName } from '../src/web/rooms.js'
import { createWebServer } from '../src/web/server.js'

const tutorConfig = loadConfig({
  MC_USERNAME: 'Maple',
  MC_AUTH: 'offline',
  ANTHROPIC_API_KEY: '',
  OPENAI_API_KEY: '',
  ANTHROPIC_MODEL: 'claude-opus-5-5',
  ENGLISH_DIFFICULTY: 'beginner',
})

test('room helpers accept kid-safe names and codes', () => {
  assert.equal(cleanName('  小明  '), '小明')
  assert.equal(cleanName('Alex-2'), 'Alex-2')
  assert.equal(cleanName(''), null)
  assert.equal(cleanCode('ab-cd'), 'ABCD')
  assert.equal(cleanCode('xy'), null)
})

test('two websocket clients share one room and see Maple chat', async () => {
  await withServer({ config: tutorConfig, playerMinIntervalMs: 0, perIpTurns: 40 }, async (base) => {
    const health = await fetch(`${base}/api/health`)
    const healthBody = await health.json()
    assert.equal(healthBody.ok, true)
    assert.equal(healthBody.multiplayer, true)

    const home = await fetch(`${base}/`)
    const html = await home.text()
    assert.match(html, /Create room/)
    assert.match(html, /创建房间/)

    const a = await openSocket(base)
    const b = await openSocket(base)
    const inboxA = collect(a)
    const inboxB = collect(b)
    try {
      a.send(JSON.stringify({ type: 'create', name: 'Ada' }))
      const welcomeA = await inboxA.wait((msg) => msg.type === 'welcome')
      assert.equal(typeof welcomeA.room, 'string')
      assert.equal((welcomeA.room as string).length, 4)

      b.send(JSON.stringify({ type: 'join', room: welcomeA.room, name: 'Ben' }))
      const welcomeB = await inboxB.wait((msg) => msg.type === 'welcome')
      assert.equal(welcomeB.room, welcomeA.room)
      assert.equal((welcomeB.players as unknown[]).length, 2)

      const joined = await inboxA.wait((msg) => msg.type === 'player_joined')
      assert.equal((joined.player as { name: string }).name, 'Ben')

      a.send(JSON.stringify({ type: 'move', x: 2.5, y: 4, z: 1.2, yaw: 0.4, pitch: -0.1 }))
      const move = await inboxB.wait((msg) => msg.type === 'move' && msg.x === 2.5)
      assert.equal(move.playerId, welcomeA.playerId)

      a.send(JSON.stringify({ type: 'say', text: 'Hello Maple! I want go mining.' }))
      const playerChat = await inboxB.wait((msg) => msg.type === 'chat' && msg.kind === 'player')
      assert.equal(playerChat.from, 'Ada')
      const mapleChat = await inboxB.wait(
        (msg) => msg.type === 'chat' && msg.kind === 'maple' && /mining|want to|Hello|Ada|bridge|dig|English/i.test(String(msg.text)),
      )
      assert.match(String(mapleChat.text), /./)
    } finally {
      inboxA.stop()
      inboxB.stop()
      a.close()
      b.close()
    }
  })
})

function openSocket(base: string): Promise<WebSocket> {
  const url = base.replace('http', 'ws') + '/api/room'
  const ws = new WebSocket(url)
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

function collect(ws: WebSocket) {
  const messages: Record<string, unknown>[] = []
  const waiters: Array<{
    match: (message: Record<string, unknown>) => boolean
    resolve: (message: Record<string, unknown>) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
  }> = []
  const onMessage = (raw: WebSocket.RawData) => {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(String(raw)) as Record<string, unknown>
    } catch {
      return
    }
    messages.push(parsed)
    for (let i = 0; i < waiters.length; i += 1) {
      const waiter = waiters[i]!
      if (!waiter.match(parsed)) continue
      clearTimeout(waiter.timer)
      waiters.splice(i, 1)
      waiter.resolve(parsed)
      break
    }
  }
  ws.on('message', onMessage)
  return {
    wait(match: (message: Record<string, unknown>) => boolean, timeoutMs = 8_000) {
      const existing = messages.find(match)
      if (existing) return Promise.resolve(existing)
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex((waiter) => waiter.timer === timer)
          if (index >= 0) waiters.splice(index, 1)
          reject(new Error('Timed out waiting for websocket message'))
        }, timeoutMs)
        waiters.push({ match, resolve, reject, timer })
      })
    },
    stop() {
      ws.off('message', onMessage)
      for (const waiter of waiters) clearTimeout(waiter.timer)
      waiters.length = 0
    },
  }
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
