export interface Spoken {
  username: string
  text: string
}

export function parsePublicChat(message: string): Spoken | null {
  const plain = message.replace(/§./g, '').trim()
  const match = plain.match(/^<([^>\n]{1,40})>\s?([\s\S]*)$/)
  if (!match?.[1] || match[2] == null) return null
  const username = match[1].trim()
  const text = match[2].trim()
  if (!username || !text) return null
  return { username, text }
}

export class RecentSpeech {
  private seen = new Map<string, number>()

  constructor(private readonly ttlMs: number) {}

  firstTime(username: string, text: string, now: number): boolean {
    const key = `${username.toLowerCase()}\0${text}`
    const previous = this.seen.get(key)
    if (previous != null && now - previous < this.ttlMs) return false
    this.seen.set(key, now)
    if (this.seen.size > 80) {
      for (const [entry, at] of this.seen) {
        if (now - at >= this.ttlMs) this.seen.delete(entry)
      }
    }
    return true
  }
}
