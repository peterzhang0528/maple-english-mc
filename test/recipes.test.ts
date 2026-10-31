import assert from 'node:assert/strict'
import { test } from 'node:test'
import { explainCraft, resolveItemName } from '../src/behavior/recipes.js'

test('teaches the oak wooden pickaxe grid', () => {
  const lesson = explainCraft('pickaxe', '1.21.4')
  assert.ok(lesson)
  assert.equal(lesson?.itemName, 'wooden_pickaxe')
  assert.match(lesson?.beginner ?? '', /Oak Planks/)
  assert.match(lesson?.beginner ?? '', /Stick/)
  assert.match(lesson?.summary ?? '', /row 1: Oak Planks, Oak Planks, Oak Planks/)
})

test('resolves friendly item names', () => {
  assert.equal(resolveItemName('crafting table'), 'crafting_table')
  assert.equal(resolveItemName('sticks'), 'stick')
  assert.equal(resolveItemName('not a real block xyz'), null)
})
