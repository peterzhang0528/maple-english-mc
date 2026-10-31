export interface BlockCell {
  x: number
  y: number
  z: number
  name: string
}

export interface Terrain {
  cells: BlockCell[]
  names: Map<string, string>
  solids: Set<string>
  spawn: { x: number; y: number; z: number }
  maple: { x: number; y: number; z: number }
}

const WIDTH = 28

export function blockKey(x: number, y: number, z: number): string {
  return `${x}|${y}|${z}`
}

export function buildTerrain(): Terrain {
  const cells: BlockCell[] = []
  const place = (x: number, y: number, z: number, name: string) => {
    cells.push({ x, y, z, name })
  }

  const ground = new Map<string, number>()
  for (let x = 0; x < WIDTH; x += 1) {
    for (let z = 0; z < WIDTH; z += 1) {
      const wave = Math.sin(x * 0.42) * 0.9 + Math.cos(z * 0.33) * 0.75
      let top = 3 + Math.max(0, Math.round(wave))
      const pond = x >= 16 && x <= 22 && z >= 15 && z <= 21
      const beach = x >= 14 && x <= 24 && z >= 13 && z <= 23
      if (pond) top = 2
      else if (beach && top > 3) top = 3
      ground.set(`${x}|${z}`, top)
      for (let y = 0; y <= top; y += 1) {
        let name = 'stone'
        if (pond && y === top) name = 'water'
        else if (pond && y === top - 1) name = 'sand'
        else if (beach && y === top) name = 'sand'
        else if (y === top) name = 'grass_block'
        else if (y > top - 3) name = 'dirt'
        else if ((x + z + y) % 11 === 0) name = 'coal_ore'
        place(x, y, z, name)
      }
      if (pond) place(x, 3, z, 'water')
    }
  }

  const treeAt = (x: number, z: number) => {
    const top = ground.get(`${x}|${z}`)
    if (top == null || top < 3) return
    for (let i = 1; i <= 4; i += 1) place(x, top + i, z, 'oak_log')
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dz = -2; dz <= 2; dz += 1) {
        for (let dy = 3; dy <= 5; dy += 1) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy === 3) continue
          if (dx === 0 && dz === 0 && dy < 5) continue
          place(x + dx, top + dy, z + dz, 'oak_leaves')
        }
      }
    }
  }

  treeAt(5, 16)
  treeAt(11, 18)
  treeAt(20, 8)
  treeAt(7, 6)

  const campTop = ground.get('9|8') ?? 4
  place(9, campTop + 1, 8, 'crafting_table')
  place(10, campTop + 1, 8, 'furnace')
  place(8, campTop + 1, 9, 'chest')
  for (let i = 0; i < 6; i += 1) {
    const pathTop = ground.get(`${9}|${9 + i}`)
    if (pathTop != null && pathTop >= 3) place(9, pathTop + 1, 9 + i, 'oak_planks')
  }

  const names = new Map<string, string>()
  for (const cell of cells) names.set(blockKey(cell.x, cell.y, cell.z), cell.name)
  const solids = new Set<string>()
  for (const [key, name] of names) {
    if (name !== 'water' && name !== 'oak_leaves') solids.add(key)
  }

  const spawnGround = ground.get('8|6') ?? 4
  return {
    cells,
    names,
    solids,
    spawn: { x: 8.5, y: spawnGround + 1, z: 6.5 },
    maple: { x: 11.2, y: (ground.get('11|8') ?? spawnGround) + 1, z: 8.4 },
  }
}

export function surfaceFeetY(terrain: Terrain, x: number, z: number): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  for (let y = 12; y >= 0; y -= 1) {
    if (terrain.solids.has(blockKey(ix, y, iz))) return y + 1
  }
  return 1
}

export function bodyHitsSolid(
  terrain: Terrain,
  feetX: number,
  feetY: number,
  feetZ: number,
): boolean {
  const radius = 0.28
  const height = 1.7
  const minX = Math.floor(feetX - radius)
  const maxX = Math.floor(feetX + radius)
  const minY = Math.floor(feetY + 0.08)
  const maxY = Math.floor(feetY + height)
  const minZ = Math.floor(feetZ - radius)
  const maxZ = Math.floor(feetZ + radius)
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        if (terrain.solids.has(blockKey(x, y, z))) return true
      }
    }
  }
  return false
}

export function nearbyBlockNames(terrain: Terrain, x: number, y: number, z: number): string[] {
  const counts = new Map<string, number>()
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  for (let dx = -4; dx <= 4; dx += 1) {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dz = -4; dz <= 4; dz += 1) {
        const name = terrain.names.get(blockKey(ix + dx, iy + dy, iz + dz))
        if (!name || name === 'water') continue
        counts.set(name, (counts.get(name) ?? 0) + 1)
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name]) => name)
}

export interface BlockHit {
  x: number
  y: number
  z: number
  name: string
}

/** Grid DDA. Returns the first solid or leaf block along the ray. */
export function raycastBlock(
  terrain: Terrain,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDistance = 6,
): BlockHit | null {
  const length = Math.hypot(dx, dy, dz) || 1
  dx /= length
  dy /= length
  dz /= length
  let x = Math.floor(ox)
  let y = Math.floor(oy)
  let z = Math.floor(oz)
  const stepX = dx >= 0 ? 1 : -1
  const stepY = dy >= 0 ? 1 : -1
  const stepZ = dz >= 0 ? 1 : -1
  const tDeltaX = dx === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dx)
  const tDeltaY = dy === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dy)
  const tDeltaZ = dz === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dz)
  let tMaxX = dx === 0 ? Number.POSITIVE_INFINITY : (dx > 0 ? x + 1 - ox : ox - x) * tDeltaX
  let tMaxY = dy === 0 ? Number.POSITIVE_INFINITY : (dy > 0 ? y + 1 - oy : oy - y) * tDeltaY
  let tMaxZ = dz === 0 ? Number.POSITIVE_INFINITY : (dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ
  let traveled = 0
  for (let i = 0; i < 48; i += 1) {
    const name = terrain.names.get(blockKey(x, y, z))
    if (name && name !== 'water' && traveled > 0.05) return { x, y, z, name }
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      x += stepX
      traveled = tMaxX
      tMaxX += tDeltaX
    } else if (tMaxY <= tMaxZ) {
      y += stepY
      traveled = tMaxY
      tMaxY += tDeltaY
    } else {
      z += stepZ
      traveled = tMaxZ
      tMaxZ += tDeltaZ
    }
    if (traveled > maxDistance) return null
  }
  return null
}
