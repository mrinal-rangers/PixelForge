import type { DeskSpec, FurnitureSpec, OfficeMap } from './types'

const W = 36
const H = 24

/**
 * The full PixelForge office: Michael's private office, a conference room,
 * open-plan desks for the team, a kitchen, a server room and hallways.
 */
export const OFFICE_MAP: OfficeMap = {
  name: 'Studio Office',
  tileSize: 16,
  width: 36,
  height: 24,
  tiles: buildTiles(),
  rugs: [
    { x: 1, y: 10, w: 24, h: 7 },
    { x: 2, y: 3, w: 6, h: 4 },
    { x: 28, y: 11, w: 7, h: 5 }
  ],
  furniture: buildFurniture(),
  desks: buildDesks(),
  entrance: { x: 17, y: 22 }
}

export function tilePixelX(map: OfficeMap, tileX: number): number {
  return tileX * map.tileSize
}

export function tilePixelY(map: OfficeMap, tileY: number): number {
  return tileY * map.tileSize
}

/** Bottom-centre pixel anchor for a floor tile. */
export function tileAnchorX(map: OfficeMap, tileX: number): number {
  return (tileX + 0.5) * map.tileSize
}

export function tileAnchorY(map: OfficeMap, tileY: number): number {
  return (tileY + 1) * map.tileSize
}

function buildTiles(): string[] {
  const grid: string[][] = []
  for (let y = 0; y < H; y++) {
    grid.push(Array.from({ length: W }, () => (y === 0 || y === 1 || y === 23 ? 'W' : 'F')))
  }
  for (let y = 2; y <= 22; y++) {
    grid[y][0] = 'W'
    grid[y][W - 1] = 'W'
  }

  // Michael's private office (interior x 1..8, y 2..7).
  wallX(grid, 9, 2, 8)
  wallRow(grid, 8, 1, 3)
  wallRow(grid, 8, 6, 8)

  // Conference room (interior x 11..22, y 2..7).
  wallX(grid, 10, 2, 8)
  wallX(grid, 23, 2, 8)
  wallRow(grid, 8, 11, 15)
  wallRow(grid, 8, 18, 22)

  // Kitchen (interior x 28..34, y 10..17).
  wallX(grid, 27, 10, 17)
  wallRow(grid, 9, 28, 30)
  wallRow(grid, 9, 33, 34)
  wallRow(grid, 18, 28, 34)

  // Server room (interior x 28..34, y 19..22), door in the left wall.
  wallX(grid, 27, 19, 19)
  wallX(grid, 27, 21, 22)

  // Entrance door in the bottom wall.
  for (let x = 16; x <= 19; x++) {
    grid[22][x] = 'D'
    grid[23][x] = 'D'
  }

  return grid.map((row) => row.join(''))
}

function wallRow(grid: string[][], y: number, xStart: number, xEnd: number): void {
  for (let x = xStart; x <= xEnd; x++) {
    grid[y][x] = 'W'
  }
}

function wallX(grid: string[][], x: number, yStart: number, yEnd: number): void {
  for (let y = yStart; y <= yEnd; y++) {
    grid[y][x] = 'W'
  }
}

function buildFurniture(): FurnitureSpec[] {
  const list: FurnitureSpec[] = [
    // Top-wall items.
    { kind: 'window', tileX: 2, tileY: 1, layer: 'behind' },
    { kind: 'window', tileX: 5, tileY: 1, layer: 'behind' },
    { kind: 'window', tileX: 12, tileY: 1, layer: 'behind' },
    { kind: 'window', tileX: 14, tileY: 1, layer: 'behind' },
    { kind: 'window', tileX: 20, tileY: 1, layer: 'behind' },
    { kind: 'clock', tileX: 17, tileY: 1, layer: 'behind' },
    { kind: 'noticeboard', tileX: 24, tileY: 1, layer: 'behind' },
    { kind: 'shelf', tileX: 26, tileY: 1, layer: 'behind' },

    // Michael's office.
    { kind: 'plant', tileX: 2, tileY: 3, layer: 'behind' },
    { kind: 'plant', tileX: 7, tileY: 3, layer: 'behind' },

    // Conference room.
    { kind: 'table', tileX: 16, tileY: 4, layer: 'front', variant: 3 },
    { kind: 'chair', tileX: 15, tileY: 3, layer: 'front' },
    { kind: 'chair', tileX: 17, tileY: 3, layer: 'front' },
    { kind: 'chair', tileX: 14, tileY: 5, layer: 'front' },
    { kind: 'chair', tileX: 18, tileY: 5, layer: 'front' },

    // Open-plan chairs (one per desk).
    { kind: 'chair', tileX: 3, tileY: 12, layer: 'front' },
    { kind: 'chair', tileX: 8, tileY: 12, layer: 'front' },
    { kind: 'chair', tileX: 13, tileY: 12, layer: 'front' },
    { kind: 'chair', tileX: 18, tileY: 12, layer: 'front' },
    { kind: 'chair', tileX: 23, tileY: 12, layer: 'front' },
    { kind: 'chair', tileX: 3, tileY: 16, layer: 'front' },
    { kind: 'chair', tileX: 8, tileY: 16, layer: 'front' },
    { kind: 'chair', tileX: 13, tileY: 16, layer: 'front' },
    { kind: 'chair', tileX: 18, tileY: 16, layer: 'front' },
    { kind: 'chair', tileX: 23, tileY: 16, layer: 'front' },

    // Kitchen.
    { kind: 'counter', tileX: 30, tileY: 10, layer: 'front', variant: 4 },
    { kind: 'coffee', tileX: 33, tileY: 13, layer: 'front' },
    { kind: 'plant', tileX: 34, tileY: 16, layer: 'front' },
    { kind: 'table', tileX: 31, tileY: 14, layer: 'front' },

    // Server room.
    { kind: 'rack', tileX: 30, tileY: 20, layer: 'front' },
    { kind: 'rack', tileX: 32, tileY: 20, layer: 'front' },
    { kind: 'plant', tileX: 34, tileY: 21, layer: 'front' },

    // Hallway lounge.
    { kind: 'sofa', tileX: 2, tileY: 18, layer: 'front' },
    { kind: 'plant', tileX: 1, tileY: 10, layer: 'behind' },
    { kind: 'plant', tileX: 26, tileY: 10, layer: 'behind' },
    { kind: 'plant', tileX: 25, tileY: 18, layer: 'behind' },
    { kind: 'watercooler', tileX: 25, tileY: 20, layer: 'front' },
    { kind: 'table', tileX: 4, tileY: 19, layer: 'front' }
  ]
  return list
}

function buildDesks(): DeskSpec[] {
  const desks: DeskSpec[] = [{ kind: 'desk', tileX: 5, tileY: 5, layer: 'front', owner: 0 }]
  const row = [3, 8, 13, 18, 23]
  let owner = 1
  for (const x of row) {
    desks.push({ kind: 'desk', tileX: x, tileY: 11, layer: 'front', owner: owner++ })
  }
  for (const x of row) {
    desks.push({ kind: 'desk', tileX: x, tileY: 15, layer: 'front', owner: owner++ })
  }
  return desks
}