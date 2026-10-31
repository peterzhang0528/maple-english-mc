import * as THREE from 'three'
import {
  bodyHitsSolid,
  buildTerrain,
  nearbyBlockNames,
  raycastBlock,
  surfaceFeetY,
  type Terrain,
} from './terrain.js'

type MapleMode = 'idle' | 'follow' | 'come' | 'stop' | 'look'

interface PeerState {
  id: string
  name: string
  color: number
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  tx: number
  ty: number
  tz: number
  tyaw: number
  mesh: THREE.Group
  tag: HTMLDivElement
}

const BLOCK_COLORS: Record<string, number> = {
  grass_block: 0x63a83c,
  dirt: 0x8a5a32,
  stone: 0x8e8e8e,
  sand: 0xd8c48a,
  coal_ore: 0x5c5c5c,
  oak_log: 0x6b4a2b,
  oak_leaves: 0x3d8a34,
  oak_planks: 0xc4a06a,
  crafting_table: 0x8b5a2b,
  furnace: 0x6d6d6d,
  chest: 0xb8860b,
  water: 0x3c88c8,
}

const params = new URLSearchParams(location.search)
const displayName = (params.get('name') ?? localStorage.getItem('maple_display_name') ?? '').trim().slice(0, 20)
let requestedRoom = (params.get('room') ?? '').trim().toUpperCase()

if (!displayName) {
  location.replace(`/${requestedRoom ? `?room=${encodeURIComponent(requestedRoom)}` : ''}`)
}

const terrain = buildTerrain()
const canvas = must('canvas', HTMLCanvasElement)
const log = must('#log', HTMLOListElement)
const form = must('#chat-form', HTMLFormElement)
const input = must('#say', HTMLInputElement)
const sendButton = must('#send', HTMLButtonElement)
const blockLabel = must('#block-label', HTMLElement)
const mapleTag = must('#maple-tag', HTMLElement)
const tutorBadge = must('#tutor-badge', HTMLElement)
const statusLine = must('#status-line', HTMLElement)
const roomBadge = must('#room-badge', HTMLElement)

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
renderer.setPixelRatio(1) // hard cap: Retina 2x+ was a big hitch source on busy Macs
renderer.setClearColor(0x8ec8f0)
const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0x8ec8f0, 22, 48) // farther near = less per-pixel fog cost + less pop
scene.add(new THREE.HemisphereLight(0xe7f4ff, 0x6d8f45, 0.95))
const sun = new THREE.DirectionalLight(0xfff1cf, 1.05)
sun.position.set(18, 28, 12)
scene.add(sun)

const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 80)
camera.rotation.order = 'YXZ'

buildMeshes(scene, terrain)
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
  new THREE.LineBasicMaterial({ color: 0xf4efe4 }),
)
highlight.visible = false
scene.add(highlight)

const maple = makeAvatar(0xe39b32)
scene.add(maple)
const maplePos = { x: terrain.maple.x, y: terrain.maple.y, z: terrain.maple.z, yaw: 0 }
let mapleMode: MapleMode = 'idle'
let walkPhase = 0
let followTargetId: string | null = null

const towardMapleX = terrain.maple.x - terrain.spawn.x
const towardMapleZ = terrain.maple.z - terrain.spawn.z
const player = {
  x: terrain.spawn.x,
  y: terrain.spawn.y,
  z: terrain.spawn.z,
  yaw: Math.atan2(-towardMapleX, -towardMapleZ),
  pitch: -0.28,
  vy: 0,
}
const keys = new Set<string>()
const hold = new Set<string>()
const peers = new Map<string, PeerState>()
let lookingAt: string | null = null
let lastFrame = performance.now()
let sending = false
let selfId: string | null = null
let roomCode = requestedRoom
let socket: WebSocket | null = null
let lastMoveSent = 0
let reconnectTimer: number | null = null
const MOVE_HZ_MS = 66
const MOVE_HEARTBEAT_MS = 500
const MOVE_EPS = 0.02
const YAW_EPS = 0.03
let lastSentPose = { x: Number.NaN, y: Number.NaN, z: Number.NaN, yaw: Number.NaN, pitch: Number.NaN }
const scratchDir = new THREE.Vector3()
const scratchTag = new THREE.Vector3()
/** Looking-at uses CPU grid DDA (terrain.raycastBlock) — never GPU ReadPixels. Throttle off the render path. */
const PICK_HZ_MS = 120
const TAG_HZ_MS = 100 // DOM tags ≤10Hz — never thrash layout in the render path
let lastPickAt = -1e9
let lastTagAt = -1e9
let lastHudAt = -1e9
let resizeTimer: number | null = null
let fpsFrames = 0
let fpsLast = performance.now()
let fpsValue = 0

// Chrome may log one "GPU stall due to ReadPixels" during Three.js WebGL capability probes at init; that is not our voxel pick.
const _warn = console.warn.bind(console)
console.warn = (...args: unknown[]) => {
  const first = args[0]
  if (typeof first === 'string' && first.includes('GPU stall due to ReadPixels')) return
  _warn(...args)
}

resize()
window.addEventListener('resize', () => {
  if (resizeTimer != null) window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => {
    resizeTimer = null
    resize()
  }, 160)
})
canvas.addEventListener('click', () => {
  if (window.matchMedia('(pointer: fine)').matches) canvas.requestPointerLock()
})
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas) return
  player.yaw -= event.movementX * 0.0022
  player.pitch = clamp(player.pitch - event.movementY * 0.0022, -1.15, 1.15)
})

let touchLast: { x: number; y: number } | null = null
canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'touch') return
  touchLast = { x: event.clientX, y: event.clientY }
})
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType !== 'touch' || !touchLast) return
  player.yaw -= (event.clientX - touchLast.x) * 0.005
  player.pitch = clamp(player.pitch - (event.clientY - touchLast.y) * 0.005, -1.15, 1.15)
  touchLast = { x: event.clientX, y: event.clientY }
})
canvas.addEventListener('pointerup', () => {
  touchLast = null
})
canvas.addEventListener('pointercancel', () => {
  touchLast = null
})

window.addEventListener('keydown', (event) => {
  if (document.activeElement === input) {
    if (event.key === 'Escape') input.blur()
    return
  }
  keys.add(event.code)
  if (event.code === 'Enter') {
    event.preventDefault()
    input.focus()
  }
  if (event.code === 'Space') event.preventDefault()
})
window.addEventListener('keyup', (event) => keys.delete(event.code))

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-move]')) {
  const direction = button.dataset.move ?? ''
  const press = (event: Event) => {
    event.preventDefault()
    hold.add(direction)
  }
  const release = () => hold.delete(direction)
  button.addEventListener('pointerdown', press)
  button.addEventListener('pointerup', release)
  button.addEventListener('pointerleave', release)
  button.addEventListener('pointercancel', release)
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  const text = input.value.trim()
  if (!text || sending) return
  input.value = ''
  void speak(text)
})

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-say]')) {
  button.addEventListener('click', () => {
    input.value = button.dataset.say ?? ''
    input.focus()
  })
}

roomBadge.textContent = roomCode ? `Room ${roomCode}` : 'Connecting…'
statusLine.textContent = 'Connecting to room…'
connectRoom()

void fetch('/api/health')
  .then((response) => response.json())
  .then((health: { tutor?: string }) => {
    if (health.tutor === 'claude') tutorBadge.textContent = 'Tutor: Claude'
    else if (health.tutor === 'openai') tutorBadge.textContent = 'Tutor: OpenAI'
    else tutorBadge.textContent = 'Tutor: local practice'
  })
  .catch(() => {
    tutorBadge.textContent = 'Tutor: local practice'
  })

renderer.setAnimationLoop(frame)

function connectRoom(): void {
  if (reconnectTimer != null) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${proto}://${location.host}/api/room`)
  socket = ws
  ws.addEventListener('open', () => {
    const payload = requestedRoom
      ? { type: 'join', room: requestedRoom, name: displayName }
      : { type: 'create', name: displayName }
    ws.send(JSON.stringify(payload))
  })
  ws.addEventListener('message', (event) => {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(String(event.data)) as Record<string, unknown>
    } catch {
      return
    }
    onRoomMessage(message)
  })
  ws.addEventListener('close', () => {
    statusLine.textContent = 'Disconnected. Reconnecting… / 断线重连中…'
    reconnectTimer = window.setTimeout(() => connectRoom(), 1500)
  })
  ws.addEventListener('error', () => {
    statusLine.textContent = 'Connection error. / 连接出错。'
  })
}

function onRoomMessage(message: Record<string, unknown>): void {
  const type = typeof message.type === 'string' ? message.type : ''
  if (type === 'welcome') {
    selfId = typeof message.playerId === 'string' ? message.playerId : null
    roomCode = typeof message.room === 'string' ? message.room : roomCode
    requestedRoom = roomCode
    roomBadge.textContent = `Room ${roomCode}`
    statusLine.textContent = `Share code ${roomCode} · 把房间码发给同学`
    const url = new URL(location.href)
    url.searchParams.set('name', displayName)
    url.searchParams.set('room', roomCode)
    history.replaceState(null, '', url.toString())
    clearPeers()
    if (Array.isArray(message.players)) {
      for (const entry of message.players) {
        if (!entry || typeof entry !== 'object') continue
        const peer = entry as Record<string, unknown>
        if (typeof peer.id === 'string' && peer.id !== selfId) upsertPeer(peer)
      }
    }
    if (message.you && typeof message.you === 'object') {
      const you = message.you as Record<string, unknown>
      if (typeof you.x === 'number') player.x = you.x
      if (typeof you.y === 'number') player.y = you.y
      if (typeof you.z === 'number') player.z = you.z
    }
    addBubble('System', `Joined room ${roomCode} as ${displayName}.`)
    return
  }
  if (type === 'player_joined' && message.player && typeof message.player === 'object') {
    const peer = message.player as Record<string, unknown>
    if (typeof peer.id === 'string' && peer.id !== selfId) {
      upsertPeer(peer)
      addBubble('System', `${String(peer.name ?? 'Friend')} joined.`)
    }
    return
  }
  if (type === 'player_left' && typeof message.playerId === 'string') {
    removePeer(message.playerId)
    if (typeof message.name === 'string') addBubble('System', `${message.name} left.`)
    return
  }
  if (type === 'move' && typeof message.playerId === 'string' && message.playerId !== selfId) {
    upsertPeer(message)
    return
  }
  if (type === 'chat') {
    const from = typeof message.from === 'string' ? message.from : 'Maple'
    const text = typeof message.text === 'string' ? message.text : ''
    if (text) addBubble(from, text)
    if (message.kind === 'maple') {
      const action = message.action
      if (action === 'follow' || action === 'come' || action === 'stop' || action === 'look') {
        mapleMode = action === 'stop' ? 'stop' : action
        followTargetId = typeof message.playerId === 'string' ? message.playerId : selfId
        statusLine.textContent = actionLabel(mapleMode)
      }
    }
    sending = false
    sendButton.disabled = false
    return
  }
  if (type === 'error' || type === 'room_full') {
    const text = typeof message.message === 'string' ? message.message : 'Could not join room.'
    addBubble('System', text)
    statusLine.textContent = text
    sending = false
    sendButton.disabled = false
    if (type === 'room_full' || /not found|display name|room code/i.test(text)) {
      window.setTimeout(() => {
        location.href = `/?room=${encodeURIComponent(requestedRoom)}`
      }, 1800)
    }
  }
}

function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastFrame) / 1000)
  lastFrame = now
  fpsFrames += 1
  if (now - fpsLast >= 500) {
    fpsValue = Math.round((fpsFrames * 1000) / (now - fpsLast))
    fpsFrames = 0
    fpsLast = now
  }
  stepPlayer(dt)
  stepMaple(dt)
  stepPeers(dt)
  // Mesh poses every frame (GPU-cheap). DOM tags stay throttled below.
  for (const peer of peers.values()) {
    peer.mesh.position.set(peer.x, peer.y, peer.z)
    peer.mesh.rotation.y = peer.yaw
  }
  placeCamera()
  if (now - lastPickAt >= PICK_HZ_MS) {
    lastPickAt = now
    updateTarget()
  }
  renderer.render(scene, camera)
  if (now - lastTagAt >= TAG_HZ_MS) {
    lastTagAt = now
    placeTag()
    placePeerTags()
  }
  if (now - lastHudAt >= 200) {
    lastHudAt = now
    const el = document.getElementById('perf-hud')
    if (el) {
      const host = location.hostname
      const net = host === 'localhost' || host === '127.0.0.1' ? '本机' : '隧道'
      el.textContent = `${fpsValue} FPS · ${net}`
    }
  }
  maybeSendMove(now)
}

function maybeSendMove(now: number): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  const moved =
    Math.abs(player.x - lastSentPose.x) > MOVE_EPS ||
    Math.abs(player.y - lastSentPose.y) > MOVE_EPS ||
    Math.abs(player.z - lastSentPose.z) > MOVE_EPS ||
    Math.abs(player.yaw - lastSentPose.yaw) > YAW_EPS ||
    Math.abs(player.pitch - lastSentPose.pitch) > YAW_EPS
  const due = now - lastMoveSent
  if (!moved && due < MOVE_HEARTBEAT_MS) return
  if (moved && due < MOVE_HZ_MS) return
  lastMoveSent = now
  lastSentPose = { x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch }
  socket.send(
    JSON.stringify({
      type: 'move',
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
      pitch: player.pitch,
    }),
  )
}

function stepPeers(dt: number): void {
  const alpha = 1 - Math.exp(-14 * dt)
  for (const peer of peers.values()) {
    peer.x += (peer.tx - peer.x) * alpha
    peer.y += (peer.ty - peer.y) * alpha
    peer.z += (peer.tz - peer.z) * alpha
    let dyaw = peer.tyaw - peer.yaw
    while (dyaw > Math.PI) dyaw -= Math.PI * 2
    while (dyaw < -Math.PI) dyaw += Math.PI * 2
    peer.yaw += dyaw * alpha
  }
}

function stepPlayer(dt: number): void {
  const chatting = document.activeElement === input
  let wishX = 0
  let wishZ = 0
  if (!chatting) {
    if (keys.has('KeyW') || keys.has('ArrowUp') || hold.has('forward')) wishZ -= 1
    if (keys.has('KeyS') || keys.has('ArrowDown') || hold.has('back')) wishZ += 1
    if (keys.has('KeyA') || keys.has('ArrowLeft') || hold.has('left')) wishX -= 1
    if (keys.has('KeyD') || keys.has('ArrowRight') || hold.has('right')) wishX += 1
  }
  const length = Math.hypot(wishX, wishZ) || 1
  wishX /= length
  wishZ /= length
  const sin = Math.sin(player.yaw)
  const cos = Math.cos(player.yaw)
  const speed = 4.4 * (wishX === 0 && wishZ === 0 ? 0 : 1)
  const dx = (wishX * cos + wishZ * sin) * speed * dt
  const dz = (wishX * -sin + wishZ * cos) * speed * dt
  moveFeet(dx, 0)
  moveFeet(0, dz)

  const grounded = bodyHitsSolid(terrain, player.x, player.y - 0.12, player.z)
  if (grounded && player.vy <= 0) player.vy = 0
  const jump = !chatting && (keys.has('Space') || hold.has('jump'))
  if (jump && grounded) player.vy = 6.4
  player.vy = Math.max(-18, player.vy - 18 * dt)
  const nextY = player.y + player.vy * dt
  if (bodyHitsSolid(terrain, player.x, nextY, player.z)) {
    if (player.vy < 0) player.y = Math.floor(player.y)
    player.vy = 0
  } else {
    player.y = nextY
  }
  if (player.y < -4) {
    player.x = terrain.spawn.x
    player.y = terrain.spawn.y
    player.z = terrain.spawn.z
    player.vy = 0
  }
}

function moveFeet(dx: number, dz: number): void {
  const nextX = player.x + dx
  const nextZ = player.z + dz
  if (!bodyHitsSolid(terrain, nextX, player.y, nextZ)) {
    player.x = nextX
    player.z = nextZ
    return
  }
  if (!bodyHitsSolid(terrain, nextX, player.y + 1, nextZ)) {
    player.x = nextX
    player.y += 1
    player.z = nextZ
  }
}

function followPose(): { x: number; z: number; yaw: number } {
  if (followTargetId && followTargetId !== selfId) {
    const peer = peers.get(followTargetId)
    if (peer) return { x: peer.x, z: peer.z, yaw: peer.yaw }
  }
  return { x: player.x, z: player.z, yaw: player.yaw }
}

function stepMaple(dt: number): void {
  const target = followPose()
  let targetX = maplePos.x
  let targetZ = maplePos.z
  if (mapleMode === 'follow' || mapleMode === 'come') {
    const sin = Math.sin(target.yaw)
    const cos = Math.cos(target.yaw)
    const ahead = mapleMode === 'come' ? 2.1 : 1.7
    const side = mapleMode === 'come' ? 0.4 : 1.2
    targetX = target.x - sin * ahead + cos * side
    targetZ = target.z - cos * ahead - sin * side
  }
  const dx = targetX - maplePos.x
  const dz = targetZ - maplePos.z
  const distance = Math.hypot(dx, dz)
  const moving = (mapleMode === 'follow' || mapleMode === 'come') && distance > 1.15
  if (moving) {
    const step = Math.min(distance, 3.3 * dt)
    const nx = maplePos.x + (dx / distance) * step
    const nz = maplePos.z + (dz / distance) * step
    if (!bodyHitsSolid(terrain, nx, maplePos.y, nz)) {
      maplePos.x = nx
      maplePos.z = nz
    }
    maplePos.yaw = Math.atan2(dx, dz)
    walkPhase += dt * 8
  } else if (mapleMode === 'look' || mapleMode === 'follow' || mapleMode === 'come') {
    maplePos.yaw = Math.atan2(target.x - maplePos.x, target.z - maplePos.z)
    walkPhase = 0
  }
  maplePos.y = surfaceFeetY(terrain, maplePos.x, maplePos.z)
  maple.position.set(maplePos.x, maplePos.y, maplePos.z)
  maple.rotation.y = maplePos.yaw
  const swing = moving ? Math.sin(walkPhase) * 0.6 : 0
  const left = maple.getObjectByName('leg-left')
  const right = maple.getObjectByName('leg-right')
  if (left) left.rotation.x = swing
  if (right) right.rotation.x = -swing
}

function placeCamera(): void {
  camera.position.set(player.x, player.y + 1.55, player.z)
  camera.rotation.y = player.yaw
  camera.rotation.x = player.pitch
}

function updateTarget(): void {
  camera.getWorldDirection(scratchDir)
  const hit = raycastBlock(
    terrain,
    camera.position.x,
    camera.position.y,
    camera.position.z,
    scratchDir.x,
    scratchDir.y,
    scratchDir.z,
  )
  if (!hit) {
    if (lookingAt !== null || highlight.visible) {
      lookingAt = null
      highlight.visible = false
      blockLabel.textContent = 'Looking at: sky'
    }
    return
  }
  lookingAt = hit.name
  highlight.visible = true
  highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5)
  const label = `Looking at: ${hit.name.replaceAll('_', ' ')}`
  if (blockLabel.textContent !== label) blockLabel.textContent = label
}

function placeTag(): void {
  const point = scratchTag.set(maplePos.x, maplePos.y + 1.85, maplePos.z).project(camera)
  const visible = point.z > -1 && point.z < 1
  // visibility (not .hidden) avoids layout insert/remove flicker
  const nextVis = visible ? 'visible' : 'hidden'
  if (mapleTag.style.visibility !== nextVis) mapleTag.style.visibility = nextVis
  if (!visible) return
  const x = (point.x * 0.5 + 0.5) * canvas.clientWidth
  const y = (-point.y * 0.5 + 0.5) * canvas.clientHeight
  const next = `translate(${x}px, ${y}px) translate(-50%, -120%)`
  if (mapleTag.style.transform !== next) mapleTag.style.transform = next
}

function placePeerTags(): void {
  for (const peer of peers.values()) {
    const point = scratchTag.set(peer.x, peer.y + 1.85, peer.z).project(camera)
    const visible = point.z > -1 && point.z < 1
    const nextVis = visible ? 'visible' : 'hidden'
    if (peer.tag.style.visibility !== nextVis) peer.tag.style.visibility = nextVis
    if (!visible) continue
    const x = (point.x * 0.5 + 0.5) * canvas.clientWidth
    const y = (-point.y * 0.5 + 0.5) * canvas.clientHeight
    const next = `translate(${x}px, ${y}px) translate(-50%, -120%)`
    if (peer.tag.style.transform !== next) peer.tag.style.transform = next
  }
}

async function speak(text: string): Promise<void> {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    addBubble('System', 'Not connected to the room yet.')
    return
  }
  updateTarget()
  lastPickAt = performance.now()
  sending = true
  sendButton.disabled = true
  statusLine.textContent = 'Maple is listening...'
  socket.send(
    JSON.stringify({
      type: 'say',
      text,
      lookingAt,
      position: { x: player.x, y: player.y, z: player.z },
      nearbyBlocks: nearbyBlockNames(terrain, player.x, player.y + 1, player.z),
    }),
  )
}

function actionLabel(mode: MapleMode): string {
  if (mode === 'follow') return 'Maple is following.'
  if (mode === 'come') return 'Maple is coming over.'
  if (mode === 'stop') return 'Maple will wait here.'
  if (mode === 'look') return 'Maple is looking.'
  return ''
}

function addBubble(who: string, text: string): void {
  const item = document.createElement('li')
  const name = document.createElement('strong')
  name.textContent = who
  item.append(name, document.createTextNode(` ${text}`))
  log.append(item)
  while (log.children.length > 80) log.firstElementChild?.remove()
  log.scrollTop = log.scrollHeight
}

function upsertPeer(raw: Record<string, unknown>): void {
  const id = typeof raw.id === 'string' ? raw.id : typeof raw.playerId === 'string' ? raw.playerId : null
  if (!id || id === selfId) return
  let peer = peers.get(id)
  if (!peer) {
    const color = typeof raw.color === 'number' ? raw.color : 0x3c88c8
    const mesh = makeAvatar(color)
    scene.add(mesh)
    const tag = document.createElement('div')
    tag.className = 'peer-tag'
    tag.textContent = typeof raw.name === 'string' ? raw.name : 'Friend'
    document.body.append(tag)
    peer = {
      id,
      name: typeof raw.name === 'string' ? raw.name : 'Friend',
      color,
      x: terrain.spawn.x,
      y: terrain.spawn.y,
      z: terrain.spawn.z,
      yaw: 0,
      pitch: 0,
      tx: Number.NaN,
      ty: Number.NaN,
      tz: Number.NaN,
      tyaw: 0,
      mesh,
      tag,
    }
    peers.set(id, peer)
  }
  if (typeof raw.name === 'string') {
    peer.name = raw.name
    peer.tag.textContent = raw.name
  }
  if (typeof raw.color === 'number') peer.color = raw.color
  const snap = Number.isNaN(peer.tx)
  if (typeof raw.x === 'number') {
    peer.tx = raw.x
    if (snap) peer.x = raw.x
  }
  if (typeof raw.y === 'number') {
    peer.ty = raw.y
    if (snap) peer.y = raw.y
  }
  if (typeof raw.z === 'number') {
    peer.tz = raw.z
    if (snap) peer.z = raw.z
  }
  if (typeof raw.yaw === 'number') {
    peer.tyaw = raw.yaw
    if (snap) peer.yaw = raw.yaw
  }
  if (typeof raw.pitch === 'number') peer.pitch = raw.pitch
}

function removePeer(id: string): void {
  const peer = peers.get(id)
  if (!peer) return
  scene.remove(peer.mesh)
  peer.tag.remove()
  peers.delete(id)
  if (followTargetId === id) followTargetId = selfId
}

function clearPeers(): void {
  for (const id of [...peers.keys()]) removePeer(id)
}

function resize(): void {
  const width = canvas.clientWidth || window.innerWidth
  const height = canvas.clientHeight || window.innerHeight
  renderer.setSize(width, height, false)
  camera.aspect = width / Math.max(1, height)
  camera.updateProjectionMatrix()
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function must<T extends Element>(selector: string, kind: new () => T): T {
  const node = document.querySelector(selector)
  if (!(node instanceof kind)) throw new Error(`Play page is missing ${selector}`)
  return node
}

function buildMeshes(target: THREE.Scene, world: Terrain): void {
  const groups = new Map<string, number[]>()
  for (const cell of world.cells) {
    const list = groups.get(cell.name) ?? []
    list.push(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5)
    groups.set(cell.name, list)
  }
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const matrix = new THREE.Matrix4()
  for (const [name, positions] of groups) {
    const count = positions.length / 3
    // Leaves opaque (alphaTest) — transparent InstancedMesh sorts badly and "闪".
    // Water stays transparent but depthWrite off to cut flicker/overdraw.
    const isWater = name === 'water'
    const isLeaves = name === 'oak_leaves'
    const material = new THREE.MeshLambertMaterial({
      color: BLOCK_COLORS[name] ?? 0xcccccc,
      transparent: isWater,
      opacity: isWater ? 0.72 : 1,
      alphaTest: isLeaves ? 0.5 : 0,
      depthWrite: !isWater,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    for (let i = 0; i < count; i += 1) {
      const p = i * 3
      matrix.setPosition(positions[p]!, positions[p + 1]!, positions[p + 2]!)
      mesh.setMatrixAt(i, matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    target.add(mesh)
  }
}

function makeAvatar(shirtColor: number): THREE.Group {
  const group = new THREE.Group()
  const skin = new THREE.MeshLambertMaterial({ color: 0xf0c7a4 })
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor })
  const pants = new THREE.MeshLambertMaterial({ color: 0x243044 })
  const hair = new THREE.MeshLambertMaterial({ color: 0x3a2a22 })
  const dark = new THREE.MeshLambertMaterial({ color: 0x1b1b1b })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), shirt)
  body.position.y = 1.05
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.48), skin)
  head.position.y = 1.68
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), hair)
  cap.position.y = 1.9
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.04), dark)
  const eyeR = eyeL.clone()
  eyeL.position.set(-0.1, 1.7, 0.24)
  eyeR.position.set(0.1, 1.7, 0.24)
  const legGeometry = new THREE.BoxGeometry(0.18, 0.5, 0.18)
  legGeometry.translate(0, -0.25, 0)
  const legL = new THREE.Mesh(legGeometry, pants)
  const legR = new THREE.Mesh(legGeometry, pants)
  legL.name = 'leg-left'
  legR.name = 'leg-right'
  legL.position.set(-0.12, 0.72, 0)
  legR.position.set(0.12, 0.72, 0)
  group.add(body, head, cap, eyeL, eyeR, legL, legR)
  return group
}
