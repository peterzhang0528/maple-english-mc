export interface VoiceHooks {
  button: HTMLButtonElement
  onStatus: (text: string) => void
  onUser: (text: string) => void
  onMaple: (text: string) => void
  onAction: (action: string) => void
  context: () => { lookingAt: string | null }
}

const START = 'Start talking · 开始说话'
const STOP = 'Stop · 停止'
const CONNECTING = 'Connecting · 正在连接'

export function startVoice(hooks: VoiceHooks, voiceOn: boolean): void {
  const button = hooks.button
  const speaker = new Speaker()
  let ws: WebSocket | null = null
  let live = false
  let ready = false
  let capture: Capture | null = null
  let contextTimer = 0

  button.addEventListener('click', () => {
    if (live) void shutdown()
    else void begin()
  })

  async function begin(): Promise<void> {
    if (!voiceOn) {
      hooks.onStatus('Voice keys are not set. Type English below. 未配置语音密钥，打字仍然可以练习。')
      return
    }
    live = true
    ready = false
    button.disabled = true
    button.textContent = CONNECTING
    button.setAttribute('aria-pressed', 'true')
    try {
      capture = await openMic((pcm) => {
        if (!ws || ws.readyState !== WebSocket.OPEN || !ready) return
        ws.send(JSON.stringify({ type: 'audio', pcm: base64FromBytes(pcm) }))
      })
    } catch {
      live = false
      button.disabled = false
      button.textContent = START
      button.setAttribute('aria-pressed', 'false')
      hooks.onStatus('Microphone permission is needed. You can still type. 需要麦克风权限，也可以继续打字。')
      return
    }

    ws = new WebSocket(voiceUrl())
    ws.addEventListener('message', (event) => {
      handle(String(event.data))
    })
    ws.addEventListener('close', () => {
      if (!live) return
      void shutdown(false)
      hooks.onStatus('Voice stopped. Type English any time. 语音已停止，打字仍然可以。')
    })
    ws.addEventListener('error', () => {
      hooks.onStatus('Voice connection failed. Type English below. 语音连接失败，请改用打字。')
    })
  }

  function handle(raw: string): void {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }
    if (message.type === 'status' && message.voice === 'off') {
      hooks.onStatus(
        typeof message.reason === 'string'
          ? message.reason
          : 'Voice is off. Type English below. 未开启语音，打字仍然可以练习。',
      )
      void shutdown(false)
      return
    }
    if (message.type === 'ready') {
      ready = true
      button.disabled = false
      button.textContent = STOP
      hooks.onStatus('Maple is listening. Speak English. Maple 在听，请说英语。')
      sendContext()
      window.clearInterval(contextTimer)
      contextTimer = window.setInterval(sendContext, 1000)
      return
    }
    if (message.type === 'user_text' && typeof message.text === 'string') {
      if (message.final === true) hooks.onUser(message.text)
      else hooks.onStatus(message.text)
      return
    }
    if (message.type === 'maple_text' && typeof message.text === 'string') {
      if (message.final === true) hooks.onMaple(message.text)
      else hooks.onStatus(message.text)
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
    if (message.type === 'action' && typeof message.action === 'string') {
      hooks.onAction(message.action)
      return
    }
    if (message.type === 'error' && typeof message.message === 'string') {
      hooks.onStatus(message.message)
    }
  }

  function sendContext(): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'context', lookingAt: hooks.context().lookingAt }))
  }

  async function shutdown(tellServer = true): Promise<void> {
    live = false
    ready = false
    window.clearInterval(contextTimer)
    button.disabled = false
    button.textContent = START
    button.setAttribute('aria-pressed', 'false')
    capture?.stop()
    capture = null
    speaker.stop()
    if (tellServer && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }))
    }
    ws?.close()
    ws = null
  }
}

function voiceUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}/api/voice`
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0)
  return btoa(binary)
}

function bytesFromBase64(pcm: string): Uint8Array {
  const binary = atob(pcm)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

interface Capture {
  stop: () => void
}

async function openMic(onPcm: (pcm: Uint8Array) => void): Promise<Capture> {
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
    node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      onPcm(new Uint8Array(event.data))
    }
    source.connect(node)
    return { stop: stopTracks }
  } catch {
    const processor = audio.createScriptProcessor(2048, 1, 1)
    let acc = 0
    const pending: number[] = []
    const ratio = audio.sampleRate / 16000
    processor.onaudioprocess = (event) => {
      const channel = event.inputBuffer.getChannelData(0)
      for (let i = 0; i < channel.length; i++) {
        acc += 1
        if (acc < ratio) continue
        acc -= ratio
        pending.push(clampSample(channel[i] ?? 0))
      }
      while (pending.length >= 320) {
        const frame = new Int16Array(320)
        for (let i = 0; i < 320; i++) frame[i] = pending.shift() ?? 0
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

function clampSample(sample: number): number {
  const next = Math.max(-1, Math.min(1, sample))
  return next < 0 ? Math.round(next * 32768) : Math.round(next * 32767)
}

class Speaker {
  private ctx: AudioContext | null = null
  private next = 0
  private sources: AudioBufferSourceNode[] = []

  play(bytes: Uint8Array): void {
    if (bytes.byteLength < 2) return
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2))
    const ctx = this.ensure()
    const buffer = ctx.createBuffer(1, pcm.length, 24000)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < pcm.length; i++) data[i] = (pcm[i] ?? 0) / 32768
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

  stop(): void {
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

  private ensure(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext({ sampleRate: 24000 })
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }
}

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
