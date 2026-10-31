/** Turn a tutor reply into a few short Minecraft chat lines. */
export function toChatLines(text: string, maxLen: number, maxLines: number): string[] {
  const clean = sanitize(text)
  if (!clean) return []

  const words = clean.split(' ')
  const lines: string[] = []
  let current = ''

  const pushWord = (word: string) => {
    const piece = word.length > maxLen ? word.slice(0, maxLen) : word
    if (!current) {
      current = piece
      return
    }
    const next = `${current} ${piece}`
    if (next.length <= maxLen) {
      current = next
      return
    }
    lines.push(current)
    current = piece
  }

  for (const word of words) pushWord(word)
  if (current) lines.push(current)

  if (lines.length <= maxLines) return lines.map(stripSlash).filter(Boolean)

  const kept = lines.slice(0, maxLines)
  const last = kept[maxLines - 1] ?? ''
  const room = Math.max(1, maxLen - 3)
  kept[maxLines - 1] = `${last.slice(0, room).trimEnd()}...`
  return kept.map(stripSlash).filter(Boolean)
}

export function sanitize(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]/g, '')
    .replace(/§./g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Mineflayer sends a leading slash as a server command. Never do that from a reply. */
function stripSlash(line: string): string {
  return line.replace(/^\/+/, '').trim()
}
