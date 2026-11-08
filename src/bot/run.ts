import mineflayer from 'mineflayer'
import type { Bot } from 'mineflayer'
import { Movements, pathfinder } from '../pathfinder.js'
import { playerAllowed, type AppConfig } from '../config.js'
import { performIntents, softAssistNear, softIdleMove } from '../behavior/actions.js'
import {
  attachPerception,
  isPeerPlayChat,
  peerReplyAllowed,
  type PerceptionHandle,
} from '../behavior/perception.js'
import { snapshotWorld } from '../behavior/world.js'
import { parseIntents } from '../behavior/intents.js'
import { RecentSpeech, parsePublicChat } from './chatParse.js'
import { SendQueue, TurnLimiter } from '../chat/limiter.js'
import { toChatLines } from '../chat/split.js'
import { completeTurn } from '../chat/turn.js'
import { createSession, type Session } from '../types.js'
import { loadVoiceConfig } from '../voice/config.js'
import { startJavaVoiceCompanion, voiceCompanionEnabled } from './voiceCompanion.js'
import { announcePartyLine } from './partyVoice.js'
import { ensureVisibleBody, rescueIfBuried } from './body.js'
import {
  idlePeerBanter,
  isCompanionUsername,
  peerPlayInvite,
  proactiveInvite,
  spawnGreeting,
} from '../chat/persona.js'
import {
  proposeMiniQuest,
  situateComment,
  variedQuietNudge,
} from '../behavior/fun.js'
import {
  digStoneQuestArmed,
  digStoneQuestEnabled,
  speakDuringQuest,
  type MapleQuestHooks,
} from '../behavior/digstone.js'
import { attachDigStoneGuide, type DigStoneGuide } from './digStoneGuide.js'

export interface CompanionHandle {
  bot: Bot
  stop: () => void
}

const SLOW_LINE = 'Please wait a moment. In English we can say: Let us speak a little slower.'
const STUCK_LINE = 'I am stuck. Please walk closer so I can follow you.'
const NUDGE_MS = 50_000
const PROACTIVE_FOLLOW_DELAY_MS = 1_200
const PEER_INVITE_MS = 90_000
const ENV_COMMENT_POLL_MS = 4_000
const KEEP_FOLLOW_MS = 5_000
const HOLD_STILL_MS = 45_000
/** Idle Maple↔Spark party banter (in-game chat; keeps GPT Live mic free for the kid). */
const PARTY_CHAT_POLL_MS = 7_000
const PARTY_CHAT_GAP_MS_MAPLE = 11_000
const PARTY_CHAT_GAP_MS_SPARK = 14_000
const PARTY_CHAT_AFTER_HUMAN_MS = 5_500

/** Idle Maple↔Spark chat + peer invites. Set PARTY_IDLE_CHAT=0 to silence Spark/party banter. */
function partyIdleChatEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.PARTY_IDLE_CHAT ?? '1').trim().toLowerCase()
  return !['0', 'false', 'no', 'off'].includes(flag)
}

const IDLE_MOVE_MS = 8_000
const MINI_QUEST_MS = 32_000
const SITUATE_CHAT_MS = 22_000

function logTag(config: AppConfig): string {
  return config.persona === 'spark' ? 'spark' : 'maple'
}

/** In-game chat plus optional mic-page TTS (Spark party voice). */
function chatOut(bot: Bot, config: AppConfig, line: string): void {
  const hooks = (bot as { mapleQuest?: MapleQuestHooks }).mapleQuest
  const spoken = speakDuringQuest(line, hooks)
  if (!spoken) return
  // PARTY_IDLE_CHAT=0 => Spark stays fully silent (no MC chat, no party TTS). Maple still speaks.
  if (config.persona === 'spark' && !partyIdleChatEnabled()) {
    console.log(`[spark] muted skip: ${spoken.replace(/\s+/g, ' ').trim().slice(0, 80)}`)
    return
  }
  bot.chat(spoken)
  void announcePartyLine(config.username, spoken)
}

export async function startCompanion(config: AppConfig, session?: Session): Promise<CompanionHandle> {
  const tag = logTag(config)
  const state = session ?? createSession(config.difficulty, config.historyTurns)
  const bot = createCompanionBot(config)
  const questHooks: MapleQuestHooks = {
    guiding: () => digStone?.guiding() ?? false,
    stepLine: () => digStone?.stepLine() ?? null,
  }
  ;(bot as { mapleQuest?: MapleQuestHooks }).mapleQuest = questHooks
  const limiter = new TurnLimiter(
    config.playerMinIntervalMs,
    config.muteMs,
    config.globalTurns,
    config.globalWindowMs,
  )
  const queue = new SendQueue(config.chatMinIntervalMs)
  const recent = new RecentSpeech(2_000)
  let chain: Promise<void> = Promise.resolve()
  let lastStuck = 0
  let greeted = false
  const greetedPlayers = new Set<string>()
  let lastChatAt = Date.now()
  let lastNudgeAt = 0
  let lastPeerReplyAt = 0
  let lastPeerInviteAt = 0
  let nudgeTimer: ReturnType<typeof setInterval> | null = null
  let envTimer: ReturnType<typeof setInterval> | null = null
  let bodyRescueTimer: ReturnType<typeof setInterval> | null = null
  let keepFollowTimer: ReturnType<typeof setInterval> | null = null
  let holdStillUntil = 0
  let perception: PerceptionHandle | null = null
  let lastHumanChatAt = 0
  let lastPartyChatAt = 0
  let lastSoftAssistAt = 0
  let partyChatTimer: ReturnType<typeof setInterval> | null = null
  let idleMoveTimer: ReturnType<typeof setInterval> | null = null
  let miniQuestTimer: ReturnType<typeof setInterval> | null = null
  let situateTimer: ReturnType<typeof setInterval> | null = null
  let lastMiniQuestAt = 0
  let lastSituateChatAt = 0
  const recentQuestLines: string[] = []
  const recentSituateLines: string[] = []
  const recentNudgeLines: string[] = []
  const digStoneOn = digStoneQuestArmed(config.persona)
  let digStone: DigStoneGuide | null = null
  let digStoneArmTimer: ReturnType<typeof setTimeout> | null = null
  const questGuiding = () => digStone?.guiding() ?? false

  const ready = new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => {
      bot.removeListener('spawn', readySpawn)
      reject(error)
    }
    const readySpawn = () => {
      bot.removeListener('error', fail)
      bot.removeListener('kicked', onKick)
      resolve()
    }
    const onKick = (reason: string) => fail(new Error(`Kicked before spawn: ${reason}`))
    bot.once('spawn', readySpawn)
    bot.once('error', fail)
    bot.once('kicked', onKick)
  })

  const humanOnline = (): string[] =>
    Object.keys(bot.players).filter(
      (name) => name.toLowerCase() !== bot.username.toLowerCase() && !isCompanionUsername(name),
    )

  /** Prefer nearest visible human, else first allowlisted / online human. */
  const primaryHuman = (): string | null => {
    const near = perception?.nearestHuman()
    if (near && playerAllowed(config, near)) return near
    const humans = humanOnline().filter((name) => playerAllowed(config, name))
    if (humans.length === 0) return null
    // Prefer entity-loaded (in view) humans.
    for (const name of humans) {
      if (bot.players[name]?.entity) return name
    }
    return humans[0] ?? null
  }

  const invitePlayer = (username: string, follow: boolean) => {
    const key = username.toLowerCase()
    if (key === bot.username.toLowerCase()) return
    if (isCompanionUsername(username)) return
    if (!playerAllowed(config, username)) return
    if (greetedPlayers.has(key)) return
    greetedPlayers.add(key)
    lastChatAt = Date.now()
    if (digStoneOn) {
      console.log(`[${tag}] digstone skip invite chat -> ${username}`)
    } else {
      const line = proactiveInvite(config.persona, username)
      console.log(`[${tag}] proactive invite -> ${username}`)
      void queue.send(toChatLines(line, config.chatMaxLineChars, config.chatMaxLines), (text) => chatOut(bot, config, text))
    }
    if (follow && !digStoneOn) {
      setTimeout(() => {
        void performIntents(bot, username, [{ type: 'come' }]).catch((error: unknown) => {
          console.error(`[${tag}] proactive walk: ${error instanceof Error ? error.message : String(error)}`)
        })
      }, PROACTIVE_FOLLOW_DELAY_MS)
    }
  }

  const peerOnline = (): string | null => {
    const peers = Object.keys(bot.players).filter(
      (name) => name.toLowerCase() !== bot.username.toLowerCase() && isCompanionUsername(name),
    )
    return peers[0] ?? null
  }

  const maybeInvitePeer = () => {
    if (questGuiding()) return
    if (!partyIdleChatEnabled()) return
    const now = Date.now()
    if (now - lastPeerInviteAt < PEER_INVITE_MS) return
    const peer = peerOnline()
    if (!peer) return
    const kid = primaryHuman()
    lastPeerInviteAt = now
    lastChatAt = now
    lastPartyChatAt = now
    const line = peerPlayInvite(config.persona, peer, kid)
    console.log(`[${tag}] peer invite -> ${peer}${kid ? ` (+${kid})` : ''}`)
    void queue.send(toChatLines(line, config.chatMaxLineChars, 1), (text) => chatOut(bot, config, text))
  }

  /** Lively Maple↔Spark cross-talk when the kid is quiet (party / 开黑感). */
  const maybePartyChat = () => {
    if (questGuiding()) return
    if (!partyIdleChatEnabled()) return
    const now = Date.now()
    const gap = config.persona === 'spark' ? PARTY_CHAT_GAP_MS_SPARK : PARTY_CHAT_GAP_MS_MAPLE
    // Own cadence only — do not let invites/env comments starve party banter.
    if (now - lastPartyChatAt < gap) return
    const voiceHumanAt = (bot as { mapleHumanChatAt?: number }).mapleHumanChatAt ?? 0
    const humanAt = Math.max(lastHumanChatAt, voiceHumanAt)
    // Do not talk over the kid right after they speak (chat or GPT Live mic).
    if (humanAt > 0 && now - humanAt < PARTY_CHAT_AFTER_HUMAN_MS) return
    const peer = peerOnline()
    if (!peer) return
    const kid = primaryHuman()
    lastPartyChatAt = now
    lastChatAt = now
    const line = idlePeerBanter(config.persona, peer, kid)
    console.log(`[${tag}] party chat -> ${peer}${kid ? ` (+${kid})` : ''}`)
    void queue.send(toChatLines(line, config.chatMaxLineChars, 1), (text) => chatOut(bot, config, text))
    // Soft come-near peer so bodies look busy together.
    if (Math.random() < 0.55) {
      void softIdleMove(bot, { comeName: peer }).catch((error: unknown) => {
        console.error(`[${tag}] party walk: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
  }

  const maybeIdleMove = () => {
    if (questGuiding()) return
    const now = Date.now()
    const marked = (bot as { mapleHoldStillUntil?: number }).mapleHoldStillUntil ?? 0
    if (now < Math.max(holdStillUntil, marked)) return
    const human = primaryHuman()
    const peer = peerOnline()
    const me = bot.entity?.position
    if (!me) return
    // If human is far, keep-follow owns movement.
    if (human) {
      const target = bot.players[human]?.entity?.position
      if (target && me.distanceTo(target) > 4.5) return
    }
    const roll = Math.random()
    if (roll < 0.35 && peer) {
      void softIdleMove(bot, { lookName: peer }).catch(() => {})
    } else if (roll < 0.55 && human) {
      void softIdleMove(bot, { lookName: human }).catch(() => {})
    } else if (roll < 0.75 && peer) {
      void softIdleMove(bot, { comeName: peer }).catch(() => {})
    } else if (roll < 0.9 && human) {
      void softIdleMove(bot, { comeName: human }).catch(() => {})
    } else {
      void softIdleMove(bot, { wander: true }).catch(() => {})
    }
  }

  bot.once('spawn', () => {
    const movements = new Movements(bot)
    movements.canDig = false
    movements.allow1by1towers = false
    movements.scafoldingBlocks = []
    bot.pathfinder.setMovements(movements)
    console.log(`[${tag}] Spawned in ${bot.game.dimension} as ${bot.username} (${bot.version}) persona=${config.persona}`)
    // Real mineflayer client body: force survival, refresh SkinsRestorer skin, short glow.
    setTimeout(() => ensureVisibleBody(bot, tag), 800)
    setTimeout(() => ensureVisibleBody(bot, tag), 4_000)
    if (config.persona === 'maple') {
      setTimeout(() => {
        try {
          bot.chat('/op Spark')
        } catch {
          /* ignore */
        }
      }, 1_500)
    }
    if (digStoneOn) {
      digStone = attachDigStoneGuide({
        bot,
        playerAllowed: (name) => playerAllowed(config, name),
        say: (line) => {
          lastChatAt = Date.now()
          void queue.send(toChatLines(line, config.chatMaxLineChars, 1), (text) => chatOut(bot, config, text))
        },
        log: (message) => console.log(`[${tag}] ${message}`),
      })
      const noticeHumans = () => {
        const names = Object.keys(bot.players).sort((a, b) => {
          const ae = bot.players[a]?.entity ? 0 : 1
          const be = bot.players[b]?.entity ? 0 : 1
          return ae - be
        })
        for (const name of names) digStone?.noteHuman(name)
      }
      noticeHumans()
      digStoneArmTimer = setTimeout(noticeHumans, 2_000)
      console.log(`[${tag}] digstone quest armed`)
    }

    if (config.greet && !greeted && !digStoneOn) {
      greeted = true
      const hello = spawnGreeting(config.persona, state.difficulty)
      void queue.send(toChatLines(hello, config.chatMaxLineChars, config.chatMaxLines), (line) => chatOut(bot, config, line))
      lastChatAt = Date.now()
    }

    perception = attachPerception(bot, {
      persona: config.persona,
      onEvent: (event) => {
        console.log(`[${tag}] noticed: ${event.text}`)
        if (questGuiding()) return
        const human = perception?.nearestHuman()
        // Soft co-op: when the kid digs/places, join in if nearby.
        if ((event.kind === 'dig' || event.kind === 'place') && human && event.actor) {
          if (event.actor.toLowerCase() === human.toLowerCase()) {
            const now = Date.now()
            if (now - lastSoftAssistAt > 10_000) {
              lastSoftAssistAt = now
              const kind = event.kind === 'dig' ? 'dig' : 'build'
              void softAssistNear(bot, human, kind)
                .then((note) => {
                  if (note) console.log(`[${tag}] soft assist (${kind}): ${note}`)
                })
                .catch((error: unknown) => {
                  console.error(`[${tag}] soft assist: ${error instanceof Error ? error.message : String(error)}`)
                })
            }
          }
        }
        // Danger: rush to the kid and let env comment warn them.
        if (event.kind === 'danger' && human) {
          void performIntents(bot, human, [{ type: 'come' }]).catch((error: unknown) => {
            console.error(`[${tag}] danger walk: ${error instanceof Error ? error.message : String(error)}`)
          })
        }
      },
    })

    // Expose situate + short memory for GPT Live session / health.
    ;(bot as { mapleSituate?: () => { hint: ReturnType<NonNullable<typeof perception>['situateHint']>; memory: string } }).mapleSituate = () => ({
      hint: perception?.situateHint() ?? {},
      memory: perception?.shortMemorySummary() ?? '',
    })
    ;(bot as { mapleRememberSaid?: (t: string) => void }).mapleRememberSaid = (said: string) => {
      perception?.rememberKidSaid(said)
    }

    // Invite anyone already online shortly after spawn.
    setTimeout(() => {
      for (const name of Object.keys(bot.players)) {
        if (name.toLowerCase() === bot.username.toLowerCase()) continue
        if (isCompanionUsername(name)) continue
        invitePlayer(name, true)
      }
      // Soft peer hello after humans (stagger by persona to avoid invite storms).
      setTimeout(maybeInvitePeer, config.persona === 'spark' ? 12_000 : 5_000)
    }, 2_500)

    nudgeTimer = setInterval(() => {
      if (questGuiding()) return
      const now = Date.now()
      if (now - lastChatAt < NUDGE_MS) return
      if (now - lastNudgeAt < NUDGE_MS) return
      const buddy = primaryHuman()
      if (!buddy) {
        maybePartyChat()
        maybeInvitePeer()
        return
      }
      // Prefer party banter over tutor-ish nudges when a peer is online.
      if (peerOnline() && now - lastPartyChatAt >= (config.persona === 'spark' ? PARTY_CHAT_GAP_MS_SPARK : PARTY_CHAT_GAP_MS_MAPLE)) {
        maybePartyChat()
        lastNudgeAt = now
        return
      }
      lastNudgeAt = now
      lastChatAt = now
      const line = variedQuietNudge(config.persona, buddy, recentNudgeLines)
      console.log(`[${tag}] quiet nudge -> ${buddy}`)
      void queue.send(toChatLines(line, config.chatMaxLineChars, 1), (text) => chatOut(bot, config, text))
    }, 10_000)

    envTimer = setInterval(() => {
      if (!perception) return
      if (questGuiding()) {
        perception.takeComment()
        return
      }
      const line = perception.takeComment()
      if (!line) return
      lastChatAt = Date.now()
      console.log(`[${tag}] env comment`)
      void queue.send(toChatLines(line, config.chatMaxLineChars, 1), (text) => chatOut(bot, config, text))
      // Prefer the human kid over peer companions so bots do not bury each other underground.
      const human = perception.nearestHuman()
      const target = human ?? perception.nearestPlayTarget()
      if (target && Math.random() < 0.45) {
        void performIntents(bot, target, [{ type: 'come' }]).catch((error: unknown) => {
          console.error(`[${tag}] env walk: ${error instanceof Error ? error.message : String(error)}`)
        })
      }
    }, ENV_COMMENT_POLL_MS)

    bodyRescueTimer = setInterval(() => {
      if (questGuiding()) return
      const human = rescueIfBuried(bot, tag)
      if (!human) return
      void performIntents(bot, human, [{ type: 'come' }]).catch((error: unknown) => {
        console.error(`[${tag}] body rescue walk: ${error instanceof Error ? error.message : String(error)}`)
      })
    }, 6_000)

    // Keep following the human so GPT Live / chat gaps do not leave Maple frozen beside them.
    keepFollowTimer = setInterval(() => {
      if (questGuiding()) return
      const marked = (bot as { mapleHoldStillUntil?: number }).mapleHoldStillUntil ?? 0
      if (Date.now() < Math.max(holdStillUntil, marked)) return
      const human = primaryHuman()
      if (!human) return
      const me = bot.entity?.position
      const target = bot.players[human]?.entity?.position
      if (!me || !target) return
      const dist = me.distanceTo(target)
      if (dist < 2.4) return
      void performIntents(bot, human, [{ type: 'follow' }]).catch((error: unknown) => {
        console.error(`[${tag}] keep follow: ${error instanceof Error ? error.message : String(error)}`)
      })
    }, KEEP_FOLLOW_MS)

    // Party idle chatter: bots keep bantering in chat even when the kid is silent.
    partyChatTimer = setInterval(() => {
      maybePartyChat()
    }, PARTY_CHAT_POLL_MS)
    // Stagger first party line so Maple/Spark do not speak the same second.
    setTimeout(maybePartyChat, config.persona === 'spark' ? 8_000 : 4_500)

    idleMoveTimer = setInterval(() => {
      maybeIdleMove()
    }, IDLE_MOVE_MS)

    // Self-initiated fun: Maple proposes mini-quests; Spark acts silently when muted.
    miniQuestTimer = setInterval(() => {
      if (questGuiding()) return
      const now = Date.now()
      if (now - lastMiniQuestAt < MINI_QUEST_MS) return
      const voiceHumanAt = (bot as { mapleHumanChatAt?: number }).mapleHumanChatAt ?? 0
      const humanAt = Math.max(lastHumanChatAt, voiceHumanAt)
      if (humanAt > 0 && now - humanAt < 8_000) return
      if (now - lastChatAt < 12_000) return
      const kid = primaryHuman()
      const hint = perception?.situateHint() ?? {}
      lastMiniQuestAt = now
      // Spark muted: still wander/look playfully without chat.
      if (config.persona === 'spark' && !partyIdleChatEnabled()) {
        const peer = peerOnline()
        const roll = Math.random()
        if (roll < 0.4 && kid) void softIdleMove(bot, { comeName: kid }).catch(() => {})
        else if (roll < 0.7 && peer) void softIdleMove(bot, { comeName: peer }).catch(() => {})
        else void softIdleMove(bot, { wander: true }).catch(() => {})
        console.log(`[${tag}] silent play move (spark muted)`)
        return
      }
      const line = proposeMiniQuest(config.persona, kid, hint, recentQuestLines)
      lastChatAt = now
      console.log(`[${tag}] mini-quest -> ${kid ?? '(no kid)'}`)
      void queue.send(toChatLines(line, config.chatMaxLineChars, 1), (text) => chatOut(bot, config, text))
      if (kid && Math.random() < 0.55) {
        void softIdleMove(bot, { comeName: kid }).catch(() => {})
      } else {
        void softIdleMove(bot, { wander: true }).catch(() => {})
      }
    }, 8_000)

    // Situate awareness chat: blocks/mobs/time/what kid did — Maple mostly; Spark rare if unmuted.
    situateTimer = setInterval(() => {
      if (!perception) return
      if (questGuiding()) return
      const now = Date.now()
      if (now - lastSituateChatAt < SITUATE_CHAT_MS) return
      const voiceHumanAt = (bot as { mapleHumanChatAt?: number }).mapleHumanChatAt ?? 0
      if (Math.max(lastHumanChatAt, voiceHumanAt) > 0 && now - Math.max(lastHumanChatAt, voiceHumanAt) < 6_000) return
      if (config.persona === 'spark' && !partyIdleChatEnabled()) return
      const kid = primaryHuman()
      const hint = perception.situateHint()
      const mem = perception.shortMemorySummary()
      if (mem) hint.kidLastSaid = hint.kidLastSaid ?? mem.split(' | ').pop()?.replace(/^\d+\.\s*/, '') ?? null
      const line = situateComment(config.persona, kid, hint, recentSituateLines)
      if (!line) return
      // Prefer situate over another dig env spam if we have fresh world bits.
      if (!hint.nearbyBlock && !hint.nearbyMob && !hint.kidLastDid && !hint.kidLastSaid && hint.time !== 'night') return
      lastSituateChatAt = now
      lastChatAt = now
      console.log(`[${tag}] situate chat`)
      void queue.send(toChatLines(line, config.chatMaxLineChars, 1), (text) => chatOut(bot, config, text))
    }, 7_000)
  })

  bot.on('playerJoined', (player) => {
    const username = player?.username
    if (!username) return
    if (isCompanionUsername(username)) {
      setTimeout(maybeInvitePeer, 2_000)
      return
    }
    digStone?.noteHuman(username)
    setTimeout(() => invitePlayer(username, true), 1_500)
  })

  bot.on('path_reset', (reason) => {
    if (reason !== 'stuck') return
    if (questGuiding()) {
      console.log(`[${tag}] digstone path stuck; Maple keeps leading`)
      return
    }
    const now = Date.now()
    if (now - lastStuck < 20_000) return
    lastStuck = now
    void queue.send([STUCK_LINE], (line) => chatOut(bot, config, line))
  })

  bot.on('kicked', (reason) => {
    console.error(`[${tag}] Kicked: ${reason}`)
  })
  bot.on('error', (error) => {
    console.error(`[${tag}] ${error.message}`)
  })

  const accept = (username: string, text: string, whispered: boolean) => {
    if (username.toLowerCase() === bot.username.toLowerCase()) return
    const peer = isCompanionUsername(username)
    if (peer) {
      // Mute Spark↔Maple cross-talk when PARTY_IDLE_CHAT=0 (keep Maple GPT Live for the kid).
      if (!partyIdleChatEnabled() && config.persona === 'spark') {
        console.log(`[${tag}] peer ignore (spark muted): <${username}>`)
        return
      }
      const now = Date.now()
      if (!isPeerPlayChat(text, bot.username)) {
        console.log(`[${tag}] peer ignore (not play): <${username}> ${text.slice(0, 60)}`)
        return
      }
      if (!peerReplyAllowed({ lastPeerReplyAt, now })) {
        console.log(`[${tag}] peer rate-limit: <${username}>`)
        return
      }
      lastPeerReplyAt = now
    } else if (!playerAllowed(config, username)) {
      return
    }
    if (!recent.firstTime(username, text, Date.now())) return
    lastChatAt = Date.now()
    if (digStone?.guiding()) {
      if (peer) {
        console.log(`[${tag}] digstone ignore peer <${username}>`)
        return
      }
      lastHumanChatAt = lastChatAt
      if (digStone.noteChat(text)) {
        console.log(`[${tag}] digstone name <${username}> ${text}`)
        return
      }
      const line = digStone.stepLine()
      console.log(`[${tag}] digstone hold; chat does not advance <${username}> ${text}`)
      if (line) {
        void queue.send(toChatLines(line, config.chatMaxLineChars, 1), (textLine) => chatOut(bot, config, textLine))
      }
      return
    }
    if (!peer) {
      lastHumanChatAt = lastChatAt
      perception?.rememberKidSaid(text)
    }
    // Honor "stay / stop / don't follow" so keep-follow does not immediately re-chase.
    if (/\b(stop following|wait here|stay here|stay there|stand still|do not follow|don't follow)\b|^stop\b|!stop\b|!wait\b|!stay\b/i.test(text)) {
      holdStillUntil = Date.now() + HOLD_STILL_MS
      ;(bot as { mapleHoldStillUntil?: number }).mapleHoldStillUntil = holdStillUntil
    } else if (/\b(follow me|come here|come with me|lead the way|can you move|move around|help me|dig with me|build with me|build a house|let'?s build a house|give me)\b/i.test(text)) {
      holdStillUntil = 0
      ;(bot as { mapleHoldStillUntil?: number }).mapleHoldStillUntil = 0
    }
    chain = chain
      .then(() =>
        handleMessage(bot, config, state, limiter, queue, username, text, whispered, perception, peer),
      )
      .catch((error: unknown) => {
        console.error(`[${tag}] ${error instanceof Error ? error.message : String(error)}`)
      })
  }

  bot.on('messagestr', (message, position) => {
    if (position !== 'chat') return
    const spoken = parsePublicChat(message)
    if (!spoken) return
    accept(spoken.username, spoken.text, false)
  })
  bot.on('whisper', (username, message) => {
    accept(username, message, true)
  })

  await ready
  return {
    bot,
    stop: () => {
      if (nudgeTimer) clearInterval(nudgeTimer)
      nudgeTimer = null
      if (envTimer) clearInterval(envTimer)
      envTimer = null
      if (bodyRescueTimer) clearInterval(bodyRescueTimer)
      bodyRescueTimer = null
      if (keepFollowTimer) clearInterval(keepFollowTimer)
      keepFollowTimer = null
      if (partyChatTimer) clearInterval(partyChatTimer)
      partyChatTimer = null
      if (idleMoveTimer) clearInterval(idleMoveTimer)
      idleMoveTimer = null
      if (miniQuestTimer) clearInterval(miniQuestTimer)
      miniQuestTimer = null
      if (situateTimer) clearInterval(situateTimer)
      situateTimer = null
      if (digStoneArmTimer) clearTimeout(digStoneArmTimer)
      digStoneArmTimer = null
      digStone?.stop()
      digStone = null
      perception?.stop()
      perception = null
      bot.quit()
    },
  }
}

export function createCompanionBot(config: AppConfig): Bot {
  const bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    auth: config.auth,
    ...(config.version ? { version: config.version } : {}),
    profilesFolder: config.profilesFolder,
    hideErrors: false,
    onMsaCode: (data) => {
      console.log(`[${logTag(config)}] Sign in with Microsoft: ${data.verification_uri}`)
      console.log(`[${logTag(config)}] Code: ${data.user_code}`)
    },
  })
  bot.loadPlugin(pathfinder)
  return bot
}

async function handleMessage(
  bot: Bot,
  config: AppConfig,
  session: Session,
  limiter: TurnLimiter,
  queue: SendQueue,
  username: string,
  text: string,
  whispered: boolean,
  perception: PerceptionHandle | null,
  fromPeer: boolean,
): Promise<void> {
  const tag = logTag(config)
  const decision = limiter.take(username, Date.now())
  if (decision === 'mute' || decision === 'busy') {
    console.log(`[${tag}] Ignored ${username} (${decision})`)
    return
  }
  if (decision === 'slow') {
    if (fromPeer) return
    await deliver(bot, config, queue, username, whispered, [SLOW_LINE])
    return
  }

  console.log(`[${tag}] <${username}${fromPeer ? ' peer' : ''}> ${text}`)
  const intents = parseIntents(text)
  // Peer play invites: walk toward the kid (preferred) or the peer — avoid burying with peer.
  const peerMove =
    fromPeer && intents.some((i) => i.type === 'follow' || i.type === 'come')
      ? intents.filter((i) => i.type === 'follow' || i.type === 'come')
      : fromPeer && /\b(race|dig|bridge|come|follow|together)\b/i.test(text)
        ? ([{ type: 'come' }] as const)
        : []
  const walkTarget =
    fromPeer && peerMove.length > 0 ? (perception?.nearestHuman() ?? username) : username
  const notes =
    text.startsWith('/')
      ? []
      : await performIntents(
          bot,
          walkTarget,
          peerMove.length > 0 ? [...peerMove] : fromPeer ? [] : intents,
        )
  const observations = perception?.recentNotes() ?? []
  if (fromPeer) {
    const humans = Object.keys(bot.players).filter(
      (name) => name.toLowerCase() !== bot.username.toLowerCase() && !isCompanionUsername(name),
    )
    const buddy =
      perception?.nearestHuman() ??
      humans.find((name) => bot.players[name]?.entity) ??
      humans[0] ??
      null
    if (buddy) {
      observations.push(
        `Human buddy nearby: ${buddy}. Always call them ${buddy} by name. Invite them to play together.`,
      )
    }
  }
  const world = snapshotWorld(bot, username, notes, observations)
  const turn = await completeTurn({
    config,
    session,
    username,
    text: fromPeer ? `[peer ${username}] ${text}` : text,
    world,
    intents: fromPeer ? (peerMove.length > 0 ? [...peerMove] : [{ type: 'chat' }]) : intents,
    log: (message) => console.error(`[${tag}] ${message}`),
  })
  console.log(`[${tag}] ${turn.source}: ${turn.reply}`)
  await deliver(bot, config, queue, username, whispered, turn.lines)
}

async function deliver(
  bot: Bot,
  config: AppConfig,
  queue: SendQueue,
  username: string,
  whispered: boolean,
  lines: string[],
): Promise<void> {
  const whisper = whispered || config.chatMode === 'whisper'
  await queue.send(lines, (line) => {
    if (whisper) bot.whisper(username, line)
    else chatOut(bot, config, line)
  })
}

export async function main(): Promise<void> {
  const { loadConfig } = await import('../config.js')
  const config = loadConfig()
  const tag = logTag(config)
  const tutor = config.openaiApiKey
    ? `OpenAI (${config.openaiModel})`
    : config.anthropicApiKey
      ? `Claude (${config.anthropicModel}, effort=${config.anthropicEffort})`
      : 'local practice tutor (set OPENAI_API_KEY to use OpenAI)'
  console.log(`[${tag}] ${config.username} -> ${config.host}:${config.port} auth=${config.auth} version=${config.versionLabel} persona=${config.persona}`)
  if (digStoneQuestArmed(config.persona)) {
    console.log(`[${tag}] DIG_STONE_QUEST on. Gated dig-three-stones tutorial. See docs/dig-stone-quest.md`)
  } else if (digStoneQuestEnabled() && config.persona !== 'maple') {
    console.log(`[${tag}] DIG_STONE_QUEST is set, but this quest runs for Maple only.`)
  }
  console.log(`[${tag}] English ${config.difficulty}. Tutor: ${tutor}`)
  if (config.playerAllowlist.length > 0) {
    console.log(`[${tag}] Answering only: ${config.playerAllowlist.join(', ')}`)
  }

  const session = createSession(config.difficulty, config.historyTurns)
  let shuttingDown = false
  let current: Bot | null = null
  const companion = voiceCompanionEnabled()
    ? await startJavaVoiceCompanion({ config, getBot: () => current })
    : null
  const voice = loadVoiceConfig()
  const liveFlag = (process.env.OPENAI_LIVE ?? '').trim().toLowerCase()
  const gptLive =
    !['0', 'false', 'no', 'off'].includes(liveFlag) && Boolean(process.env.OPENAI_API_KEY?.trim())
  console.log(
    gptLive
      ? `[${tag}] GPT Live voice is on (OpenAI Realtime WebRTC). Doubao kept as fallback when OPENAI_LIVE=0.`
      : voice.enabled
        ? `[${tag}] Doubao voice is on. Keys stay in this process.`
        : `[${tag}] Voice off. Set OPENAI_LIVE=1 + OPENAI_API_KEY, or DOUBAO_APP_ID/ACCESS_KEY. In-game chat still works.`,
  )
  if (companion?.url) {
    console.log(`[${tag}] Open the mic window on this computer: ${companion.url}`)
    console.log(`[${tag}] That page is the microphone beside Java Minecraft. It is not the browser voxel island.`)
  }
  if (!voiceCompanionEnabled()) {
    console.log(`[${tag}] VOICE_COMPANION off — in-game chat + movement only.`)
  }

  const shutdown = () => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`\n[${tag}] Leaving the world.`)
    current?.quit()
    void companion?.close()
    setTimeout(() => process.exit(0), 400)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  let tries = 0
  while (!shuttingDown) {
    let handle: CompanionHandle | null = null
    try {
      const handleNext = await startCompanion(config, session)
      handle = handleNext
      current = handleNext.bot
      tries = 0
      await new Promise<void>((resolve, reject) => {
        handleNext.bot.once('end', (reason) => {
          if (shuttingDown) resolve()
          else reject(new Error(reason || 'disconnected'))
        })
      })
    } catch (error) {
      if (shuttingDown) {
        handle?.stop()
        return
      }
      console.error(`[${tag}] ${error instanceof Error ? error.message : String(error)}`)
    }
    // Always clear timers from this session before reconnecting (fixes zombie peer-invite spam).
    handle?.stop()
    if (!shuttingDown) current = null
    if (shuttingDown) return
    tries += 1
    if (tries > config.reconnects) {
      console.error(`[${tag}] Gave up reconnecting.`)
      process.exitCode = 1
      return
    }
    const wait = Math.min(15_000, 2_000 * tries)
    console.log(`[${tag}] Reconnecting in ${wait} ms (${tries}/${config.reconnects})`)
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
}
