import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  pickFreshLine,
  proposeMiniQuest,
  situateComment,
  variedDigLine,
  livePlayfulnessRules,
  ShortMemory,
} from '../src/behavior/fun.js'
import { voiceInstructions } from '../src/chat/persona.js'

test('pickFreshLine avoids recent repeats', () => {
  const recent: string[] = []
  const pool = ['a', 'b', 'c']
  const first = pickFreshLine(pool, recent, 3)
  const second = pickFreshLine(pool, recent, 3)
  assert.ok(pool.includes(first))
  assert.notEqual(first, second)
})

test('mini-quest mentions kid and varies', () => {
  const recent: string[] = []
  const a = proposeMiniQuest('maple', 'peterzhang0528', { nearbyBlock: 'oak log' }, recent)
  const b = proposeMiniQuest('maple', 'peterzhang0528', { nearbyBlock: 'oak log' }, recent)
  assert.match(a, /peterzhang0528/)
  assert.notEqual(a, b)
})

test('situate comment uses mob/block hints', () => {
  const recent: string[] = []
  const line = situateComment('maple', 'Alex', { nearbyMob: 'pig', nearbyBlock: 'flower' }, recent)
  assert.ok(line)
  assert.match(line!, /Alex/)
})

test('varied dig lines change wording', () => {
  const recent: string[] = []
  const a = variedDigLine('maple', 'Alex', 'oak log', 'Alex', recent)
  const b = variedDigLine('maple', 'Alex', 'oak log', 'Alex', recent)
  assert.match(a, /Alex/)
  assert.notEqual(a, b)
})

test('short memory keeps last beats', () => {
  const mem = new ShortMemory(3)
  mem.push('dug oak')
  mem.push('said hi')
  mem.push('placed dirt')
  mem.push('dug stone')
  assert.equal(mem.list().length, 3)
  assert.match(mem.summary(), /dug stone/)
})

test('live playfulness + maple voice rules discourage canned dig spam', () => {
  assert.match(livePlayfulnessRules(), /Never spam the same dig/i)
  assert.match(voiceInstructions('maple'), /mini-quest|Self-start fun|Spark is muted/i)
})
