const START = 'Start talking · 开始说话'
const STOP = 'Stop · 停止'
const CONNECTING = 'Connecting · 正在连接'
const PLAYER_KEY = 'maple.java.player'

const talkButton = document.getElementById('talk')
const statusLine = document.getElementById('status')
const botStatus = document.getElementById('bot-status')
const playersLine = document.getElementById('players')
const playerInput = document.getElementById('player')
const log = document.getElementById('log')
let speaker = null

let ws = null
let live = false
let ready = false
let capture = null
/** @type {'off'|'doubao'|'gpt-live'} */
let voiceMode = 'off'

/** GPT Live WebRTC state */
let peer = null
let eventsChannel = null
let microphone = null
let remoteAudio = null
let closeTimeout = null
let liveFinalized = false
let userBuf = ''
let mapleBuf = ''
let userFlushTimer = 0
let mapleFlushTimer = 0
let partyAfter = 0
let partySpeaking = false

playerInput.value = localStorage.getItem(PLAYER_KEY) || ''
playerInput.addEventListener('input', () => {
  localStorage.setItem(PLAYER_KEY, playerInput.value.trim())
  void publishPlayer()
})
talkButton.addEventListener('click', () => {
  if (live) void shutdown()
  else void begin()
})

void refresh()
setInterval(() => {
  void refresh()
}, 2000)
setInterval(() => {
  void pollPartySay()
}, 900)
if (playerInput.value.trim()) void publishPlayer()

async function refresh() {
  try {
    const health = await (await fetch('/api/health')).json()
    const raw = String(health.voice || 'off')
    if (raw === 'gpt-live' || raw === 'openai' || raw === 'openai-live') voiceMode = 'gpt-live'
    else if (raw === 'doubao') voiceMode = 'doubao'
    else voiceMode = 'off'
    const where = health.server ? ` Join Java at ${health.server}.` : ''
    if (health.bot === 'online') {
      botStatus.textContent = `${health.botName || 'Maple'} is in the Java world.${where}`
    } else {
      botStatus.textContent = `Maple has not joined the Java server yet.${where}`
    }
    const names = Array.isArray(health.players) ? health.players : []
    playersLine.textContent = names.length
      ? `In this world: ${names.join(', ')}`
      : 'No other player is in the world yet.'
    if (!live && voiceMode === 'off') {
      statusLine.textContent = 'Voice keys are not set. Talk in Minecraft chat. 未配置语音密钥时，请在游戏里打字。'
    } else if (!live && voiceMode === 'gpt-live') {
      statusLine.textContent = health.partyTts ? 'Ready: Maple GPT Live + Spark party TTS. Press start. Maple 语音 + Spark 朗读已就绪。' : 'Ready: Maple GPT Live (Spark muted). Press start. Maple 语音；Spark 静音开黑。'
    } else if (!live && voiceMode === 'doubao') {
      statusLine.textContent = 'Ready: Doubao voice. Press start to talk. 豆包语音已就绪，点开始说话。'
    }
  } catch {
    botStatus.textContent = 'The mic page cannot reach Maple. Is npm start still running?'
  }
}

async function publishPlayer() {
  try {
    const response = await fetch('/api/player', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: playerInput.value.trim() }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      statusLine.textContent = body.error || 'That Minecraft name is not valid.'
    }
  } catch {
    statusLine.textContent = 'Could not save your Minecraft name.'
  }
}

async function begin() {
  if (voiceMode === 'off') {
    statusLine.textContent = 'Voice keys are not set. Talk in Minecraft chat. 未配置语音密钥时，请在游戏里打字。'
    return
  }
  live = true
  ready = false
  talkButton.disabled = true
  talkButton.textContent = CONNECTING
  talkButton.setAttribute('aria-pressed', 'true')
  await publishPlayer()
  if (voiceMode === 'gpt-live') {
    await beginGptLive()
    return
  }
  await beginDoubao()
}

async function beginGptLive() {
  liveFinalized = false
  userBuf = ''
  mapleBuf = ''
  try {
    const connection = new RTCPeerConnection()
    peer = connection
    remoteAudio = new Audio()
    remoteAudio.autoplay = true
    connection.addEventListener('track', (event) => {
      remoteAudio.srcObject = new MediaStream([event.track])
      remoteAudio.play().catch(() => {
        statusLine.textContent = 'Click the page once if you cannot hear Maple. 听不见时请点一下页面。'
      })
    })

    microphone = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })
    for (const track of microphone.getAudioTracks()) {
      connection.addTrack(track, microphone)
    }

    eventsChannel = connection.createDataChannel('oai-events')
    eventsChannel.addEventListener('message', ({ data }) => {
      handleLiveEvent(String(data))
    })
    eventsChannel.addEventListener('close', (event) => {
      if (event.target !== eventsChannel) return
      if (!liveFinalized && live) {
        statusLine.textContent = 'GPT Live disconnected. You can start again. 连接已断开，可以重新开始。'
        void shutdown(false)
      }
    })

    const offer = await connection.createOffer()
    await connection.setLocalDescription(offer)
    if (connection.iceGatheringState !== 'complete') {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          connection.removeEventListener('icegatheringstatechange', onState)
          reject(new Error('Timed out while gathering ICE candidates'))
        }, 10_000)
        function onState() {
          if (connection.iceGatheringState !== 'complete') return
          clearTimeout(timeout)
          connection.removeEventListener('icegatheringstatechange', onState)
          resolve(undefined)
        }
        connection.addEventListener('icegatheringstatechange', onState)
        onState()
      })
    }

    const sdp = connection.localDescription && connection.localDescription.sdp
    if (!sdp) throw new Error('Missing local SDP offer')
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sdp }),
    })
    const raw = await response.text()
    let result
    try {
      result = JSON.parse(raw)
    } catch {
      throw new Error(raw.slice(0, 200) || `GPT Live HTTP ${response.status}`)
    }
    if (!response.ok) {
      throw new Error((result && result.error) || raw.slice(0, 200) || `GPT Live HTTP ${response.status}`)
    }
    const answerSdp = result && result.transport && result.transport.sdp
    if (!answerSdp) throw new Error('GPT Live response missing transport.sdp')
    await connection.setRemoteDescription({ type: 'answer', sdp: answerSdp })
    statusLine.textContent = 'Waiting for GPT Live session… 正在等待 GPT Live…'
  } catch (error) {
    live = false
    talkButton.disabled = false
    talkButton.textContent = START
    talkButton.setAttribute('aria-pressed', 'false')
    statusLine.textContent = error instanceof Error ? error.message : String(error)
    cleanupGptLive()
  }
}

function handleLiveEvent(raw) {
  let event
  try {
    event = JSON.parse(raw)
  } catch {
    return
  }
  if (event.type === 'session.started') {
    ready = true
    talkButton.disabled = false
    talkButton.textContent = STOP
    statusLine.textContent = 'Maple is listening (GPT Live). Speak English. Maple 在听，请说英语。'
    return
  }
  if (event.type === 'session.closed') {
    liveFinalized = true
    statusLine.textContent = 'Voice stopped. You can start again. 语音已停止，可以重新开始。'
    void shutdown(false)
    return
  }
  if (event.type === 'session.input_transcript.delta' && typeof event.delta === 'string') {
    userBuf += event.delta
    statusLine.textContent = userBuf
    window.clearTimeout(userFlushTimer)
    userFlushTimer = window.setTimeout(() => flushTranscript('user'), 1200)
    return
  }
  if (event.type === 'session.output_transcript.delta' && typeof event.delta === 'string') {
    mapleBuf += event.delta
    statusLine.textContent = mapleBuf
    window.clearTimeout(mapleFlushTimer)
    mapleFlushTimer = window.setTimeout(() => flushTranscript('maple'), 1200)
    return
  }
  if (event.type === 'error') {
    const message =
      (event.error && (event.error.message || event.error.code)) ||
      (typeof event.message === 'string' ? event.message : 'GPT Live error')
    statusLine.textContent = String(message)
  }
}

function flushTranscript(who) {
  if (who === 'user') {
    const text = userBuf.replace(/\s+/g, ' ').trim()
    userBuf = ''
    if (!text) return
    addLine('You', text)
    void postLiveEvent({ type: 'user_text', text, final: true })
    return
  }
  const text = mapleBuf.replace(/\s+/g, ' ').trim()
  mapleBuf = ''
  if (!text) return
  addLine('Maple', text)
  void postLiveEvent({ type: 'maple_text', text, final: true })
}

async function postLiveEvent(message) {
  try {
    await fetch('/api/live-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })
  } catch {
    /* Minecraft mirror is best-effort */
  }
}

async function beginDoubao() {
  try {
    capture = await openMic((pcm) => {
      if (!ws || ws.readyState !== WebSocket.OPEN || !ready) return
      ws.send(JSON.stringify({ type: 'audio', pcm: base64FromBytes(pcm) }))
    })
  } catch {
    live = false
    talkButton.disabled = false
    talkButton.textContent = START
    talkButton.setAttribute('aria-pressed', 'false')
    statusLine.textContent = 'Microphone permission is needed. 需要允许麦克风。'
    return
  }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//${location.host}/api/voice`)
  ws.addEventListener('message', (event) => {
    handle(String(event.data))
  })
  ws.addEventListener('close', () => {
    if (!live) return
    void shutdown(false)
    statusLine.textContent = 'Voice stopped. You can start again. 语音已停止，可以重新开始。'
  })
  ws.addEventListener('error', () => {
    statusLine.textContent = 'Voice connection failed. 语音连接失败。'
  })
}

function handle(raw) {
  let message
  try {
    message = JSON.parse(raw)
  } catch {
    return
  }
  if (message.type === 'status' && message.voice === 'off') {
    statusLine.textContent = message.reason || 'Voice is off. Talk in Minecraft chat.'
    void shutdown(false)
    return
  }
  if (message.type === 'ready') {
    ready = true
    talkButton.disabled = false
    talkButton.textContent = STOP
    statusLine.textContent = 'Maple is listening. Speak English. Maple 在听，请说英语。'
    return
  }
  if (message.type === 'user_text' && typeof message.text === 'string') {
    if (message.final === true) addLine('You', message.text)
    else statusLine.textContent = message.text
    return
  }
  if (message.type === 'maple_text' && typeof message.text === 'string') {
    if (message.final === true) addLine('Maple', message.text)
    else statusLine.textContent = message.text
    return
  }
  if (message.type === 'audio' && typeof message.pcm === 'string') {
    speaker.play(bytesFromBase64(message.pcm))
    return
  }
  if (message.type === 'clear_audio') {
    speaker.stop()
    return
  }
  if (message.type === 'error' && typeof message.message === 'string') statusLine.textContent = message.message
}

async function shutdown(tellServer = true) {
  live = false
  ready = false
  talkButton.disabled = false
  talkButton.textContent = START
  talkButton.setAttribute('aria-pressed', 'false')
  window.clearTimeout(userFlushTimer)
  window.clearTimeout(mapleFlushTimer)
  try {
    window.speechSynthesis && window.speechSynthesis.cancel()
  } catch {
    /* ignore */
  }
  partySpeaking = false
  if (userBuf.trim()) flushTranscript('user')
  if (mapleBuf.trim()) flushTranscript('maple')
  if (capture) capture.stop()
  capture = null
  speaker.stop()
  if (voiceMode === 'gpt-live') {
    if (tellServer && eventsChannel && eventsChannel.readyState === 'open' && !liveFinalized) {
      try {
        eventsChannel.send(JSON.stringify({ type: 'session.close' }))
      } catch {
        /* ignore */
      }
      clearTimeout(closeTimeout)
      closeTimeout = setTimeout(() => cleanupGptLive(), 1500)
      return
    }
    cleanupGptLive()
    return
  }
  if (tellServer && ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' }))
  if (ws) ws.close()
  ws = null
}

function cleanupGptLive() {
  clearTimeout(closeTimeout)
  if (microphone) {
    for (const track of microphone.getTracks()) track.stop()
  }
  microphone = null
  try {
    eventsChannel && eventsChannel.close()
  } catch {
    /* ignore */
  }
  eventsChannel = null
  try {
    peer && peer.close()
  } catch {
    /* ignore */
  }
  peer = null
  if (remoteAudio) {
    remoteAudio.srcObject = null
    remoteAudio = null
  }
}

async function pollPartySay() {
  try {
    const response = await fetch(`/api/party-say?after=${partyAfter}`)
    if (!response.ok) return
    const body = await response.json()
    const lines = Array.isArray(body.lines) ? body.lines : []
    for (const line of lines) {
      if (!line || typeof line.id !== 'number') continue
      if (line.id <= partyAfter) continue
      partyAfter = line.id
      const speaker = String(line.speaker || 'Spark')
      const text = String(line.text || '').replace(/\s+/g, ' ').trim()
      if (!text) continue
      // Maple GPT Live already plays Maple aloud — only speak Spark (and other peers) here.
      if (speaker.toLowerCase() === 'maple') {
        addLine(speaker, text)
        continue
      }
      addLine(speaker, text)
      speakPartyLine(speaker, text)
    }
  } catch {
    /* mic companion may restart */
  }
}

function speakPartyLine(speaker, text) {
  if (!window.speechSynthesis) return
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'en-US'
  utter.rate = speaker.toLowerCase() === 'spark' ? 1.08 : 1
  utter.pitch = speaker.toLowerCase() === 'spark' ? 1.25 : 1
  const voices = window.speechSynthesis.getVoices()
  const pick =
    voices.find((v) => /en(-|_)US/i.test(v.lang) && /female|samantha|karen|moira|google US English/i.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    null
  if (pick) utter.voice = pick
  utter.onstart = () => {
    partySpeaking = true
    statusLine.textContent = `${speaker}: ${text}`
  }
  utter.onend = () => {
    partySpeaking = false
  }
  // Soft queue: do not cancel Maple Live audio; browser mixes both.
  window.speechSynthesis.speak(utter)
}

function addLine(who, text) {
  const item = document.createElement('li')
  const name = document.createElement('strong')
  name.textContent = who
  item.append(name, document.createTextNode(` ${text}`))
  log.append(item)
}

function base64FromBytes(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] || 0)
  return btoa(binary)
}

function bytesFromBase64(pcm) {
  const binary = atob(pcm)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function openMic(onPcm) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  })
  const audio = new AudioContext()
  const source = audio.createMediaStreamSource(stream)
  let stopped = false
  const stopTracks = () => {
    if (stopped) return
    stopped = true
    source.disconnect()
    for (const track of stream.getTracks()) track.stop()
    void audio.close()
  }
  try {
    const blob = new Blob([WORKLET], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    await audio.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
    const node = new AudioWorkletNode(audio, 'maple-capture')
    node.port.onmessage = (event) => {
      onPcm(new Uint8Array(event.data))
    }
    source.connect(node)
    return { stop: stopTracks }
  } catch {
    const processor = audio.createScriptProcessor(2048, 1, 1)
    let acc = 0
    const pending = []
    const ratio = audio.sampleRate / 16000
    processor.onaudioprocess = (event) => {
      const channel = event.inputBuffer.getChannelData(0)
      for (let i = 0; i < channel.length; i++) {
        acc += 1
        if (acc < ratio) continue
        acc -= ratio
        const sample = channel[i] || 0
        const next = Math.max(-1, Math.min(1, sample))
        pending.push(next < 0 ? Math.round(next * 32768) : Math.round(next * 32767))
      }
      while (pending.length >= 320) {
        const frame = new Int16Array(320)
        for (let i = 0; i < 320; i++) frame[i] = pending.shift() || 0
        onPcm(new Uint8Array(frame.buffer))
      }
    }
    const silent = audio.createGain()
    silent.gain.value = 0
    source.connect(processor)
    processor.connect(silent)
    silent.connect(audio.destination)
    return {
      stop() {
        processor.disconnect()
        stopTracks()
      },
    }
  }
}

class Speaker {
  constructor() {
    this.ctx = null
    this.next = 0
    this.sources = []
  }
  play(bytes) {
    if (bytes.byteLength < 2) return
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2))
    const ctx = this.ensure()
    const buffer = ctx.createBuffer(1, pcm.length, 24000)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < pcm.length; i++) data[i] = (pcm[i] || 0) / 32768
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    const now = ctx.currentTime
    if (this.next < now + 0.02) this.next = now + 0.05
    source.start(this.next)
    this.next += buffer.duration
    this.sources.push(source)
    source.onended = () => {
      this.sources = this.sources.filter((item) => item !== source)
    }
  }
  stop() {
    for (const source of this.sources) {
      try {
        source.stop()
      } catch {
        /* already finished */
      }
    }
    this.sources = []
    this.next = 0
  }
  ensure() {
    if (!this.ctx) this.ctx = new AudioContext({ sampleRate: 24000 })
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }
}

// Construct after the class. A class binding is not available above its declaration.
speaker = new Speaker()

const WORKLET = `
class MapleCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ratio = sampleRate / 16000
    this.acc = 0
    this.pending = []
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true
    for (let i = 0; i < channel.length; i++) {
      this.acc += 1
      if (this.acc < this.ratio) continue
      this.acc -= this.ratio
      let sample = channel[i]
      if (sample > 1) sample = 1
      if (sample < -1) sample = -1
      this.pending.push(sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767))
    }
    while (this.pending.length >= 320) {
      const frame = new Int16Array(320)
      for (let i = 0; i < 320; i++) frame[i] = this.pending.shift()
      this.port.postMessage(frame.buffer, [frame.buffer])
    }
    return true
  }
}
registerProcessor('maple-capture', MapleCapture)
`
