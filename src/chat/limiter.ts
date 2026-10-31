export type TurnDecision = 'ok' | 'slow' | 'mute' | 'busy'

export class TurnLimiter {
  private lastAccepted = new Map<string, number>()
  private mutedUntil = new Map<string, number>()
  private windowStart = 0
  private windowCount = 0

  constructor(
    private readonly playerMinIntervalMs: number,
    private readonly muteMs: number,
    private readonly globalTurns: number,
    private readonly globalWindowMs: number,
  ) {}

  take(username: string, now: number): TurnDecision {
    if (now >= this.windowStart + this.globalWindowMs) {
      this.windowStart = now
      this.windowCount = 0
    }

    const key = username.toLowerCase()
    const muteUntil = this.mutedUntil.get(key) ?? 0
    if (now < muteUntil) return 'mute'

    const last = this.lastAccepted.get(key)
    if (last != null && now - last < this.playerMinIntervalMs) {
      this.mutedUntil.set(key, now + this.muteMs)
      return 'slow'
    }

    if (this.windowCount >= this.globalTurns) return 'busy'

    this.lastAccepted.set(key, now)
    this.windowCount += 1
    return 'ok'
  }
}

export class SendQueue {
  private nextAt = 0

  constructor(private readonly minIntervalMs: number) {}

  async send(lines: string[], emit: (line: string) => void): Promise<void> {
    for (const line of lines) {
      const wait = this.nextAt - Date.now()
      if (wait > 0) await delay(wait)
      emit(line)
      this.nextAt = Date.now() + this.minIntervalMs
    }
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
