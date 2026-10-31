import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// The package is CommonJS (`module.exports = { ... }`). Node's ESM loader does
// not expose those names as named exports, so load it the CommonJS way.
const loaded = require('mineflayer-pathfinder') as typeof import('mineflayer-pathfinder')

export const pathfinder = loaded.pathfinder
export const Movements = loaded.Movements
export const goals = loaded.goals
