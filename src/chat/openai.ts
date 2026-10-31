import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unlink, writeFile } from 'node:fs/promises'
import type { HistoryEntry } from '../types.js'
import type { TutorInput } from './fallback.js'
import { activeSystemPrompt } from './prompt.js'
import { renderUserTurn } from './claude.js'

export interface OpenAISettings {
  apiKey: string
  model: string
  maxTokens: number
}

/**
 * Typed chat via OpenAI.
 * macOS system proxy is on 127.0.0.1:7897; Node fetch ignores it, so use curl
 * (same approach as GPT Live in voiceCompanion).
 */
export async function openaiReply(
  settings: OpenAISettings,
  history: HistoryEntry[],
  input: TutorInput,
): Promise<string> {
  const messages = [
    { role: 'system', content: activeSystemPrompt() },
    ...history.map((entry) => ({ role: entry.role, content: entry.content })),
    { role: 'user', content: renderUserTurn(input) },
  ]

  const payload = JSON.stringify({
    model: settings.model,
    max_completion_tokens: settings.maxTokens,
    messages,
  })

  const proxy =
    (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || 'http://127.0.0.1:7897').trim() ||
    'http://127.0.0.1:7897'

  const { status, text } = await postOpenAIChat(settings.apiKey, payload, proxy)
  const body = JSON.parse(text || '{}') as {
    error?: { message?: string }
    choices?: Array<{ message?: { content?: string | null } }>
  }

  if (status < 200 || status >= 300) {
    throw new Error(body.error?.message || `OpenAI HTTP ${status}`)
  }

  const reply = body.choices?.[0]?.message?.content?.trim() || ''
  if (!reply) throw new Error('OpenAI returned no text')
  return reply
}

async function postOpenAIChat(
  key: string,
  body: string,
  proxy: string,
): Promise<{ status: number; text: string }> {
  const file = join(tmpdir(), `maple-openai-${process.pid}-${Date.now()}.json`)
  await writeFile(file, body, 'utf8')
  try {
    const args = [
      '-sS',
      '-x',
      proxy,
      '--connect-timeout',
      '20',
      '-m',
      '60',
      '-o',
      '-',
      '-w',
      '\n__HTTP_STATUS__%{http_code}',
      '-H',
      `Authorization: Bearer ${key}`,
      '-H',
      'Content-Type: application/json',
      '-X',
      'POST',
      '--data-binary',
      `@${file}`,
      'https://api.openai.com/v1/chat/completions',
    ]
    const text = await new Promise<string>((resolve, reject) => {
      const child = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] })
      const out: Buffer[] = []
      const err: Buffer[] = []
      child.stdout.on('data', (c) => out.push(c))
      child.stderr.on('data', (c) => err.push(c))
      child.on('error', reject)
      child.on('close', (code) => {
        if (code !== 0 && out.length === 0) {
          reject(new Error(Buffer.concat(err).toString('utf8') || `curl exit ${code}`))
          return
        }
        resolve(Buffer.concat(out).toString('utf8'))
      })
    })
    const marker = '\n__HTTP_STATUS__'
    const at = text.lastIndexOf(marker)
    if (at < 0) return { status: 502, text }
    const status = Number(text.slice(at + marker.length)) || 502
    return { status, text: text.slice(0, at) }
  } finally {
    await unlink(file).catch(() => {})
  }
}
