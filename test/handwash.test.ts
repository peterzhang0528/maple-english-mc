import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HANDWASH_LINES,
  createHandwashQuest,
  englishWordCount,
  handwashQuestEnabled,
  handwashScanOffsets,
  isWashWaterBlock,
  tickHandwash,
  usedWaterBucket,
  type HandwashQuest,
} from '../src/behavior/handwash.js'

const near = { visible: true, nearWater: true }
const away = { visible: true, nearWater: false }
const unseen = { visible: false, nearWater: false }

test('handwash quest is off unless HANDWASH_QUEST or QUEST opts in', () => {
  assert.equal(handwashQuestEnabled({}), false)
  assert.equal(handwashQuestEnabled({ HANDWASH_QUEST: '0' }), false)
  assert.equal(handwashQuestEnabled({ HANDWASH_QUEST: '1' }), true)
  assert.equal(handwashQuestEnabled({ HANDWASH_QUEST: 'true' }), true)
  assert.equal(handwashQuestEnabled({ QUEST: 'handwash' }), true)
  assert.equal(handwashQuestEnabled({ QUEST: 'washHands' }), true)
  assert.equal(handwashQuestEnabled({ QUEST: 'wash-hands' }), true)
  assert.equal(handwashQuestEnabled({ QUEST: 'mining' }), false)
})

test('water, flowing water, a water cauldron, and waterlogged blocks count', () => {
  assert.equal(isWashWaterBlock({ name: 'water' }), true)
  assert.equal(isWashWaterBlock({ name: 'minecraft:flowing_water' }), true)
  assert.equal(isWashWaterBlock({ name: 'bubble_column' }), true)
  assert.equal(isWashWaterBlock({ name: 'water_cauldron' }), true)
  assert.equal(isWashWaterBlock({ name: 'cauldron', properties: { level: 3 } }), true)
  assert.equal(isWashWaterBlock({ name: 'cauldron', properties: { level: 0 } }), false)
  assert.equal(isWashWaterBlock({ name: 'oak_stairs', properties: { waterlogged: 'true' } }), true)
  assert.equal(isWashWaterBlock({ name: 'lava' }), false)
  assert.equal(isWashWaterBlock({ name: 'cauldron' }), false)
  assert.equal(isWashWaterBlock(null), false)
})

test('emptying a water bucket counts as using water', () => {
  assert.equal(usedWaterBucket('water_bucket', 'bucket'), true)
  assert.equal(usedWaterBucket('minecraft:water_bucket', 'minecraft:bucket'), true)
  assert.equal(usedWaterBucket('water_bucket', 'water_bucket'), false)
  assert.equal(usedWaterBucket('bucket', 'water_bucket'), false)
  assert.equal(usedWaterBucket('water_bucket', null), false)
})

test('scan offsets include the feet and the bank beside them', () => {
  const cells = handwashScanOffsets(2)
  assert.ok(cells.some((cell) => cell.dx === 0 && cell.dy === 0 && cell.dz === 0))
  assert.ok(cells.some((cell) => cell.dx === 1 && cell.dy === -1 && cell.dz === 0))
  assert.equal(cells.length, 5 * 5 * 3)
})

test('english lines stay very short', () => {
  for (const line of Object.values(HANDWASH_LINES)) {
    assert.ok(englishWordCount(line) <= 10, line)
    assert.ok(englishWordCount(line) >= 3, line)
  }
  assert.equal(HANDWASH_LINES.go, 'Go to the water.')
  assert.equal(HANDWASH_LINES.wash, 'Wash your hands.')
  assert.equal(HANDWASH_LINES.done, 'Good job! Clean hands!')
})

test('quest does not skip ahead until each step condition is met', () => {
  const started = createHandwashQuest('Peter', 0)
  assert.equal(started.quest.step, 'go')
  assert.deepEqual(
    started.events.map((event) => event.type === 'say' ? event.text : event.type),
    ['Go to the water.'],
  )

  const stillGoing = tickHandwash(started.quest, { now: 1_000, ...away })
  assert.equal(stillGoing.quest.step, 'go')
  assert.equal(stillGoing.events.length, 0)

  const hidden = tickHandwash(stillGoing.quest, { now: 1_500, ...unseen, nearWater: true })
  assert.equal(hidden.quest.step, 'go')

  const washing = tickHandwash(hidden.quest, { now: 2_000, ...near, holdMs: 4_000 })
  assert.equal(washing.quest.step, 'wash')
  assert.equal(washing.quest.finished, false)
  assert.ok(washing.events.some((event) => event.type === 'advance' && event.from === 'go' && event.to === 'wash'))
  assert.ok(washing.events.some((event) => event.type === 'say' && event.text === 'Wash your hands.'))
  assert.equal(
    washing.events.some((event) => event.type === 'say' && event.text === 'Good job! Clean hands!'),
    false,
  )

  const tooSoon = tickHandwash(washing.quest, { now: 5_999, ...near, holdMs: 4_000 })
  assert.equal(tooSoon.quest.step, 'wash')
  assert.equal(tooSoon.quest.finished, false)

  const done = tickHandwash(tooSoon.quest, { now: 6_000, ...near, holdMs: 4_000 })
  assert.equal(done.quest.step, 'done')
  assert.equal(done.quest.finished, true)
  assert.ok(done.events.some((event) => event.type === 'advance' && event.reason === 'held-4000ms'))
  assert.ok(done.events.some((event) => event.type === 'say' && event.text === 'Good job! Clean hands!'))

  const after = tickHandwash(done.quest, { now: 20_000, ...near })
  assert.equal(after.events.length, 0)
  assert.equal(after.quest.step, 'done')
})

test('leaving the water resets the wash timer instead of finishing', () => {
  let quest: HandwashQuest = {
    player: 'Peter',
    step: 'wash',
    stepEnteredAt: 0,
    washSince: 0,
    awayPolls: 0,
    lastSpokenAt: 0,
    hinted: false,
    finished: false,
  }
  for (let poll = 1; poll <= 2; poll += 1) {
    const ticked = tickHandwash(quest, { now: poll * 400, ...away, awayPollsToReset: 3, holdMs: 4_000 })
    quest = ticked.quest
    assert.equal(quest.washSince, 0)
    assert.equal(ticked.events.some((event) => event.type === 'reset'), false)
  }
  const left = tickHandwash(quest, { now: 1_200, ...away, awayPollsToReset: 3, holdMs: 4_000 })
  assert.equal(left.quest.step, 'wash')
  assert.equal(left.quest.washSince, null)
  assert.ok(left.events.some((event) => event.type === 'reset' && event.reason === 'left-water'))

  const back = tickHandwash(left.quest, { now: 1_600, ...near, holdMs: 4_000 })
  assert.equal(back.quest.step, 'wash')
  assert.equal(back.quest.finished, false)
  assert.equal(back.quest.washSince, 1_600)

  const finishedEarly = tickHandwash(back.quest, { now: 5_000, ...near, holdMs: 4_000 })
  assert.equal(finishedEarly.quest.step, 'wash')
  const finished = tickHandwash(finishedEarly.quest, { now: 5_600, ...near, holdMs: 4_000 })
  assert.equal(finished.quest.step, 'done')
})

test('a stuck kid hears the same english step, then one chinese hint', () => {
  const started = createHandwashQuest('Peter', 0)
  const repeat = tickHandwash(started.quest, { now: 14_000, ...away, repeatMs: 14_000, hintAfterMs: 18_000 })
  assert.equal(repeat.quest.step, 'go')
  assert.deepEqual(repeat.events, [{ type: 'say', step: 'go', text: 'Go to the water.' }])

  const hint = tickHandwash(repeat.quest, { now: 18_000, ...away, repeatMs: 14_000, hintAfterMs: 18_000 })
  assert.deepEqual(hint.events, [{ type: 'hint', step: 'go', text: '去水边。' }])
  const again = tickHandwash(hint.quest, { now: 19_000, ...away, repeatMs: 14_000, hintAfterMs: 18_000 })
  assert.equal(again.events.length, 0)
})
