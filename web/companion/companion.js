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
let voiceOn = false

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
if (playerInput.value.trim()) void publishPlayer()

async function refresh() {
  try {
    const health = await (await fetch('/api/health')).json()
    voiceOn = health.voice === 'doubao'
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
    if (!live && !voiceOn) {
      statusLine.textContent = 'Voice keys are not set. Talk in Minecraft chat. 未配置语音密钥时，请在游戏里打字。'
    } else if (!live && voiceOn) {
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
  if (!voiceOn) {
    statusLine.textContent = 'Voice keys are not set. Talk in Minecraft chat. 未配置语音密钥时，请在游戏里打字。'
    return
  }
  live = true
  ready = false
  talkButton.disabled = true
  talkButton.textContent = CONNECTING
  talkButton.setAttribute('aria-pressed', 'true')
  await publishPlayer()
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
  if (capture) capture.stop()
  capture = null
  speaker.stop()
  if (tellServer && ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' }))
  if (ws) ws.close()
  ws = null
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
