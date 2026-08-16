import type { SessionStatus } from '@shared/types'

/** Tile codes used in the flat map grid (row-major). */
export type TileCode =
  | 'W' // wall
  | 'F' // plain floor
  | 'R' // rug tile (floor decoration)
  | 'D' // door mat / entrance tile

export type FurnitureLayer = 'behind' | 'front'

export type FurnitureKind =
  | 'desk'
  | 'chair'
  | 'plant'
  | 'noticeboard'
  | 'table'
  | 'sofa'
  | 'window'
  | 'shelf'
  | 'counter'
  | 'coffee'
  | 'watercooler'
  | 'rack'
  | 'clock'

export interface FurnitureSpec {
  kind: FurnitureKind
  /** Bottom-centre anchor tile (depth sorting uses this row). */
  tileX: number
  tileY: number
  layer: FurnitureLayer
  /** Width in tiles for table/counter variants. */
  variant?: number
}

export interface DeskSpec extends FurnitureSpec {
  kind: 'desk'
  owner: number
}

export interface OfficeMap {
  name: string
  tileSize: number
  width: number
  height: number
  /** Row-major tile grid, each char a TileCode. */
  tiles: string[]
  /** Carpet rectangles in tile coords, drawn above the floor. */
  rugs: { x: number; y: number; w: number; h: number }[]
  /** Static furniture placed over the floor. */
  furniture: FurnitureSpec[]
  /** Agent stations, one per future coworker. */
  desks: DeskSpec[]
  /** Tile where characters enter the office. */
  entrance: { x: number; y: number }
}

/** A single named animation frame in the character sheet. */
export type Direction = 'down' | 'up' | 'left' | 'right'
export type FrameName = 'idle' | 'walk1' | 'walk2' | 'type1' | 'type2'

export interface FrameKey {
  direction: Direction
  name: FrameName
}

export const ALL_DIRECTIONS: Direction[] = ['down', 'up', 'right', 'left']
export const ALL_FRAMES: FrameName[] = ['idle', 'walk1', 'walk2', 'type1', 'type2']

/** Combination of appearance options used to generate a character. */
export interface CharacterSpec {
  name: string
  role: string
  hairColor: string
  hairHighlight: string
  skinTone: string
  skinShadow: string
  shirtColor: string
  shirtShadow: string
  pantsColor: string
  pantsShadow: string
  shoesColor: string
  outline: string
  eyeColor: string
}

/**
 * High level behaviour the character should show right now, derived from the
 * real session state. The office ticker turns this into animation + movement.
 */
export type AgentVisualState =
  | 'entering'
  | 'walking'
  | 'working'
  | 'idle'
  | 'attention'
  | 'error'
  | 'leaving'
  | 'offline'

export interface OfficeAgentState {
  id: string
  name: string
  role: string
  cliId: string
  status: SessionStatus
  /** Unix ms of the most recent terminal output. */
  lastActivityAt: number | null
  /** Heuristic: the last output ended with something that looks like a prompt. */
  promptPending: boolean
}

export const CHARACTER_CELL_W = 16
export const CHARACTER_CELL_H = 26