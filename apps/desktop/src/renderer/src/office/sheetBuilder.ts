import 'pixi.js/unsafe-eval'
import { Rectangle, Texture } from 'pixi.js'
import { CHARACTER_CELL_H, CHARACTER_CELL_W } from './types'
import type { Direction, FrameName, CharacterSpec, FrameKey } from './types'
import { ALL_DIRECTIONS, ALL_FRAMES } from './types'
import { BASE_FRAMES, closedEyes, mirror } from './sprites'
import type { Grid } from './sprites'
import { drawGrid } from './symbolColor'

const PAD = 2
const COLUMNS = ALL_FRAMES.length + 1 // idle, walk1, walk2, type1, type2, blink

export interface CharacterSheet {
  frames: Record<Direction, Record<FrameName, Texture>>
  blink: Record<Direction, Texture>
  cellW: number
  cellH: number
}

/**
 * Builds a character sprite sheet on an offscreen canvas and turns it into a
 * single PixiJS texture atlas. Every frame is a sub-rectangle of that atlas.
 */
export function buildCharacterSheet(spec: CharacterSpec): CharacterSheet {
  const cellW = CHARACTER_CELL_W
  const cellH = CHARACTER_CELL_H
  const atlasW = COLUMNS * (cellW + PAD)
  const atlasH = ALL_DIRECTIONS.length * (cellH + PAD)

  const canvas = document.createElement('canvas')
  canvas.width = atlasW
  canvas.height = atlasH
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('2D canvas context unavailable')
  }

  const grids: Record<Direction, Record<FrameName, Grid>> = {
    down: BASE_FRAMES.down,
    up: BASE_FRAMES.up,
    right: BASE_FRAMES.right,
    left: Object.fromEntries(
      Object.entries(BASE_FRAMES.right).map(([name, grid]) => [name, mirror(grid)])
    ) as Record<FrameName, Grid>
  }

  ALL_DIRECTIONS.forEach((direction, rowIndex) => {
    const baseY = rowIndex * (cellH + PAD)
    ALL_FRAMES.forEach((frame, colIndex) => {
      drawGrid(ctx, spec, grids[direction][frame], colIndex * (cellW + PAD), baseY)
    })
    // blink frame lives in the last column
    drawGrid(ctx, spec, closedEyes(grids[direction].idle), COLUMNS * (cellW + PAD) - (cellW + PAD), baseY)
  })

  const atlasTexture = Texture.from(canvas)
  atlasTexture.source.scaleMode = 'nearest'

  const frameAt = (rowIndex: number, colIndex: number): Texture =>
    new Texture({
      source: atlasTexture.source,
      frame: new Rectangle(colIndex * (cellW + PAD), rowIndex * (cellH + PAD), cellW, cellH)
    })

  const frames = {} as Record<Direction, Record<FrameName, Texture>>
  ALL_DIRECTIONS.forEach((direction, rowIndex) => {
    const row = {} as Record<FrameName, Texture>
    ALL_FRAMES.forEach((frame, colIndex) => {
      row[frame] = frameAt(rowIndex, colIndex)
    })
    frames[direction] = row
  })

  const blink = {} as Record<Direction, Texture>
  ALL_DIRECTIONS.forEach((direction, rowIndex) => {
    blink[direction] = frameAt(rowIndex, COLUMNS - 1)
  })

  return { frames, blink, cellW, cellH }
}

export function frameKey(direction: Direction, name: FrameName): FrameKey {
  return { direction, name }
}