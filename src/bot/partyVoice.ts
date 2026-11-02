/**
 * Party voice bus: Spark (and optional peers) push chat lines to Maple's mic page,
 * which speaks them with browser TTS so the kid hears both buddies in one window.
 * Keeps a single GPT Live mic on Maple — no second Live session fighting the kid.
 */
export function partyVoiceUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = (env.PARTY_VOICE_URL ?? '').trim()
  if (!raw) return null
  return raw.replace(/\/$/, '')
}

/** Spark always announces when PARTY_VOICE_URL is set; Maple only if PARTY_VOICE_INCLUDE_MAPLE=1. */
export function shouldAnnouncePartyVoice(
  username: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!partyVoiceUrl(env)) return false
  const who = username.trim().toLowerCase()
  if (who === 'spark') return true
  if (who === 'maple') {
    const flag = (env.PARTY_VOICE_INCLUDE_MAPLE ?? '').trim().toLowerCase()
    return ['1', 'true', 'yes', 'on'].includes(flag)
  }
  return false
}

export async function announcePartyLine(
  speaker: string,
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const base = partyVoiceUrl(env)
  if (!base) return
  if (!shouldAnnouncePartyVoice(speaker, env)) return
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 300)
  if (!clean) return
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 1500)
  try {
    await fetch(`${base}/api/party-say`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speaker, text: clean }),
      signal: controller.signal,
    })
  } catch {
    /* mic page may be down; chat still works */
  } finally {
    clearTimeout(timer)
  }
}
