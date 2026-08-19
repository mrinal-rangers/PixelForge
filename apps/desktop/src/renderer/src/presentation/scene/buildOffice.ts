import { GRID_H, GRID_W, OFFICE_MAP, TILE } from './officeMap'
import { OFFICE as C } from './officePalette'
import { makeDraw } from './pixel'
import type { Draw } from './pixel'
import { drawFurniture } from './furniture'

/** Canvas size: the 576x576 building plus a 16px dark margin on every side. */
export const CANVAS_W = GRID_W * TILE + 32
export const CANVAS_H = GRID_H * TILE + 32
export const MARGIN = 16

export interface ScreenRect {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface DeskLight {
  id: number
  x: number
  y: number
}

export interface OfficeBuildResult {
  layerA: HTMLCanvasElement
  layerB: HTMLCanvasElement
  /** Animated screen rectangles (canvas coords). */
  screens: ScreenRect[]
  /** Worker desk status-light positions (canvas coords). */
  deskLights: DeskLight[]
}

const FLOOR_COLORS: Record<string, [string, string]> = {
  F: [C.floorBase, C.floorLine],
  S: [C.serverFloor, C.serverLine],
  L: [C.labFloor, C.labLine],
  M: [C.mgrFloor, C.mgrLine],
  A: [C.archiveFloor, C.archiveLine],
  Q: [C.waitFloor, C.waitLine],
  T: [C.testFloor, C.testLine]
}

function isPerimeterWall(x: number, y: number): boolean {
  return x < 3 || x > 68 || y < 3 || y > 68
}

/** Tiles that should render above the characters (south walls of rooms). */
export function isFrontWallTile(x: number, y: number): boolean {
  if (y === 19 && OFFICE_MAP.tiles[y]?.[x] === 'W') {
    return true
  }
  if (y >= 69 && OFFICE_MAP.tiles[y]?.[x] === 'W') {
    return true
  }
  return false
}

function drawFloorTile(d: Draw, x: number, y: number, code: string): void {
  const px = x * TILE
  const py = y * TILE
  if (code === 'D') {
    d.rect(px, py, TILE, TILE, C.doorMat)
    d.hline(px, py, TILE, '#57627a')
    d.hline(px, py + TILE - 1, TILE, '#3f4857')
    return
  }
  const pair = FLOOR_COLORS[code] ?? FLOOR_COLORS.F
  const [base, line] = pair
  d.rect(px, py, TILE, TILE, base)
  d.rect(px + TILE - 1, py, 1, TILE, line)
  d.rect(px, py + TILE - 1, TILE, 1, line)
  d.rect(px, py, 1, 1, line)
}

function drawWallTile(d: Draw, x: number, y: number, tiles: string[]): void {
  const px = x * TILE
  const py = y * TILE
  const outer = isPerimeterWall(x, y)
  const fill = outer ? C.wallOuter : C.wallInner
  const shade = outer ? C.wallOuterShade : C.wallInnerShade
  d.rect(px, py, TILE, TILE, fill)
  const isWall = (cx: number, cy: number): boolean =>
    cx < 0 || cy < 0 || cx >= GRID_W || cy >= GRID_H ? false : tiles[cy]?.[cx] === 'W'
  if (!isWall(x, y - 1)) d.rect(px, py, TILE, 1, C.outline)
  if (!isWall(x, y + 1)) d.rect(px, py + TILE - 1, TILE, 1, C.outline)
  if (!isWall(x - 1, y)) d.rect(px, py, 1, TILE, C.outline)
  if (!isWall(x + 1, y)) d.rect(px + TILE - 1, py, 1, TILE, C.outline)
  if (outer) {
    d.hline(px + 1, py + 1, TILE - 2, shade)
  } else {
    d.hline(px + 1, py + 1, TILE - 2, shade)
  }
}

export function buildOffice(): OfficeBuildResult {
  const { tiles, furniture } = OFFICE_MAP

  const canvasA = document.createElement('canvas')
  canvasA.width = CANVAS_W
  canvasA.height = CANVAS_H
  const ctxA = canvasA.getContext('2d')
  if (!ctxA) {
    throw new Error('2D canvas context unavailable for office layer A')
  }
  const da = makeDraw(ctxA)

  const canvasB = document.createElement('canvas')
  canvasB.width = CANVAS_W
  canvasB.height = CANVAS_H
  const ctxB = canvasB.getContext('2d')
  if (!ctxB) {
    throw new Error('2D canvas context unavailable for office layer B')
  }
  const db = makeDraw(ctxB)

  // ---- Layer A ---------------------------------------------------------------
  ctxA.fillStyle = C.margin
  ctxA.fillRect(0, 0, CANVAS_W, CANVAS_H)

  // Floor tiles.
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const code = tiles[y][x]
      if (code === 'W') {
        continue
      }
      drawFloorTile(da, x, y, code)
    }
  }

  // Rugs sit on the floor.
  for (const item of furniture) {
    if (item.kind === 'rug') {
      drawFurniture(da, item.kind, item.x, item.y, item.w ?? 16, item.h ?? 16, 'down')
    }
  }

  // Walls behind the characters.
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (tiles[y][x] !== 'W' || isFrontWallTile(x, y)) {
        continue
      }
      drawWallTile(da, x, y, tiles)
    }
  }

  // Furniture behind the characters.
  for (const item of furniture) {
    if (item.layer === 'front') {
      continue
    }
    drawFurniture(da, item.kind, item.x, item.y, item.w ?? 16, item.h ?? 16, item.facing ?? 'down', item.variant ?? 0)
  }

  // ---- Layer B ---------------------------------------------------------------
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (tiles[y][x] === 'W' && isFrontWallTile(x, y)) {
        drawWallTile(db, x, y, tiles)
      }
    }
  }
  for (const item of furniture) {
    if (item.layer === 'front') {
      drawFurniture(db, item.kind, item.x, item.y, item.w ?? 16, item.h ?? 16, item.facing ?? 'down', item.variant ?? 0)
    }
  }

  // ---- Animated-screen + desk-light metadata ---------------------------------
  const screens: ScreenRect[] = []
  const deskLights: DeskLight[] = []
  for (const item of furniture) {
    const m = MARGIN
    if (item.kind === 'workerDesk') {
      const w = item.w ?? 24
      const h = item.h ?? 16
      const mx = item.x + 16 + m
      const my = item.y - 6 + m
      screens.push({ id: `desk${item.variant ?? 0}`, x: mx, y: my, w: 12, h: 14 })
      deskLights.push({ id: item.variant ?? 0, x: item.x + w - 6 + m, y: item.y + h - 3 + m })
    } else if (item.kind === 'testDesk') {
      const mx = item.x + (item.w ?? 32) / 2 - 6 + m
      const my = item.y - 4 + m
      screens.push({ id: `test${item.variant ?? 0}`, x: mx, y: my, w: 12, h: 12 })
    } else if (item.kind === 'diagScreen') {
      screens.push({ id: 'lab', x: item.x + m, y: item.y + m, w: item.w ?? 16, h: item.h ?? 16 })
    } else if (item.kind === 'serverScreen') {
      screens.push({ id: 'server', x: item.x + m, y: item.y + m, w: item.w ?? 16, h: item.h ?? 16 })
    } else if (item.kind === 'diagConsole') {
      screens.push({ id: 'console', x: item.x + 6 + m, y: item.y + 2 + m, w: (item.w ?? 32) - 12, h: 12 })
    } else if (item.kind === 'wallConsole') {
      screens.push({ id: 'wallconsole', x: item.x + 2 + m, y: item.y + 4 + m, w: (item.w ?? 16) - 4, h: 24 })
    }
  }

  return { layerA: canvasA, layerB: canvasB, screens, deskLights }
}