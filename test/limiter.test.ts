import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SendQueue, TurnLimiter } from '../src/chat/limiter.js'

test('asks a fast player to slow down once, then ignores them', () => {
  const limiter = new TurnLimiter(1000, 5000, 10, 30_000)
  assert.equal(limiter.take('Steve', 0), 'ok')
  assert.equal(limiter.take('Steve', 200), 'slow')
  assert.equal(limiter.take('Steve', 400), 'mute')
  assert.equal(limiter.take('Steve', 5200), 'ok')
})

test('shares a global cap across players', () => {
  const limiter = new TurnLimiter(0, 1000, 2, 10_000)
  assert.equal(limiter.take('Steve', 0), 'ok')
  assert.equal(limiter.take('Alex', 0), 'ok')
  assert.equal(limiter.take('Steve', 0), 'busy')
})

test('spaces outgoing chat lines', async () => {
  const queue = new SendQueue(40)
  const times: number[] = []
  await queue.send(['a', 'b', 'c'], () => times.push(Date.now()))
  assert.ok((times[1] ?? 0) - (times[0] ?? 0) >= 30)
  assert.ok((times[2] ?? 0) - (times[1] ?? 0) >= 30)
})
