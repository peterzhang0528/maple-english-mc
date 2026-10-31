import minecraftData from 'minecraft-data'
import type { Difficulty } from '../config.js'

const PINNED_DATA_VERSION = '1.21.4'

const ALIASES: Record<string, string> = {
  pickaxe: 'wooden_pickaxe',
  'wood pickaxe': 'wooden_pickaxe',
  'wooden pickaxe': 'wooden_pickaxe',
  'stone pickaxe': 'stone_pickaxe',
  'iron pickaxe': 'iron_pickaxe',
  'diamond pickaxe': 'diamond_pickaxe',
  'gold pickaxe': 'golden_pickaxe',
  'golden pickaxe': 'golden_pickaxe',
  'netherite pickaxe': 'netherite_pickaxe',
  'crafting table': 'crafting_table',
  table: 'crafting_table',
  workbench: 'crafting_table',
  stick: 'stick',
  sticks: 'stick',
  torch: 'torch',
  torches: 'torch',
  furnace: 'furnace',
  chest: 'chest',
  sword: 'wooden_sword',
  'wooden sword': 'wooden_sword',
  'stone sword': 'stone_sword',
  'iron sword': 'iron_sword',
  axe: 'wooden_axe',
  'wooden axe': 'wooden_axe',
  'stone axe': 'stone_axe',
  planks: 'oak_planks',
  'oak planks': 'oak_planks',
  'oak log': 'oak_log',
  log: 'oak_log',
  bed: 'white_bed',
  boat: 'oak_boat',
  door: 'oak_door',
  bread: 'bread',
  bowl: 'bowl',
}

const HINTS: Record<string, { beginner: string; intermediate: string }> = {
  wooden_pickaxe: {
    beginner: 'A wooden pickaxe is your first mining tool. It mines stone.',
    intermediate: 'A wooden pickaxe mines stone and coal, but not iron ore. Make a stone one next.',
  },
  stone_pickaxe: {
    beginner: 'A stone pickaxe mines iron ore. It is better than wood.',
    intermediate: 'A stone pickaxe is the first pickaxe that can mine iron ore.',
  },
  iron_pickaxe: {
    beginner: 'An iron pickaxe is strong. It can mine diamonds.',
    intermediate: 'An iron pickaxe mines diamonds, gold, and redstone. Netherite comes much later.',
  },
  crafting_table: {
    beginner: 'A crafting table lets you make tools.',
    intermediate: 'A crafting table opens a 3 by 3 grid. You need one before you can make a pickaxe.',
  },
  stick: {
    beginner: 'Sticks are thin wood. Tools need sticks.',
    intermediate: 'Sticks are the handles for tools and the base of a torch.',
  },
  torch: {
    beginner: 'A torch makes light.',
    intermediate: 'Torches light caves. Monsters usually do not spawn next to them.',
  },
  furnace: {
    beginner: 'A furnace cooks food and ore.',
    intermediate: 'A furnace smelts ore into ingots and cooks raw food.',
  },
  oak_planks: {
    beginner: 'Oak planks are wood boards from an oak log.',
    intermediate: 'One oak log makes four oak planks. Planks craft tables, sticks, and wood tools.',
  },
}

export interface CraftingLesson {
  itemName: string
  displayName: string
  summary: string
  beginner: string
  intermediate: string
}

interface RawRecipe {
  inShape?: unknown[][]
  ingredients?: unknown[]
  result?: { id?: number; count?: number }
}

const cache = new Map<string, MinecraftData>()

type MinecraftData = ReturnType<typeof minecraftData>

function supportedPcVersions(): string[] {
  const factory = minecraftData as typeof minecraftData & {
    supportedVersions?: { pc?: string[] }
  }
  return factory.supportedVersions?.pc ?? []
}

export function dataForVersion(version: string): MinecraftData {
  const supported = new Set(supportedPcVersions())
  const use = supported.has(version) ? version : PINNED_DATA_VERSION
  const cached = cache.get(use)
  if (cached) return cached
  const data = minecraftData(use)
  cache.set(use, data)
  return data
}

export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function resolveItemName(query: string, version = PINNED_DATA_VERSION): string | null {
  const normalized = normalizeQuery(query)
  if (!normalized) return null
  const alias = ALIASES[normalized]
  const data = dataForVersion(version)
  if (alias && data.itemsByName[alias]) return alias
  const underscored = normalized.replaceAll(' ', '_')
  if (data.itemsByName[underscored]) return underscored
  const stripped = normalized.replace(/^(a|an|the)\s+/, '')
  if (ALIASES[stripped] && data.itemsByName[ALIASES[stripped]]) return ALIASES[stripped]
  return null
}

export function explainCraft(query: string, version = PINNED_DATA_VERSION): CraftingLesson | null {
  const itemName = resolveItemName(query, version)
  if (!itemName) return null
  const data = dataForVersion(version)
  const item = data.itemsByName[itemName]
  if (!item) return null
  const recipes = (data.recipes[item.id] ?? []) as RawRecipe[]
  if (recipes.length === 0) return null
  const recipe = pickRecipe(data, recipes)
  return lessonFrom(data, item.name, item.displayName || pretty(item.name), recipe)
}

export function lessonText(lesson: CraftingLesson, difficulty: Difficulty): string {
  return difficulty === 'beginner' ? lesson.beginner : lesson.intermediate
}

function lessonFrom(data: MinecraftData, itemName: string, displayName: string, recipe: RawRecipe): CraftingLesson {
  const grid = recipe.inShape
    ? describeShape(data, recipe.inShape)
    : describeShapeless(data, recipe.ingredients ?? [])
  const count = recipe.result?.count ?? 1
  const makes = count === 1 ? '' : ` It makes ${count}.`
  const hint = HINTS[itemName]
  const summary = `${displayName}.${makes} ${grid}`.replace(/\s+/g, ' ').trim()
  return {
    itemName,
    displayName,
    summary,
    beginner: `${hint?.beginner ?? `${displayName} is a Minecraft item.`} ${grid}${makes}`.replace(/\s+/g, ' ').trim(),
    intermediate: `${hint?.intermediate ?? `${displayName} is crafted like this.`} ${grid}${makes}`
      .replace(/\s+/g, ' ')
      .trim(),
  }
}

function pickRecipe(data: MinecraftData, recipes: RawRecipe[]): RawRecipe {
  const oak = data.itemsByName.oak_planks?.id
  const oakLog = data.itemsByName.oak_log?.id
  const stick = data.itemsByName.stick?.id
  let best = recipes[0] as RawRecipe
  let bestScore = -Infinity
  for (const recipe of recipes) {
    const ids = ingredientIds(recipe)
    let score = 0
    if (oak != null && ids.includes(oak)) score += 100
    if (oakLog != null && ids.includes(oakLog)) score += 80
    if (stick != null && ids.includes(stick)) score += 10
    score -= ids.length
    if (ids.some((id) => /pale|cherry|bamboo|crimson|warped|mangrove/.test(itemKey(data, id)))) score -= 40
    if (score > bestScore) {
      bestScore = score
      best = recipe
    }
  }
  return best
}

function describeShape(data: MinecraftData, shape: unknown[][]): string {
  const rows = shape.map((row, index) => {
    const cells = (row ?? []).map((cell) => {
      const id = cellId(cell)
      return id == null ? 'empty' : itemLabel(data, id)
    })
    return `row ${index + 1}: ${cells.join(', ')}`
  })
  return `Crafting grid — ${rows.join('; ')}.`
}

function describeShapeless(data: MinecraftData, ingredients: unknown[]): string {
  const labels = ingredients
    .map((cell) => cellId(cell))
    .filter((id): id is number => id != null)
    .map((id) => itemLabel(data, id))
  if (labels.length === 0) return 'Put the items in a crafting grid.'
  if (labels.length === 1) return `Put one ${labels[0]} anywhere in a crafting grid.`
  return `Put these anywhere in a crafting grid: ${labels.join(', ')}.`
}

function ingredientIds(recipe: RawRecipe): number[] {
  const ids: number[] = []
  for (const row of recipe.inShape ?? []) {
    for (const cell of row ?? []) {
      const id = cellId(cell)
      if (id != null) ids.push(id)
    }
  }
  for (const cell of recipe.ingredients ?? []) {
    const id = cellId(cell)
    if (id != null) ids.push(id)
  }
  return ids
}

function cellId(cell: unknown): number | null {
  if (typeof cell === 'number') return cell
  if (Array.isArray(cell)) return cellId(cell[0])
  if (cell && typeof cell === 'object' && 'id' in cell && typeof cell.id === 'number') return cell.id
  return null
}

function itemLabel(data: MinecraftData, id: number): string {
  return data.items[id]?.displayName || pretty(itemKey(data, id))
}

function itemKey(data: MinecraftData, id: number): string {
  return data.items[id]?.name ?? `item ${id}`
}

function pretty(name: string): string {
  return name.replaceAll('_', ' ')
}
