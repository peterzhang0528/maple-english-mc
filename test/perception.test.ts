import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hostileMobLabel, isPeerPlayChat, peerReplyAllowed } from '../src/behavior/perception.js'
import {
  envDangerLine,
  envDigLine,
  idlePeerBanter,
  peerPlayInvite,
  proactiveInvite,
  quietNudge,
  spawnGreeting,
  systemPrompt,
  voiceInstructions,
} from '../src/chat/persona.js'
import { emptyWorld } from '../src/types.js'
import { renderUserTurn } from '../src/chat/claude.js'
import type { TutorInput } from '../src/chat/fallback.js'
import { fallbackReply } from '../src/chat/fallback.js'

test('peer play chat accepts invites and ignores greet spam', () => {
  assert.equal(isPeerPlayChat('Hey Maple! Race you!', 'Maple'), true)
  assert.equal(isPeerPlayChat('Let us dig together', 'Spark'), true)
  assert.equal(isPeerPlayChat('Hi Spark! Want to explore or build a bridge together?', 'Spark'), true)
  assert.equal(isPeerPlayChat('Hi!', 'Maple'), false)
  assert.equal(isPeerPlayChat('Hello!', 'Spark'), false)
  assert.equal(isPeerPlayChat('I am Spark.', 'Maple'), false)
  assert.equal(isPeerPlayChat('Still here!', 'Maple'), false)
  assert.equal(isPeerPlayChat('Hey Maple! Race you to that hill! Or dig with me!', 'Maple'), true)
  assert.equal(
    isPeerPlayChat('Hey! I am Spark. Race you to that hill! Or say: Follow me!', 'Maple'),
    false,
  )
})


test('idle peer banter is play chat and party prompts encourage banter', () => {
  const line = idlePeerBanter('maple', 'Spark', 'peterzhang0528')
  assert.equal(isPeerPlayChat(line, 'Spark'), true)
  assert.match(line, /Spark/)
  assert.match(systemPrompt('maple'), /party friends|When a human is quiet/i)
  assert.match(voiceInstructions('spark'), /eyes and ears|mini play|react/i)
})

test('peer reply cooldown blocks rapid loops', () => {
  assert.equal(peerReplyAllowed({ lastPeerReplyAt: 0, now: 30_000 }), true)
  assert.equal(peerReplyAllowed({ lastPeerReplyAt: 20_000, now: 30_000 }), false)
})

test('system prompts require Minecraft username and friend play', () => {
  assert.match(systemPrompt('maple'), /Play WITH Spark/i)
  assert.match(systemPrompt('maple'), /exact Minecraft username/i)
  assert.match(systemPrompt('spark'), /Let.s .* together|buddy/i)
  assert.match(voiceInstructions('maple'), /exact Minecraft username/i)
  assert.match(voiceInstructions('spark'), /eyes and ears/i)
})

test('templates call the human by Minecraft username', () => {
  const name = 'peterzhang0528'
  assert.match(proactiveInvite('maple', name), new RegExp(name))
  assert.match(proactiveInvite('spark', name), /let.s play together/i)
  assert.match(quietNudge('maple', name), new RegExp(name))
  assert.match(quietNudge('spark', name), new RegExp(name))
  assert.match(spawnGreeting('maple', 'beginner', name), new RegExp(name))
  assert.match(peerPlayInvite('spark', 'Maple', name), new RegExp(name))
  assert.match(peerPlayInvite('maple', 'Spark', name), /come play with us/)
  assert.match(envDigLine('maple', name, 'oak log', name), new RegExp(`Hi ${name}`))
  assert.match(envDigLine('spark', 'Spark', 'oak log', name), new RegExp(`Come dig with us, ${name}`))
})

test('fallback greets and replies with the player username', () => {
  const world = emptyWorld()
  const reply = fallbackReply({
    username: 'peterzhang0528',
    text: 'hi',
    difficulty: 'beginner',
    difficultyChanged: false,
    world,
    intents: [{ type: 'chat' }],
    craftLesson: null,
  })
  assert.match(reply, /peterzhang0528/)
  assert.match(reply, /let.s play together/i)
})

test('renderUserTurn includes address_as and noticed observations', () => {
  const world = emptyWorld()
  world.observations = ['Hey peterzhang0528! You are chopping oak log — let\'s dig together!']
  const input: TutorInput = {
    username: 'peterzhang0528',
    text: 'hi',
    difficulty: 'beginner',
    difficultyChanged: false,
    world,
    intents: [{ type: 'chat' }],
    craftLesson: null,
  }
  const rendered = renderUserTurn(input)
  assert.match(rendered, /address_as: peterzhang0528/)
  assert.match(rendered, /\[noticed\]/)
})

test('danger helpers label hostiles and speak short warnings', () => {
  assert.equal(hostileMobLabel('zombie'), 'zombie')
  assert.equal(hostileMobLabel('creeper'), 'creeper')
  assert.equal(hostileMobLabel('pig'), null)
  assert.match(envDangerLine('maple', 'mob', 'zombie', 'peterzhang0528'), /Careful, peterzhang0528/)
  assert.match(envDangerLine('spark', 'lava', 'lava', 'peterzhang0528'), /Lava nearby/)
})
