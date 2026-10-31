import 'dotenv/config'
import { main } from './bot/run.js'

main().catch((error: unknown) => {
  console.error(`[maple] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
