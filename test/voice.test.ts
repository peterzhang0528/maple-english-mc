import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import WebSocket from 'ws'
import { loadConfig } from '../src/config.js'
import {
  loadVoiceConfig,
  redactSecrets,
  voiceAuthHeaders,
} from '../src/voice/config.js'
import {
  buildAudioAppend,
  buildSessionCreate,
  buildToolResult,
  decodeLegacyFrame,
  encodeLegacyFrame,
  parseDuplexEvent,
  readFunctionCalls,
} from '../src/voice/protocol.js'
import { createVoiceRelay, type VoiceSocket } from '../src/voice/relay.js'
import { effectFromSpeech, effectFromToolCall } from '../src/voice/tools.js'
import { createWebServer } from '../src/web/server.js'

const tutorConfig = loadConfig({
  MC_USERNAME: 'Maple',
  MC_AUTH: 'offline',
  ANTHROPIC_API_KEY: '',
  ENGLISH_DIFFICULTY: 'beginner',
})

test('Doubao env names enable voice and stay out of the browser payload', () => {
  const config = loadVoiceConfig({
    DOUBAO_APP_ID: '3496507434',
    DOUBAO_ACCESS_KEY: 'access-secret-value',
    DOUBAO_SECRET_KEY: 'secret-key-value',
  })
  assert.equal(config.enabled, true)
  assert.equal(config.resourceId, 'volc.speech.dialog')
  assert.equal(config.endpoint.endsWith('/api/v3/duplex/realtime/dialogue'), true)
  const headers = voiceAuthHeaders(config, 'connect-1')
  assert.equal(headers['X-Api-App-ID'], '3496507434')
  assert.equal(headers['X-Api-Access-Key'], 'access-secret-value')
  assert.equal(headers['X-Api-Key'], 'secret-key-value')
  assert.equal(headers['X-Api-Resource-Id'], 'volc.speech.dialog')
  assert.equal(headers['X-Api-App-Key'], 'PlgvMymc7f3tQnJ6')

  const session = JSON.stringify(buildSessionCreate(config))
  assert.equal(session.includes('access-secret-value'), false)
  assert.equal(session.includes('secret-key-value'), false)
  assert.match(session, /session\.create/)
  assert.match(session, /1\.2\.6\.1/)
  assert.match(session, /maple_action/)
  assert.equal(loadVoiceConfig({}).enabled, false)
  assert.equal(loadVoiceConfig({ VOLC_APP_ID: '1', VOLC_ACCESS_KEY: 'token-value' }).enabled, true)
  assert.equal(redactSecrets('token-value failed', ['token-value']), '[redacted] failed')
})

test('duplex audio and tool frames round-trip', () => {
  const pcm = Buffer.from([1, 2, 3, 4])
  const audio = buildAudioAppend(pcm)
  assert.equal(audio.type, 'input_audio_buffer.append')
  assert.equal(audio.audio, pcm.toString('base64'))
  const tool = buildToolResult('call-1', 'I am following friend.')
  const items = tool.items as Array<{ call_id: string; role: string }>
  assert.equal(items[0]?.call_id, 'call-1')
  assert.equal(items[0]?.role, 'tool')
  const event = parseDuplexEvent(
    JSON.stringify({
      type: 'response.function_call_arguments.done',
      items: [{ call_id: 'call-9', name: 'maple_action', arguments: '{"action":"follow"}' }],
    }),
  )
  assert.equal(event?.type, 'response.function_call_arguments.done')
  assert.equal(readFunctionCalls(event?.raw ?? {})[0]?.name, 'maple_action')
})

test('legacy binary frames keep the event id and session id', () => {
  const payload = Buffer.from(JSON.stringify({ content: 'Hi' }))
  const frame = encodeLegacyFrame({ eventId: 100, sessionId: 'maple-session', payload })
  const decoded = decodeLegacyFrame(frame)
  assert.equal(decoded?.eventId, 100)
  assert.equal(decoded?.sessionId, 'maple-session')
  assert.equal(decoded?.payload.toString('utf8'), payload.toString('utf8'))
  const audio = encodeLegacyFrame({ eventId: 200, sessionId: 'maple-session', payload: Buffer.from([0, 1, 2, 3]), audio: true })
  const audioFrame = decodeLegacyFrame(audio)
  assert.equal(audioFrame?.eventId, 200)
  assert.equal(audioFrame?.audio, true)
  assert.deepEqual(Array.from(audioFrame?.payload ?? []), [0, 1, 2, 3])
})

test('spoken follow, block, and craft intents use the same Maple actions', () => {
  const world = { lookingAt: 'oak_log', difficulty: 'beginner' as const }
  assert.equal(effectFromSpeech('follow me', world)?.action, 'follow')
  assert.match(effectFromSpeech('what is this block?', world)?.note ?? '', /oak log/i)
  const craft = effectFromToolCall('maple_action', '{"action":"craft","item":"wooden pickaxe"}', world)
  assert.match(craft.output, /Oak Planks/)
  assert.match(craft.output, /Stick/)
  assert.equal(craft.chat, true)
})

test('a duplex tool call moves Maple without leaking the access key', () => {
  const voice = loadVoiceConfig({
    DOUBAO_APP_ID: '3496507434',
    DOUBAO_ACCESS_KEY: 'access-secret-value',
  })
  const sent: Array<string | Buffer> = []
  const client: Record<string, unknown>[] = []
  const listeners: { message: Array<(data: Buffer | string) => void>; close: Array<() => void>; error: Array<(error: Error) => void> } = {
    message: [],
    close: [],
    error: [],
  }
  const upstream = {
    readyState: 1,
    send(data: string | Buffer) {
      sent.push(data)
    },
    close() {
      this.readyState = 3
      for (const listener of listeners.close) listener()
    },
    on(event: 'message' | 'close' | 'error', listener: (value?: unknown) => void) {
      if (event === 'message') listeners.message.push(listener as (data: Buffer | string) => void)
      else if (event === 'close') listeners.close.push(listener as () => void)
      else listeners.error.push(listener as (error: Error) => void)
    },
  } as VoiceSocket
  const relay = createVoiceRelay({
    voice,
    protocol: 'duplex',
    upstream,
    sendClient: (message) => client.push(message),
  })
  relay.start()
  const created = JSON.parse(String(sent[0])) as { type: string }
  assert.equal(created.type, 'session.create')
  assert.equal(JSON.stringify(sent).includes('access-secret-value'), false)

  for (const listener of listeners.message) {
    listener(Buffer.from(JSON.stringify({ type: 'session.created', session: { id: 'dlg-1' } })))
  }
  assert.equal(client.some((message) => message.type === 'ready'), true)

  relay.handleBrowser({ type: 'context', lookingAt: 'oak_log' })
  relay.handleBrowser({ type: 'audio', pcm: Buffer.from([0, 1, 0, 1]).toString('base64') })
  const appended = JSON.parse(String(sent.at(-1))) as { type: string }
  assert.equal(appended.type, 'input_audio_buffer.append')

  for (const listener of listeners.message) {
    listener(
      Buffer.from(
        JSON.stringify({
          type: 'response.function_call_arguments.done',
          items: [{ call_id: 'call-1', name: 'maple_action', arguments: '{"action":"follow"}' }],
        }),
      ),
    )
  }
  const action = client.find((message) => message.type === 'action' && message.action === 'follow')
  assert.ok(action)
  assert.deepEqual(action?.intents, [{ type: 'follow' }])
  const result = sent.map(String).find((line) => line.includes('conversation.item.create'))
  assert.match(result ?? '', /"role":"tool"/)
  assert.equal((result ?? '').includes('access-secret-value'), false)
  relay.close()
})

test('health and the voice socket hide keys and keep text chat available', async () => {
  const voice = loadVoiceConfig({
    DOUBAO_APP_ID: '3496507434',
    DOUBAO_ACCESS_KEY: 'access-secret-value',
    DOUBAO_SECRET_KEY: 'secret-key-value',
  })
  await withServer({ config: tutorConfig, voice, connectUpstream: async () => { throw new Error('do not dial') } }, async (base) => {
    const health = await (await fetch(`${base}/api/health`)).text()
    assert.match(health, /"voice":"doubao"/)
    assert.equal(health.includes('access-secret-value'), false)
    assert.equal(health.includes('secret-key-value'), false)
    const chat = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello! I want go mining.' }),
    })
    assert.equal(chat.status, 200)
    assert.match((await chat.json()).reply, /I want to go mining/)
  })

  await withServer({ config: tutorConfig, voice: loadVoiceConfig({}) }, async (base) => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/api/voice')
    const raw = await new Promise<string>((resolve, reject) => {
      ws.once('message', (data) => resolve(String(data)))
      ws.once('error', reject)
    })
    assert.match(raw, /"voice":"off"/)
    assert.equal(raw.includes('access-secret-value'), false)
    ws.close()
  })
})

async function withServer(
  options: Parameters<typeof createWebServer>[0],
  run: (base: string) => Promise<void>,
): Promise<void> {
  const server = createWebServer(options)
  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve())
    server.on('error', reject)
  })
  const address = server.address() as AddressInfo
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
