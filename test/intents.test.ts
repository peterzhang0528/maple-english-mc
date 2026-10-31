import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseIntents } from '../src/behavior/intents.js'

test('maps play phrases to actions', () => {
  assert.deepEqual(parseIntents('follow me').map((intent) => intent.type), ['follow'])
  assert.deepEqual(parseIntents('come here please').map((intent) => intent.type), ['come'])
  assert.deepEqual(parseIntents('stop following me').map((intent) => intent.type), ['stop'])
  assert.deepEqual(parseIntents('come with me').map((intent) => intent.type), ['follow'])
  assert.deepEqual(parseIntents('look at me').map((intent) => intent.type), ['look'])
  assert.ok(parseIntents('what is this block?').some((intent) => intent.type === 'inspect_block'))
})

test('reads a crafting question without treating it as help', () => {
  const intents = parseIntents('how do I craft a pickaxe?')
  assert.equal(intents.length, 1)
  assert.equal(intents[0]?.type, 'craft')
  if (intents[0]?.type === 'craft') assert.equal(intents[0].query, 'pickaxe')
})

test('switches difficulty and still notices a second request', () => {
  const intents = parseIntents('let us use intermediate English')
  assert.deepEqual(intents, [{ type: 'set_difficulty', difficulty: 'intermediate' }])
  const both = parseIntents('come here, what is this block?')
  assert.ok(both.some((intent) => intent.type === 'come'))
  assert.ok(both.some((intent) => intent.type === 'inspect_block'))
})

test('keeps ordinary chat as chat', () => {
  assert.deepEqual(parseIntents('Hello! I want go mining.'), [{ type: 'chat' }])
  assert.equal(parseIntents('help')[0]?.type, 'help')
})
