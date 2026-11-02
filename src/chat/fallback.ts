import type { Difficulty } from '../config.js'
import { explainBlock } from '../behavior/blocks.js'
import { lessonText, type CraftingLesson } from '../behavior/recipes.js'
import type { Intent, WorldSnapshot } from '../types.js'
import { loadPersona } from './persona.js'

export interface TutorInput {
  username: string
  text: string
  difficulty: Difficulty
  difficultyChanged: boolean
  world: WorldSnapshot
  intents: Intent[]
  craftLesson: CraftingLesson | null
}

export function fallbackReply(input: TutorInput): string {
  const parts: string[] = []
  if (input.difficultyChanged) parts.push(difficultyLine(input.difficulty))
  if (input.intents.some((intent) => intent.type === 'help')) parts.push(helpLine(input.difficulty))

  const inspect = input.intents.some((intent) => intent.type === 'inspect_block')
  const craft = input.intents.some((intent) => intent.type === 'craft')
  if (inspect) parts.push(blockLine(input))
  if (craft) parts.push(craftLine(input))

  const movement = movementLine(input)
  if (movement && !inspect && !craft) parts.push(movement)
  else if (movement && (inspect || craft)) {
    const brief = shortMovement(input)
    if (brief) parts.push(brief)
  }

  if (parts.length === 0) parts.push(chatLine(input))
  return parts.join(' ')
}

export function suggestRewrite(text: string): string | null {
  let sentence = text.trim().replace(/\s+/g, ' ')
  if (!sentence) return null
  let changed = false
  const apply = (pattern: RegExp, replacement: string) => {
    const next = sentence.replace(pattern, replacement)
    if (next !== sentence) {
      sentence = next
      changed = true
    }
  }
  apply(/\bi\b/g, 'I')
  apply(/\bI want go\b/gi, 'I want to go')
  apply(/\bI go mine\b/gi, 'I am going to mine')
  apply(/\bme want\b/gi, 'I want')
  apply(/\bhow I craft\b/gi, 'how do I craft')
  apply(/\bno understand\b/gi, 'I do not understand')
  apply(/\bI is\b/g, 'I am')
  if (/^[a-z]/.test(sentence)) {
    sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1)
    changed = true
  }
  if (changed && !/[.!?]$/.test(sentence)) sentence += '.'
  return changed ? sentence : null
}

function difficultyLine(difficulty: Difficulty): string {
  if (difficulty === 'beginner') {
    return 'Okay. We will use beginner English. I will keep the words short and simple.'
  }
  return 'We can use intermediate English now. I will add a few new words as we play.'
}

function helpLine(difficulty: Difficulty): string {
  if (difficulty === 'beginner') {
    return 'I can follow you, dig, build a house, give items, and warn about danger. Say help me, dig, build a house, or give. Ask "what is this block?" or "how do I craft a pickaxe?".'
  }
  return 'I can follow, dig, build a house, give items, and call out danger. Say help me, dig with me, build a house, or give. Ask about a block or a crafting recipe too.'
}

function blockLine(input: TutorInput): string {
  const block = input.world.lookingAt
  if (!block) {
    return input.difficulty === 'beginner'
      ? 'I cannot see the block. Look at it and ask again: What is this block?'
      : 'I cannot tell which block you mean. Look straight at it and ask me again.'
  }
  return explainBlock(block, input.difficulty)
}

function craftLine(input: TutorInput): string {
  if (!input.craftLesson) {
    return input.difficulty === 'beginner'
      ? 'I do not know that recipe yet. Try a wooden pickaxe, a stick, or a crafting table.'
      : 'I do not have that recipe. Ask me for a wooden pickaxe, sticks, or a crafting table.'
  }
  return lessonText(input.craftLesson, input.difficulty)
}

function movementLine(input: TutorInput): string | null {
  const failed = input.world.actionNotes.find((note) =>
    /cannot see|not sure|cannot walk|cannot find|cannot place|do not have items/i.test(note),
  )
  if (failed) {
    return input.difficulty === 'beginner'
      ? `${failed} Please walk closer.`
      : `${failed} Step a little closer and try again.`
  }
  const who = input.username
  if (input.intents.some((intent) => intent.type === 'assist')) {
    return `Okay ${who}! I am coming to help. Dig, build, or say give!`
  }
  if (input.intents.some((intent) => intent.type === 'dig')) {
    return `Okay ${who}! Let's dig together. Chop the block near you!`
  }
  if (input.intents.some((intent) => intent.type === 'build_house')) {
    return `Okay ${who}! Let's build a house — walls, a door, and a roof!`
  }
  if (input.intents.some((intent) => intent.type === 'build')) {
    return `Okay ${who}! Let's build together. Put one block here!`
  }
  if (input.intents.some((intent) => intent.type === 'give')) {
    return `Okay ${who}! Here — items for you. Say thank you!`
  }
  if (input.intents.some((intent) => intent.type === 'follow')) {
    return input.difficulty === 'beginner'
      ? `Okay ${who}, I will follow you. "Follow me" means walk behind me. Let's walk together!`
      : `Okay ${who}, I will follow you. "Follow me" means walk with you and stay close.`
  }
  if (input.intents.some((intent) => intent.type === 'come')) {
    return input.difficulty === 'beginner'
      ? `Coming, ${who}! "Come here" means walk to me. Let's play together.`
      : `On my way, ${who}! "Come here" means walk to your spot.`
  }
  if (input.intents.some((intent) => intent.type === 'stop')) {
    return input.difficulty === 'beginner'
      ? `Okay ${who}, I will wait here.`
      : `Okay ${who}, I will wait here. Say follow me when you want me again.`
  }
  if (input.intents.some((intent) => intent.type === 'look')) {
    return input.difficulty === 'beginner'
      ? `I am looking at you, ${who}.`
      : `Looking at you, ${who}. Let's keep playing!`
  }
  return null
}

function shortMovement(input: TutorInput): string | null {
  if (input.world.actionNotes.some((note) => /cannot see|cannot walk|cannot find|cannot place/i.test(note))) {
    return movementLine(input)
  }
  if (input.intents.some((intent) => intent.type === 'assist')) return 'I am coming to help.'
  if (input.intents.some((intent) => intent.type === 'dig')) return 'Let us dig together.'
  if (input.intents.some((intent) => intent.type === 'build_house')) return 'Let us build a house!'
  if (input.intents.some((intent) => intent.type === 'build')) return 'Let us build together.'
  if (input.intents.some((intent) => intent.type === 'give')) return 'Here — for you!'
  if (input.intents.some((intent) => intent.type === 'follow')) return 'I will follow you.'
  if (input.intents.some((intent) => intent.type === 'come')) return 'I am coming.'
  if (input.intents.some((intent) => intent.type === 'stop')) return 'I will wait.'
  if (input.intents.some((intent) => intent.type === 'look')) return 'I am looking at you.'
  return null
}


function peerLine(input: TutorInput): string | null {
  const raw = input.text.trim()
  const peerMatch = raw.match(/^\[peer ([^\]]+)\]\s*(.*)$/i)
  if (!peerMatch) return null
  const peerName = peerMatch[1] ?? 'friend'
  const said = (peerMatch[2] ?? '').toLowerCase()
  const persona = loadPersona()
  const kidHint = input.world.observations.find((line) => /Human (?:kid|buddy) nearby:/i.test(line))
  const kid = kidHint?.match(/Human (?:kid|buddy) nearby:\s*(\S+)/i)?.[1] ?? null
  if (persona === 'spark') {
    if (kid) return `Yes ${peerName}! Let's dig with ${kid} — come on, ${kid}! Race or bridge!`
    if (/race|dig|bridge|follow|come|together|explore/i.test(said)) {
      return `Yes ${peerName}! Let's play together — race you, or dig with me!`
    }
    return `Hey ${peerName}! Let's play together — race, dig, or bridge?`
  }
  if (kid) return `Yes ${peerName}! Let's play with ${kid} — come on, ${kid}! Bridge or explore?`
  if (/race|dig|bridge|follow|come|together|explore/i.test(said)) {
    return `Yes ${peerName}! Let's build a bridge together — I am coming!`
  }
  return `Hi ${peerName}! Let's explore or build something together!`
}

function chatLine(input: TutorInput): string {
  const peer = peerLine(input)
  if (peer) return peer
  const who = input.username
  if (/^(hi|hello|hey|good morning|good night|howdy)[.!\s]*$/i.test(input.text.trim())) {
    const persona = loadPersona()
    if (persona === 'spark') {
      return input.difficulty === 'beginner'
        ? `Hey ${who}! I am Spark — let's play together! Race, dig, or say follow me!`
        : `Hey ${who}! Spark here — let's race, dig, or build a bridge together!`
    }
    return input.difficulty === 'beginner'
      ? `Hi ${who}! I am Maple — let's play together! Want to build a bridge, or shall I follow you?`
      : `Hi ${who}! I am Maple. Let's explore together — tell me what you see, or ask me to follow you.`
  }
  const rewrite = suggestRewrite(input.text)
  if (rewrite && input.difficulty === 'beginner') {
    return `Nice try, ${who}. You can say: "${rewrite}" What shall we do together next?`
  }
  if (rewrite && input.difficulty === 'intermediate') {
    return `Close, ${who}. A natural way to say it is: "${rewrite}" What should we do together next?`
  }
  if (input.difficulty === 'beginner') {
    return `I am here with you, ${who}. Let's play — tell me what you see, or ask: What is this block?`
  }
  return `I am listening, ${who}. Tell me what you want to do together, and I will help you say it clearly.`
}
