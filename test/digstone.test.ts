import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DIG_STONE_BLOCKS,
  DIG_STONE_HINTS,
  DIG_STONE_LINES,
  DIG_STONE_PROGRESS,
  applyDigStoneWorld,
  createDigStoneQuest,
  creditStoneBreak,
  digStoneQuestArmed,
  digStoneQuestEnabled,
  digStoneScanOffsets,
  digStoneStepLine,
  englishWordCount,
  isDigStoneBlock,
  sameBreakTwice,
  tickDigStone,
  type DigStoneQuest,
} from '../src/behavior/digstone.js'

const seeStone = { visible: true, nearStone: true, stoneDug: 0 }
const noStone = { visible: true, nearStone: false, stoneDug: 0 }
const hidden = { visible: false, nearStone: true, stoneDug: 3 }

function said(events: Array<{ type: string; text?: string }>): string[] {
  return events.filter((event) => event.type === 'say' || event.type === 'progress').map((event) => event.text ?? '')
}

test('dig-stone quest is off unless DIG_STONE_QUEST or QUEST opts in, and only Maple is armed', () => {
  assert.equal(digStoneQuestEnabled({}), false)
  assert.equal(digStoneQuestEnabled({ DIG_STONE_QUEST: '0' }), false)
  assert.equal(digStoneQuestEnabled({ DIG_STONE_QUEST: '1' }), true)
  assert.equal(digStoneQuestEnabled({ DIG_STONE_QUEST: 'true' }), true)
  assert.equal(digStoneQuestEnabled({ DIG_STONE_QUEST: 'yes' }), true)
  assert.equal(digStoneQuestEnabled({ DIG_STONE_QUEST: 'on' }), true)
  assert.equal(digStoneQuestEnabled({ QUEST: 'digstone' }), true)
  assert.equal(digStoneQuestEnabled({ QUEST: 'dig_stone' }), true)
  assert.equal(digStoneQuestEnabled({ QUEST: 'dig-stone' }), true)
  assert.equal(digStoneQuestEnabled({ QUEST: 'digStone' }), true)
  assert.equal(digStoneQuestEnabled({ QUEST: 'dig stone' }), true)
  assert.equal(digStoneQuestEnabled({ QUEST: 'handwash' }), false)
  assert.equal(digStoneQuestEnabled({ QUEST: 'mining' }), false)
  assert.equal(digStoneQuestArmed('maple', { DIG_STONE_QUEST: '1' }), true)
  assert.equal(digStoneQuestArmed('spark', { DIG_STONE_QUEST: '1' }), false)
  assert.equal(digStoneQuestArmed('maple', { QUEST: 'digStone' }), true)
  assert.equal(digStoneQuestArmed('spark', { QUEST: 'dig_stone' }), false)
  assert.equal(digStoneQuestArmed('maple', {}), false)
})

test('stone allowlist is exact: natural stone counts, ores and bricks do not', () => {
  for (const name of DIG_STONE_BLOCKS) {
    assert.equal(isDigStoneBlock(name), true, name)
    assert.equal(isDigStoneBlock(`minecraft:${name}`), true, name)
    assert.equal(isDigStoneBlock(name.toUpperCase()), true, name)
  }
  for (const name of [
    'dirt',
    'grass_block',
    'oak_log',
    'gravel',
    'sand',
    'sandstone',
    'air',
    'coal_ore',
    'deepslate_iron_ore',
    'diamond_ore',
    'stone_bricks',
    'cobblestone_stairs',
    'smooth_stone',
    'polished_andesite',
    'infested_stone',
    'netherrack',
    'end_stone',
    '',
  ]) {
    assert.equal(isDigStoneBlock(name), false, name)
  }
  assert.equal(isDigStoneBlock(null), false)
  assert.equal(isDigStoneBlock(undefined), false)
})

test('a break counts only for the quest player, and a seen digger beats proximity', () => {
  assert.equal(
    creditStoneBreak({ blockName: 'stone', questPlayer: 'Kid', progressPlayer: 'Kid', nearestPlayer: 'Spark' }),
    true,
  )
  assert.equal(
    creditStoneBreak({
      blockName: 'minecraft:deepslate',
      questPlayer: 'Kid',
      progressPlayer: 'Maple',
      nearestPlayer: 'Kid',
    }),
    false,
  )
  assert.equal(
    creditStoneBreak({ blockName: 'andesite', questPlayer: 'Kid', nearestPlayer: 'Kid' }),
    true,
  )
  assert.equal(
    creditStoneBreak({ blockName: 'tuff', questPlayer: 'Kid', nearestPlayer: 'Spark' }),
    false,
  )
  assert.equal(
    creditStoneBreak({ blockName: 'dirt', questPlayer: 'Kid', progressPlayer: 'Kid' }),
    false,
  )
  assert.equal(creditStoneBreak({ blockName: 'stone', questPlayer: 'Kid' }), false)
  assert.equal(sameBreakTwice(1_000, 1_500, 800), true)
  assert.equal(sameBreakTwice(1_000, 1_800, 800), false)
  assert.equal(sameBreakTwice(null, 1_800, 800), false)
})

test('scan offsets include the feet and the block beside them', () => {
  const cells = digStoneScanOffsets(2)
  assert.ok(cells.some((cell) => cell.dx === 0 && cell.dy === 0 && cell.dz === 0))
  assert.ok(cells.some((cell) => cell.dx === 1 && cell.dy === -1 && cell.dz === 0))
  assert.equal(cells.length, 5 * 5 * 3)
})

test('english lesson lines stay very short', () => {
  for (const line of Object.values(DIG_STONE_LINES)) {
    assert.ok(englishWordCount(line) <= 10, line)
    assert.ok(englishWordCount(line) >= 3, line)
  }
  assert.equal(DIG_STONE_LINES.find, 'Find some stone.')
  assert.equal(DIG_STONE_LINES.dig, 'Dig three stones.')
  assert.equal(DIG_STONE_LINES.done, 'Good job! Three stones!')
  assert.equal(DIG_STONE_PROGRESS[1], 'One stone.')
  assert.equal(DIG_STONE_PROGRESS[2], 'Two stones.')
  assert.equal(DIG_STONE_HINTS.find, '去找石头。')
  assert.equal(DIG_STONE_HINTS.dig, '挖三块石头。')
})

test('quest does not skip ahead until each world step is met', () => {
  const started = createDigStoneQuest('Kid', 0)
  assert.equal(started.quest.step, 'find')
  assert.equal(started.quest.dug, 0)
  assert.deepEqual(said(started.events), ['Find some stone.'])
  assert.equal(digStoneStepLine(started.quest), 'Find some stone.')

  const waiting = tickDigStone(started.quest, { now: 1_000, ...noStone })
  assert.equal(waiting.quest.step, 'find')
  assert.equal(waiting.events.length, 0)

  const unseen = tickDigStone(waiting.quest, { now: 1_500, ...hidden })
  assert.equal(unseen.quest.step, 'find')
  assert.equal(unseen.quest.dug, 0)

  const oneTickCannotFinish = tickDigStone(unseen.quest, {
    now: 2_000,
    visible: true,
    nearStone: false,
    stoneDug: 3,
  })
  assert.equal(oneTickCannotFinish.quest.step, 'dig')
  assert.equal(oneTickCannotFinish.quest.dug, 0)
  assert.equal(oneTickCannotFinish.quest.finished, false)
  assert.deepEqual(said(oneTickCannotFinish.events), ['Dig three stones.'])
  assert.equal(
    oneTickCannotFinish.events.some((event) => event.type === 'say' && event.text === DIG_STONE_LINES.done),
    false,
  )

  const standing = applyDigStoneWorld(started.quest, { now: 2_000, visible: true, nearStone: true, breaks: 0 })
  assert.equal(standing.quest.step, 'dig')
  assert.equal(standing.quest.dug, 0)
  assert.equal(standing.quest.finished, false)
  assert.deepEqual(said(standing.events), ['Dig three stones.'])

  const one = applyDigStoneWorld(standing.quest, { now: 3_000, visible: true, nearStone: true, breaks: 1 })
  assert.equal(one.quest.step, 'dig')
  assert.equal(one.quest.dug, 1)
  assert.equal(one.quest.finished, false)
  assert.deepEqual(said(one.events), ['One stone.'])

  const two = applyDigStoneWorld(one.quest, { now: 4_000, visible: true, nearStone: false, breaks: 1 })
  assert.equal(two.quest.dug, 2)
  assert.equal(two.quest.finished, false)
  assert.deepEqual(said(two.events), ['Two stones.'])

  const away = applyDigStoneWorld(two.quest, { now: 5_000, visible: true, nearStone: false, breaks: 0 })
  assert.equal(away.quest.dug, 2)
  assert.equal(away.quest.step, 'dig')

  const done = applyDigStoneWorld(away.quest, { now: 6_000, visible: true, nearStone: true, breaks: 1 })
  assert.equal(done.quest.step, 'done')
  assert.equal(done.quest.dug, 3)
  assert.equal(done.quest.finished, true)
  assert.ok(done.events.some((event) => event.type === 'advance' && event.reason === 'dug-3'))
  assert.deepEqual(said(done.events), ['Good job! Three stones!'])
  assert.equal(digStoneStepLine(done.quest), null)

  const after = tickDigStone(done.quest, { now: 20_000, ...seeStone, stoneDug: 5 })
  assert.equal(after.events.length, 0)
  assert.equal(after.quest.step, 'done')
})

test('three stone breaks complete the quest and one or two do not', () => {
  const started = createDigStoneQuest('Kid', 0)

  const firstOnly = applyDigStoneWorld(started.quest, { now: 1_000, visible: true, nearStone: false, breaks: 1 })
  assert.equal(firstOnly.quest.step, 'dig')
  assert.equal(firstOnly.quest.dug, 1)
  assert.equal(firstOnly.quest.finished, false)
  assert.deepEqual(said(firstOnly.events), ['Dig three stones.', 'One stone.'])

  const twoBreaks = applyDigStoneWorld(started.quest, { now: 1_000, visible: true, nearStone: false, breaks: 2 })
  assert.equal(twoBreaks.quest.dug, 2)
  assert.equal(twoBreaks.quest.finished, false)
  assert.deepEqual(said(twoBreaks.events), ['Dig three stones.', 'One stone.', 'Two stones.'])

  const three = applyDigStoneWorld(started.quest, { now: 1_000, visible: true, nearStone: false, breaks: 3 })
  assert.equal(three.quest.finished, true)
  assert.equal(three.quest.dug, 3)
  assert.deepEqual(said(three.events), [
    'Dig three stones.',
    'One stone.',
    'Two stones.',
    'Good job! Three stones!',
  ])

  const batched = tickDigStone(
    { ...started.quest, step: 'dig', dug: 0 },
    { now: 1_000, visible: true, nearStone: true, stoneDug: 3 },
  )
  assert.equal(batched.quest.finished, true)
  assert.deepEqual(said(batched.events), ['Good job! Three stones!'])
})

test('chat is not an input: time alone never finishes or skips a step', () => {
  const started = createDigStoneQuest('Kid', 0)
  let quest: DigStoneQuest = started.quest
  for (const now of [1_000, 5_000, 13_000]) {
    const ticked = tickDigStone(quest, { now, ...noStone })
    quest = ticked.quest
    assert.equal(quest.step, 'find')
    assert.equal(quest.dug, 0)
    assert.equal(ticked.events.length, 0)
  }
  const repeat = tickDigStone(quest, { now: 14_000, ...noStone, repeatMs: 14_000, hintAfterMs: 18_000 })
  assert.equal(repeat.quest.step, 'find')
  assert.equal(repeat.quest.finished, false)
  assert.deepEqual(repeat.events, [{ type: 'say', step: 'find', text: 'Find some stone.' }])
})

test('a stuck kid hears the same english step, then one chinese hint', () => {
  const started = createDigStoneQuest('Kid', 0)
  const repeat = tickDigStone(started.quest, { now: 14_000, ...noStone, repeatMs: 14_000, hintAfterMs: 18_000 })
  assert.equal(repeat.quest.step, 'find')
  assert.deepEqual(repeat.events, [{ type: 'say', step: 'find', text: 'Find some stone.' }])

  const hint = tickDigStone(repeat.quest, { now: 18_000, ...noStone, repeatMs: 14_000, hintAfterMs: 18_000 })
  assert.deepEqual(hint.events, [{ type: 'hint', step: 'find', text: '去找石头。' }])
  assert.equal(hint.quest.hinted, true)

  const again = tickDigStone(hint.quest, { now: 19_000, ...noStone, repeatMs: 14_000, hintAfterMs: 18_000 })
  assert.equal(again.events.length, 0)

  const englishAgain = tickDigStone(again.quest, { now: 28_000, ...noStone, repeatMs: 14_000, hintAfterMs: 18_000 })
  assert.deepEqual(englishAgain.events, [{ type: 'say', step: 'find', text: 'Find some stone.' }])
  assert.equal(englishAgain.events.some((event) => event.type === 'hint'), false)

  const digging = applyDigStoneWorld(englishAgain.quest, { now: 29_000, visible: true, nearStone: true, breaks: 0 })
  assert.equal(digging.quest.step, 'dig')
  assert.equal(digging.quest.hinted, false)

  const digRepeat = tickDigStone(digging.quest, {
    now: 43_000,
    ...noStone,
    repeatMs: 14_000,
    hintAfterMs: 18_000,
  })
  assert.deepEqual(digRepeat.events, [{ type: 'say', step: 'dig', text: 'Dig three stones.' }])
  assert.equal(digRepeat.quest.dug, 0)

  const digHint = tickDigStone(digRepeat.quest, {
    now: 47_000,
    ...noStone,
    repeatMs: 14_000,
    hintAfterMs: 18_000,
  })
  assert.deepEqual(digHint.events, [{ type: 'hint', step: 'dig', text: '挖三块石头。' }])
  const noSecondHint = tickDigStone(digHint.quest, {
    now: 48_000,
    ...noStone,
    repeatMs: 14_000,
    hintAfterMs: 18_000,
  })
  assert.equal(noSecondHint.events.length, 0)
  assert.equal(noSecondHint.quest.step, 'dig')
})
