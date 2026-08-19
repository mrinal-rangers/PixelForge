import type { SessionStatus } from '@shared/types'

/**
 * Tile codes used in the flat map grid (row-major). Each char describes one
 * 8x8 floor tile of the office.
 */
export type TileCode =
  | 'W' // wall
  | 'F' // standard slate floor (central area, worker pods)
  | 'S' // server room floor (darker blue-grey)
  | 'L' // research lab floor (cool grey-blue)
  | 'M' // manager office floor (medium blue-grey)
  | 'R' // manager office rug tile (pale circle)
  | 'A' // memory archive floor (warmer dark blue-grey)
  | 'Q' // waiting room floor (muted blue-grey)
  | 'T' // testing room floor (darker technical grey)
  | 'D' // door mat / entrance tile (walkable)

/** Layer the furniture is baked into relative to characters. */
export type FurnitureLayer = 'behind' | 'front'

export type FurnitureKind =
  | 'serverRack'
  | 'serverScreen'
  | 'utilityDevice'
  | 'workbench'
  | 'stool'
  | 'bottles'
  | 'toolRack'
  | 'labMachine'
  | 'diagScreen'
  | 'diagConsole'
  | 'sofa'
  | 'managerDesk'
  | 'officeChair'
  | 'guestChair'
  | 'cabinet'
  | 'waterDispenser'
  | 'pottedPlant'
  | 'commDevice'
  | 'rug'
  | 'conferenceTable'
  | 'conferenceChair'
  | 'planter'
  | 'planningBoard'
  | 'workerDesk'
  | 'workerChair'
  | 'partition'
  | 'bookshelf'
  | 'vertShelf'
  | 'readingTable'
  | 'archiveBox'
  | 'docCabinet'
  | 'waitingSofa'
  | 'waterCooler'
  | 'wallConsole'
  | 'noticePanel'
  | 'testDesk'
  | 'testInstrument'
  | 'testWorkbench'
  | 'lamp'
  | 'papers'
  | 'box'
  | 'notebook'
  | 'tablet'
  | 'mug'
  | 'notes'
  | 'device'

export interface FurnitureSpec {
  kind: FurnitureKind
  /** Top-left corner in office-local pixels. */
  x: number
  y: number
  /** Width/height in pixels (defaults from the kind when omitted). */
  w?: number
  h?: number
  layer: FurnitureLayer
  /** Seated objects and chairs never block pathfinding. */
  solid?: boolean
  /** Direction the chair/sofa faces into the room. */
  facing?: 'up' | 'down' | 'left' | 'right'
  /** Numeric variant used to key animated screens/desk lights. */
  variant?: number
}

export type StationId =
  | 'manager_desk'
  | 'conference_table'
  | 'worker_desk_1'
  | 'worker_desk_2'
  | 'worker_desk_3'
  | 'worker_desk_4'
  | 'research_bench'
  | 'diagnostic_console'
  | 'server_rack'
  | 'memory_shelf'
  | 'memory_table'
  | 'ask_me_sofa'
  | 'test_desk_1'
  | 'test_desk_2'
  | 'test_workbench'

export interface StationDef {
  id: StationId
  /** Standing interaction position (bottom-centre anchor) in office pixels. */
  x: number
  y: number
  /** Direction the character faces while interacting. */
  facing: Direction
  /** Optional seated position (bottom-centre anchor). */
  seat?: { x: number; y: number }
  /** Optional facing direction when seated. */
  seatFacing?: Direction
  /** Interaction footprint (px) used for click targeting. */
  w: number
  h: number
}

export interface OfficeMap {
  name: string
  /** Base pixel size of one floor tile. */
  tileSize: number
  /** Office size in tiles. */
  width: number
  height: number
  /** Row-major tile grid, each char a TileCode. */
  tiles: string[]
  /** Furniture placements (office-local pixel coords). */
  furniture: FurnitureSpec[]
  /** Interactive stations with walk targets. */
  stations: StationDef[]
  /** Tile where characters enter the office. */
  entrance: { x: number; y: number }
}

export function tilePixelX(map: OfficeMap, tileX: number): number {
  return tileX * map.tileSize
}

export function tilePixelY(map: OfficeMap, tileY: number): number {
  return tileY * map.tileSize
}

export function tileAnchorX(map: OfficeMap, tileX: number): number {
  return (tileX + 0.5) * map.tileSize
}

export function tileAnchorY(map: OfficeMap, tileY: number): number {
  return (tileY + 1) * map.tileSize
}

/** A single named animation frame in the character sheet. */
export type Direction = 'down' | 'up' | 'left' | 'right'
export type FrameName = 'idle' | 'walk1' | 'walk2' | 'type1' | 'type2' | 'sit'

export interface FrameKey {
  direction: Direction
  name: FrameName
}

export const ALL_DIRECTIONS: Direction[] = ['down', 'up', 'right', 'left']
export const ALL_FRAMES: FrameName[] = ['idle', 'walk1', 'walk2', 'type1', 'type2', 'sit']

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