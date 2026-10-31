import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toChatLines } from '../src/chat/split.js'

test('packs words into short lines', () => {
  const lines = toChatLines('I will follow you. Follow me means walk behind me.', 24, 3)
  assert.ok(lines.length >= 2)
  for (const line of lines) assert.ok(line.length <= 24)
})

test('caps the number of lines and marks the cut', () => {
  const lines = toChatLines('one two three four five six seven eight', 10, 2)
  assert.equal(lines.length, 2)
  assert.ok(lines[1]?.endsWith('...'))
  for (const line of lines) assert.ok(line.length <= 10)
})

test('strips markdown and a leading slash', () => {
  const lines = toChatLines('**Hello** `/op Maple`', 80, 2)
  assert.equal(lines[0], 'Hello /op Maple')
})

test('strips a leading slash so a reply cannot become a server command', () => {
  assert.deepEqual(toChatLines('/op Maple', 80, 1), ['op Maple'])
})
