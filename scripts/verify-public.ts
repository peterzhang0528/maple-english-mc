import WebSocket from 'ws'

const base = process.argv[2]
if (!base) throw new Error('usage: verify-public <https-url>')
const health = await fetch(`${base}/api/health`, { headers: { 'bypass-tunnel-reminder': 'true' } })
console.log('health', health.status, await health.json())
const home = await fetch(base + '/', { headers: { 'bypass-tunnel-reminder': 'true' } })
const html = await home.text()
console.log('home', home.status, /Create room|创建房间/.test(html))

function open(path: string) {
  const url = base.replace(/^http/, 'ws') + path
  const ws = new WebSocket(url, { headers: { 'bypass-tunnel-reminder': 'true' } })
  const messages: any[] = []
  ws.on('message', (d) => messages.push(JSON.parse(String(d))))
  return { ws, messages, ready: new Promise<void>((res, rej) => { ws.once('open', () => res()); ws.once('error', rej) }) }
}

const a = open('/api/room')
const b = open('/api/room')
await a.ready
await b.ready
a.ws.send(JSON.stringify({ type: 'create', name: 'PublicA' }))
await wait(a.messages, (m) => m.type === 'welcome')
const room = a.messages.find((m) => m.type === 'welcome').room
b.ws.send(JSON.stringify({ type: 'join', room, name: 'PublicB' }))
await wait(b.messages, (m) => m.type === 'welcome')
await wait(a.messages, (m) => m.type === 'player_joined')
a.ws.send(JSON.stringify({ type: 'move', x: 3, y: 4, z: 2, yaw: 1, pitch: 0 }))
await wait(b.messages, (m) => m.type === 'move' && m.x === 3)
a.ws.send(JSON.stringify({ type: 'say', text: 'Hello Maple!' }))
await wait(b.messages, (m) => m.type === 'chat' && m.kind === 'player')
await wait(b.messages, (m) => m.type === 'chat' && m.kind === 'maple', 20000)
console.log('OK room', room, 'players synced + Maple chat')
a.ws.close(); b.ws.close()

function wait(messages: any[], match: (m: any) => boolean, ms = 15000) {
  const start = Date.now()
  return new Promise<void>((resolve, reject) => {
    const tick = () => {
      if (messages.some(match)) return resolve()
      if (Date.now() - start > ms) return reject(new Error('timeout'))
      setTimeout(tick, 50)
    }
    tick()
  })
}
