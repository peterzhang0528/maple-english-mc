import mineflayer from 'mineflayer'
import type { Bot } from 'mineflayer'
import { Movements, pathfinder } from '../pathfinder.js'
import { playerAllowed, type AppConfig } from '../config.js'
import { performIntents } from '../behavior/actions.js'
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
import {
  isCompanionUsername,
  peerPlayInvite,
  proactiveInvite,
  quietNudge,
  spawnGreeting,
} from '../chat/persona.js'

export interface CompanionHandle {
  bot: Bot
  stop: () => void
}

const SLOW_LINE = 'Please wait a moment. In English we can say: Let us speak a little slower.'
const STUCK_LINE = 'I am stuck. Please walk closer so I can follow you.'
const NUDGE_MS = 50_000
const PROACTIVE_FOLLOW_DELAY_MS = 1_200
const PEER_INVITE_MS = 120_000
const ENV_COMMENT_POLL_MS = 4_000

function logTag(config: AppConfig): string {
  return config.persona === 'spark' ? 'spark' : 'maple'
}

export async function startCompanion(config: AppConfig, session?: Session): Promise<CompanionHandle> {
  const tag = logTag(config)
  const state = session ?? createSession(config.difficulty, config.historyTurns)
  const bot = createCompanionBot(config)
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
  let perception: PerceptionHandle | null = null

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
    const line = proactiveInvite(config.persona, username)
    console.log(`[${tag}] proactive invite -> ${username}`)
    void queue.send(toChatLines(line, config.chatMaxLineChars, config.chatMaxLines), (text) => bot.chat(text))
    if (follow) {
      setTimeout(() => {
        void performIntents(bot, username, [{ type: 'come' }]).catch((error: unknown) => {
          console.error(`[${tag}] proactive walk: ${error instanceof Error ? error.message : String(error)}`)
        })
      }, PROACTIVE_FOLLOW_DELAY_MS)
    }
  }

  const maybeInvitePeer = () => {
    const now = Date.now()
    if (now - lastPeerInviteAt < PEER_INVITE_MS) return
    const peers = Object.keys(bot.players).filter(
      (name) => name.toLowerCase() !== bot.username.toLowerCase() && isCompanionUsername(name),
    )
    if (peers.length === 0) return
    // Prefer inviting peer when a human is around so banter includes the kid.
    const peer = peers[0]!
    const kid = primaryHuman()
    lastPeerInviteAt = now
    lastChatAt = now
    const line = peerPlayInvite(config.persona, peer, kid)
    console.log(`[${tag}] peer invite -> ${peer}${kid ? ` (+${kid})` : ''}`)
    void queue.send(toChatLines(line, config.chatMaxLineChars, 1), (text) => bot.chat(text))
  }

  bot.once('spawn', () => {
    const movements = new Movements(bot)
    movements.canDig = false
    movements.allow1by1towers = false
    movements.scafoldingBlocks = []
    bot.pathfinder.setMovements(movements)
    console.log(`[${tag}] Spawned in ${bot.game.dimension} as ${bot.username} (${bot.version}) persona=${config.persona}`)
    if (config.greet && !greeted) {
      greeted = true
      const hello = spawnGreeting(config.persona, state.difficulty)
      void queue.send(toChatLines(hello, config.chatMaxLineChars, config.chatMaxLines), (line) => bot.chat(line))
      lastChatAt = Date.now()
    }

    perception = attachPerception(bot, {
      persona: config.persona,
      onEvent: (event) => {
        console.log(`[${tag}] noticed: ${event.text}`)
      },
    })

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
      const now = Date.now()
      if (now - lastChatAt < NUDGE_MS) return
      if (now - lastNudgeAt < NUDGE_MS) return
      const buddy = primaryHuman()
      if (!buddy) {
        maybeInvitePeer()
        return
      }
      lastNudgeAt = now
      lastChatAt = now
      const line = quietNudge(config.persona, buddy)
      console.log(`[${tag}] quiet nudge -> ${buddy}`)
      void queue.send(toChatLines(line, config.chatMaxLineChars, 1), (text) => bot.chat(text))
    }, 10_000)

    envTimer = setInterval(() => {
      if (!perception) return
      const line = perception.takeComment()
      if (!line) return
      lastChatAt = Date.now()
      console.log(`[${tag}] env comment`)
      void queue.send(toChatLines(line, config.chatMaxLineChars, 1), (text) => bot.chat(text))
      const target = perception.nearestPlayTarget()
      if (target && Math.random() < 0.45) {
        void performIntents(bot, target, [{ type: 'come' }]).catch((error: unknown) => {
          console.error(`[${tag}] env walk: ${error instanceof Error ? error.message : String(error)}`)
        })
      }
    }, ENV_COMMENT_POLL_MS)
  })

  bot.on('playerJoined', (player) => {
    const username = player?.username
    if (!username) return
    if (isCompanionUsername(username)) {
      setTimeout(maybeInvitePeer, 2_000)
      return
    }
    setTimeout(() => invitePlayer(username, true), 1_500)
  })

  bot.on('path_reset', (reason) => {
    if (reason !== 'stuck') return
    const now = Date.now()
    if (now - lastStuck < 20_000) return
    lastStuck = now
    void queue.send([STUCK_LINE], (line) => bot.chat(line))
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
  // Peer play invites: walk toward peer when they say follow/come/race/dig.
  const peerMove =
    fromPeer && intents.some((i) => i.type === 'follow' || i.type === 'come')
      ? intents.filter((i) => i.type === 'follow' || i.type === 'come')
      : fromPeer && /\b(race|dig|bridge|come|follow|together)\b/i.test(text)
        ? ([{ type: 'come' }] as const)
        : []
  const notes =
    text.startsWith('/')
      ? []
      : await performIntents(
          bot,
          username,
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
    intents: fromPeer && peerMove.length === 0 ? [{ type: 'chat' }] : intents,
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
    else bot.chat(line)
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
  console.log(
    voice.enabled
      ? `[${tag}] Doubao voice is on. Keys stay in this process.`
      : `[${tag}] Voice off. Set DOUBAO_APP_ID and DOUBAO_ACCESS_KEY. In-game chat still works.`,
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
    try {
      const handle = await startCompanion(config, session)
      current = handle.bot
      tries = 0
      await new Promise<void>((resolve, reject) => {
        handle.bot.once('end', (reason) => {
          if (shuttingDown) resolve()
          else reject(new Error(reason || 'disconnected'))
        })
      })
    } catch (error) {
      if (shuttingDown) return
      console.error(`[${tag}] ${error instanceof Error ? error.message : String(error)}`)
    }
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
