/**
 * Minimal playful autonomy: mini-quest proposals, anti-repeat lines, short turn memory.
 * Keeps Maple less dull without a big quest engine.
 */
import type { CompanionPersona } from '../chat/persona.js'

export type SituateHint = {
  time?: 'day' | 'night' | 'unknown'
  nearbyBlock?: string | null
  nearbyMob?: string | null
  kidLastDid?: string | null
  kidLastSaid?: string | null
}

/** Ring buffer of last kid/world beats for prompts + chat. */
export class ShortMemory {
  private items: string[] = []
  constructor(private readonly max = 6) {}

  push(line: string): void {
    const clean = line.replace(/\s+/g, ' ').trim().slice(0, 140)
    if (!clean) return
    if (this.items[this.items.length - 1] === clean) return
    this.items.push(clean)
    while (this.items.length > this.max) this.items.shift()
  }

  list(): string[] {
    return [...this.items]
  }

  summary(): string {
    if (this.items.length === 0) return ''
    return this.items.map((line, i) => `${i + 1}. ${line}`).join(' | ')
  }
}

/** Pick a line not in the recent spoken set; remember it. */
export function pickFreshLine(pool: string[], recent: string[], remember = 4): string {
  const unused = pool.filter((line) => !recent.includes(line))
  const chosen = (unused.length > 0 ? unused : pool)[Math.floor(Math.random() * (unused.length > 0 ? unused.length : pool.length))]!
  recent.push(chosen)
  while (recent.length > remember) recent.shift()
  return chosen
}

const QUEST_POOL_KID = (kid: string, hint: SituateHint): string[] => {
  const block = hint.nearbyBlock
  const mob = hint.nearbyMob
  const time = hint.time
  const did = hint.kidLastDid
  const lines = [
    `Hey ${kid}! Mini-quest: race me to that tree — go!`,
    `Hey ${kid}! Soft challenge: dig three blocks with me!`,
    `${kid}, want a tiny bridge? Put two blocks — I will help!`,
    `Hey ${kid}! Look around — find one flower or leaf and show me!`,
    `${kid}, follow-me game: walk five steps, then say stop!`,
    `Mini-quest, ${kid}: give me one block, then I give you one back!`,
    `Hey ${kid}! Let's count: dig one, dig two — ready?`,
  ]
  if (block) {
    lines.push(`Whoa ${kid}, I see ${block} nearby — shall we check it out?`)
    lines.push(`Hey ${kid}! Quest: walk to the ${block} with me!`)
  }
  if (mob) {
    lines.push(`Look ${kid}! A ${mob}! Soft quest: wave hello, then stay safe!`)
  }
  if (time === 'night') {
    lines.push(`Night quest, ${kid}: stick close and find a safe spot together!`)
  }
  if (did) {
    lines.push(`Nice ${kid} — you just ${did}. Next: try one more with me!`)
  }
  return lines
}

const QUEST_POOL_ALONE = (hint: SituateHint): string[] => {
  const block = hint.nearbyBlock
  const lines = [
    'Soft quest: race to that hill when you are ready!',
    'Mini-quest waiting: dig three blocks together!',
    'Want a tiny bridge? Say build with me!',
    'Follow-me game: walk a bit, then say stop!',
  ]
  if (block) lines.push(`I spotted ${block} — come look when you can!`)
  return lines
}

export function proposeMiniQuest(
  persona: CompanionPersona,
  kidName: string | null,
  hint: SituateHint,
  recent: string[],
): string {
  const kid = kidName?.trim() || null
  const pool = kid ? QUEST_POOL_KID(kid, hint) : QUEST_POOL_ALONE(hint)
  const line = pickFreshLine(pool, recent, 5)
  if (persona === 'spark') {
    // Spark muted path may still log/act; keep lines short if ever spoken.
    return line.replace(/^Hey /, 'Yo ').replace(/^Hi /, 'Yo ')
  }
  return line
}

export function situateComment(
  persona: CompanionPersona,
  kidName: string | null,
  hint: SituateHint,
  recent: string[],
): string | null {
  const kid = kidName?.trim() || null
  const who = kid ?? 'friend'
  const pool: string[] = []
  if (hint.nearbyBlock) {
    pool.push(
      persona === 'spark'
        ? `Yo ${who}! Cool ${hint.nearbyBlock} right there!`
        : `Hey ${who}, I notice ${hint.nearbyBlock} nearby — want to look?`,
    )
  }
  if (hint.nearbyMob) {
    pool.push(
      persona === 'spark'
        ? `Hey ${who}! ${hint.nearbyMob} spotted — soft look, then play!`
        : `Hi ${who}! I see a ${hint.nearbyMob}. Let's watch from here!`,
    )
  }
  if (hint.time === 'night') {
    pool.push(
      persona === 'spark'
        ? `Night vibe, ${who} — stick with me!`
        : `It is night, ${who}. Stay close — we can still play softly.`,
    )
  } else if (hint.time === 'day' && Math.random() < 0.35) {
    pool.push(
      persona === 'spark'
        ? `Sunny day, ${who}! Race or dig — your pick!`
        : `Nice day, ${who}! What should we try next?`,
    )
  }
  if (hint.kidLastDid) {
    pool.push(
      persona === 'spark'
        ? `Nice move, ${who} — you ${hint.kidLastDid}! Again?`
        : `I saw that, ${who} — you ${hint.kidLastDid}. Want to keep going?`,
    )
  }
  if (hint.kidLastSaid) {
    pool.push(
      persona === 'spark'
        ? `Ha, ${who} — you said "${hint.kidLastSaid.slice(0, 40)}" — I'm in!`
        : `Got it, ${who} — "${hint.kidLastSaid.slice(0, 40)}". Let's do that!`,
    )
  }
  if (pool.length === 0) return null
  return pickFreshLine(pool, recent, 5)
}

/** Varied dig lines — avoid the same "chopping X, dig together" forever. */
export function variedDigLine(
  persona: CompanionPersona,
  actor: string,
  block: string,
  buddyName: string | null,
  recent: string[],
): string {
  const buddy = buddyName?.trim() || null
  const actorIsBuddy = buddy != null && actor.toLowerCase() === buddy.toLowerCase()
  const pool: string[] = []
  if (persona === 'spark') {
    if (actorIsBuddy) {
      pool.push(
        `Whoa ${buddy}! ${block} — chop chop!`,
        `Nice swings, ${buddy}! That ${block} is toast!`,
        `${buddy}, dig race on that ${block}?`,
        `Hey ${buddy}! Leave me one ${block} bit!`,
      )
    } else if (buddy) {
      pool.push(
        `${actor} is on ${block}! Jump in, ${buddy}!`,
        `I see ${actor} + ${block}. ${buddy}, soft dig with us?`,
        `${buddy} — ${actor} found ${block}. Come peek!`,
      )
    } else {
      pool.push(`Chopping ${block}! Dig race?`, `I see ${block} going down — join in!`)
    }
  } else if (actorIsBuddy) {
    pool.push(
      `Nice, ${buddy}! You are working on ${block}.`,
      `I see you with ${block}, ${buddy} — need a hand?`,
      `Cool ${block}, ${buddy}. One more, or switch?`,
      `${buddy}, that ${block} looks fun — shall I dig next to you?`,
    )
  } else if (buddy) {
    pool.push(
      `I see ${actor} on ${block}. ${buddy}, want to join?`,
      `${buddy} — ${actor} found ${block}. Soft quest: dig one too?`,
      `Look ${buddy}: ${actor} is clearing ${block}.`,
    )
  } else {
    pool.push(`Someone is chopping ${block}. Want to dig together?`, `I notice ${block} breaking nearby.`)
  }
  return pickFreshLine(pool, recent, 6)
}

export function variedPlaceLine(
  persona: CompanionPersona,
  actor: string,
  block: string,
  buddyName: string | null,
  recent: string[],
): string {
  const buddy = buddyName?.trim() || null
  const actorIsBuddy = buddy != null && actor.toLowerCase() === buddy.toLowerCase()
  const pool: string[] = []
  if (persona === 'spark') {
    if (actorIsBuddy) {
      pool.push(
        `Build mode, ${buddy}! Love that ${block}!`,
        `${buddy} dropped ${block} — bridge next?`,
        `Whoa ${buddy}, ${block} looks neat!`,
      )
    } else if (buddy) {
      pool.push(`${actor} placed ${block}! Come build, ${buddy}!`, `${buddy} — check ${actor}'s ${block}!`)
    } else {
      pool.push(`${block} placed! Tiny bridge time?`)
    }
  } else if (actorIsBuddy) {
    pool.push(
      `Nice place, ${buddy} — ${block}!`,
      `I like that ${block}, ${buddy}. One more?`,
      `${buddy}, cool build with ${block}. House corner?`,
    )
  } else if (buddy) {
    pool.push(`I see ${actor} placing ${block}. Join us, ${buddy}?`, `${buddy} — ${actor} built with ${block}.`)
  } else {
    pool.push(`Someone placed ${block}. Shall we build together?`)
  }
  return pickFreshLine(pool, recent, 6)
}

export function variedQuietNudge(persona: CompanionPersona, playerName: string, recent: string[]): string {
  const pool =
    persona === 'spark'
      ? [
          `Hey ${playerName}! Soft quest — race or dig?`,
          `${playerName}, still here — tiny bridge?`,
          `Yo ${playerName}! Pick: follow me, or I follow you!`,
          `Hey ${playerName}! Show me a cool block!`,
        ]
      : [
          `Hi ${playerName}! Want a mini-quest — race, dig, or tiny bridge?`,
          `${playerName}, I am here. What should we try next?`,
          `Hey ${playerName}! Soft idea: follow-me, then you lead!`,
          `Hi ${playerName}! Point at something fun and I will come.`,
        ]
  return pickFreshLine(pool, recent, 4)
}

/** Friendly GPT Live add-on: less canned, react to kid, use short memory. */
export function livePlayfulnessRules(): string {
  return [
    'Be a playful buddy, not a repeating tutor script.',
    'Never spam the same dig/build invite. Vary ideas: race, tiny bridge, follow-me, count digs, find a flower, soft look at a mob.',
    'When the kid speaks (even Chinese, laughs, or short words), react to THAT meaning in simple English — do not ignore them to pitch a canned quest.',
    'Use short memory of the last few turns: what they said, dug, or placed — comment on it once, then move on.',
    'Self-start fun when they are quiet for a bit: propose ONE mini-quest, then wait and listen.',
    'Sound natural and warm; one short sentence is enough. Soften corrections; never lecture.',
    'If Spark is silent, you (Maple) carry the talk — do not wait for Spark to chat.',
  ].join(' ')
}
