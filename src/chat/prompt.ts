/**
 * Kept stable for a process lifetime. Difficulty and world facts travel in the
 * user message so we never edit the system prefix between Claude turns.
 * Opus 5.5 ties thinking blocks to an unchanged prefix; we store text only.
 *
 * Persona text lives in ./persona.ts. SYSTEM_PROMPT stays Maple for older imports.
 */
import { loadPersona, systemPrompt } from './persona.js'

export const SYSTEM_PROMPT = systemPrompt('maple')

/** Process-lifetime prompt for the active companion persona. */
export function activeSystemPrompt(env: NodeJS.ProcessEnv = process.env): string {
  return systemPrompt(loadPersona(env))
}
