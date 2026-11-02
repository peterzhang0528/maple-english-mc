import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseIntents } from '../src/behavior/intents.js'

test('maps play phrases to actions', () => {
  assert.deepEqual(parseIntents('follow me').map((intent) => intent.type), ['follow'])
  assert.deepEqual(parseIntents('come here please').map((intent) => intent.type), ['come'])
  assert.deepEqual(parseIntents('can you move').map((intent) => intent.type), ['follow'])
  assert.deepEqual(parseIntents('Come here, Maple').map((intent) => intent.type), ['come'])
  assert.deepEqual(parseIntents('lead the way').map((intent) => intent.type), ['follow'])
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
  assert.equal(parseIntents('!help')[0]?.type, 'help')
  assert.equal(parseIntents('what can you do')[0]?.type, 'help')
})

test('maps co-op help phrases to assist dig build give', () => {
  assert.equal(parseIntents('help me')[0]?.type, 'assist')
  assert.equal(parseIntents('help!')[0]?.type, 'assist')
  assert.ok(parseIntents('dig with me').some((intent) => intent.type === 'dig'))
  assert.ok(parseIntents("let's dig").some((intent) => intent.type === 'dig'))
  assert.ok(parseIntents('build with me').some((intent) => intent.type === 'build'))
  assert.ok(parseIntents('put it here').some((intent) => intent.type === 'build'))
  assert.ok(parseIntents('give me wood').some((intent) => intent.type === 'give'))
  assert.ok(parseIntents('come help').some((intent) => intent.type === 'assist'))
})

test('maps build a house to build_house intent', () => {
  assert.ok(parseIntents('build a house').some((intent) => intent.type === 'build_house'))
  assert.ok(parseIntents("let's build a house").some((intent) => intent.type === 'build_house'))
  assert.ok(parseIntents('help me build a house').some((intent) => intent.type === 'build_house'))
  assert.ok(!parseIntents('build a house').some((intent) => intent.type === 'build'))
  assert.ok(parseIntents('build with me').some((intent) => intent.type === 'build'))
  assert.ok(parseIntents('build a bridge').some((intent) => intent.type === 'build'))
})
