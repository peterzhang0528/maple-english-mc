/**
 * Doubao / Volcengine realtime voice.
 * Credentials stay in this process. The browser only hears "voice on" or "voice off".
 *
 * Docs: https://www.volcengine.com/docs/6561/1594356
 * Duplex: wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue
 */

export const DUPLEX_URL = 'wss://openspeech.bytedance.com/api/v3/duplex/realtime/dialogue'
export const LEGACY_URL = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue'
export const DEFAULT_RESOURCE_ID = 'volc.speech.dialog'
/** Published fixed value in the realtime dialogue docs. Not an account secret. */
export const DEFAULT_APP_KEY = 'PlgvMymc7f3tQnJ6'
export const DEFAULT_DUPLEX_MODEL = '1.2.6.1'
export const DEFAULT_LEGACY_MODEL = '1.2.1.1'
export const DEFAULT_VOICE = 'zh_female_vv_jupiter_bigtts'

export interface VoiceConfig {
  enabled: boolean
  appId: string
  accessKey: string
  secretKey: string
  resourceId: string
  appKey: string
  endpoint: string
  legacyEndpoint: string
  model: string
  legacyModel: string
  voice: string
  inputRate: 16000
  outputRate: 24000
  outputFormat: 'pcm_s16le'
}

export function loadVoiceConfig(env: NodeJS.ProcessEnv = process.env): VoiceConfig {
  const appId = first(env, ['DOUBAO_APP_ID', 'VOLC_APP_ID'])
  const accessKey = first(env, ['DOUBAO_ACCESS_KEY', 'VOLC_ACCESS_KEY'])
  const secretKey = first(env, ['DOUBAO_SECRET_KEY', 'VOLC_SECRET_KEY', 'DOUBAO_API_KEY', 'VOLC_API_KEY'])
  return {
    enabled: Boolean((appId && accessKey) || secretKey),
    appId,
    accessKey,
    secretKey,
    resourceId: first(env, ['DOUBAO_RESOURCE_ID', 'VOLC_RESOURCE_ID']) || DEFAULT_RESOURCE_ID,
    appKey: first(env, ['DOUBAO_APP_KEY', 'VOLC_APP_KEY']) || DEFAULT_APP_KEY,
    endpoint: first(env, ['DOUBAO_WS_URL', 'VOLC_WS_URL']) || DUPLEX_URL,
    legacyEndpoint: first(env, ['DOUBAO_LEGACY_WS_URL', 'VOLC_LEGACY_WS_URL']) || LEGACY_URL,
    model: first(env, ['DOUBAO_MODEL', 'VOLC_MODEL']) || DEFAULT_DUPLEX_MODEL,
    legacyModel: first(env, ['DOUBAO_LEGACY_MODEL', 'VOLC_LEGACY_MODEL']) || DEFAULT_LEGACY_MODEL,
    voice: first(env, ['DOUBAO_VOICE', 'VOLC_VOICE']) || DEFAULT_VOICE,
    inputRate: 16000,
    outputRate: 24000,
    outputFormat: 'pcm_s16le',
  }
}

/** Headers for the upstream WebSocket handshake. Never send these to the browser. */
export function voiceAuthHeaders(config: VoiceConfig, connectId: string): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Api-Resource-Id': config.resourceId,
    'X-Api-Connect-Id': connectId,
    'X-Api-App-Key': config.appKey,
  }
  if (config.appId) {
    headers['X-Api-App-ID'] = config.appId
    headers['X-Api-App-Id'] = config.appId
  }
  if (config.accessKey) headers['X-Api-Access-Key'] = config.accessKey
  if (config.secretKey) headers['X-Api-Key'] = config.secretKey
  return headers
}

export function secretValues(config: VoiceConfig): string[] {
  return [config.accessKey, config.secretKey].filter((value) => value.length >= 4)
}

export function redactSecrets(text: string, secrets: string[]): string {
  let out = text
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join('[redacted]')
  }
  return out.slice(0, 300)
}

function first(env: NodeJS.ProcessEnv, names: string[]): string {
  for (const name of names) {
    const value = env[name]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}
