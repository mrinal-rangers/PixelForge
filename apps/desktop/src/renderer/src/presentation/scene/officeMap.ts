import type { FurnitureSpec, OfficeMap, StationDef, TileCode } from './types'

/**
 * The PixelForge HQ — a top-down research-lab / tech-company floor.
 *
 * Layout (72x72 tiles @ 8px):
 *   top strip   : server room (left), research lab (centre), manager office (right)
 *   middle strip: central planning area (left) + four coworker pods (right)
 *   bottom strip: memory archive (left), waiting/Ask Me room (centre), testing room (right)
 *
 * Interior starts at tile 3 after a 3-tile-thick exterior wall. Every room has
 * a doorway at least three tiles (24px) wide so characters can path around.
 */

export const TILE = 8
export const GRID_W = 72
export const GRID_H = 72

const P = (tileX: number, tileY: number): [number, number] => [tileX * TILE, tileY * TILE]

function emptyGrid(): string[][] {
  const grid: string[][] = []
  for (let y = 0; y < GRID_H; y++) {
    const row: string[] = []
    for (let x = 0; x < GRID_W; x++) {
      const exterior = x < 3 || x > 68 || y < 3 || y > 68
      row.push(exterior ? 'W' : 'F')
    }
    grid.push(row)
  }
  return grid
}

function fill(grid: string[][], x0: number, y0: number, x1: number, y1: number, code: TileCode): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      grid[y][x] = code
    }
  }
}

function wallRow(grid: string[][], y: number, x0: number, x1: number): void {
  fill(grid, x0, y, x1, y, 'W')
}

function wallCol(grid: string[][], x: number, y0: number, y1: number): void {
  fill(grid, x, y0, x, y1, 'W')
}

function doorRow(grid: string[][], y: number, x0: number, x1: number): void {
  fill(grid, x0, y, x1, y, 'D')
}

function buildTiles(): string[] {
  const grid = emptyGrid()

  // ---- Top rooms -----------------------------------------------------------
  // Server room (upper-left).
  fill(grid, 4, 3, 16, 18, 'S')
  wallCol(grid, 17, 3, 19)
  doorRow(grid, 19, 8, 10)
  wallRow(grid, 19, 3, 7)
  wallRow(grid, 19, 11, 17)

  // Research lab (upper-centre), double doors in the lower-left of its wall.
  fill(grid, 18, 3, 43, 18, 'L')
  wallCol(grid, 44, 3, 19)
  doorRow(grid, 19, 18, 20)
  wallRow(grid, 19, 21, 43)

  // Manager office (upper-right).
  fill(grid, 45, 3, 68, 18, 'M')
  doorRow(grid, 19, 57, 59)
  wallRow(grid, 19, 45, 56)
  wallRow(grid, 19, 60, 68)

  // ---- Bottom rooms --------------------------------------------------------
  // Memory archive (lower-left).
  fill(grid, 4, 46, 23, 68, 'A')
  wallCol(grid, 24, 46, 68)
  doorRow(grid, 46, 9, 11)
  wallRow(grid, 46, 3, 8)
  wallRow(grid, 46, 12, 24)

  // Waiting / Ask Me room (lower-centre).
  fill(grid, 26, 46, 44, 68, 'Q')
  wallCol(grid, 25, 46, 68)
  wallCol(grid, 45, 46, 68)
  doorRow(grid, 46, 34, 36)
  wallRow(grid, 46, 25, 33)
  wallRow(grid, 46, 37, 45)

  // Testing room (lower-right).
  fill(grid, 46, 46, 68, 68, 'T')
  doorRow(grid, 46, 61, 63)
  wallRow(grid, 46, 46, 60)
  wallRow(grid, 46, 64, 68)

  // ---- Entrance -------------------------------------------------------------
  // Exterior door in the middle of the building's south wall.
  fill(grid, 34, 69, 36, 71, 'D')

  return grid.map((row) => row.join(''))
}

function buildFurniture(): FurnitureSpec[] {
  const list: FurnitureSpec[] = []

  // ---- Server room ----------------------------------------------------------
  const [r1x, r1y] = P(5, 4)
  const [r2x, r2y] = P(8, 4)
  list.push(
    { kind: 'serverRack', x: r1x, y: r1y, w: 24, h: 52, layer: 'behind' },
    { kind: 'serverRack', x: r2x, y: r2y, w: 24, h: 52, layer: 'behind' },
    // Monitoring screen above the gap between the racks.
    { kind: 'serverScreen', x: 56, y: 24, w: 16, h: 14, layer: 'behind' }
  )
  const [ud1x, ud1y] = P(5, 15)
  const [ud2x, ud2y] = P(12, 15)
  list.push(
    { kind: 'utilityDevice', x: ud1x, y: ud1y, w: 24, h: 14, layer: 'behind' },
    { kind: 'utilityDevice', x: ud2x, y: ud2y, w: 24, h: 14, layer: 'behind' }
  )

  // ---- Research lab ---------------------------------------------------------
  const [wbx, wby] = P(20, 3)
  list.push(
    { kind: 'workbench', x: wbx, y: wby, w: 176, h: 20, layer: 'behind' },
    { kind: 'bottles', x: P(23, 3)[0], y: P(23, 3)[1], w: 16, h: 12, layer: 'behind' },
    { kind: 'bottles', x: P(29, 3)[0], y: P(29, 3)[1], w: 16, h: 12, layer: 'behind' },
    { kind: 'toolRack', x: P(35, 3)[0], y: P(35, 3)[1], w: 16, h: 16, layer: 'behind' },
    { kind: 'labMachine', x: P(26, 3)[0], y: P(26, 3)[1], w: 20, h: 16, layer: 'behind' },
    { kind: 'diagScreen', x: P(40, 3)[0], y: P(40, 3)[1], w: 18, h: 14, layer: 'behind' },
    { kind: 'stool', x: P(23, 6)[0], y: P(23, 6)[1], w: 14, h: 12, layer: 'behind' },
    { kind: 'stool', x: P(29, 6)[0], y: P(29, 6)[1], w: 14, h: 12, layer: 'behind' },
    { kind: 'stool', x: P(35, 6)[0], y: P(35, 6)[1], w: 14, h: 12, layer: 'behind' }
  )
  // Freestanding diagnostic console just outside the lab, near the centre.
  const [cx, cy] = P(36, 24)
  list.push({ kind: 'diagConsole', x: cx, y: cy, w: 32, h: 24, layer: 'behind' })

  // ---- Manager office -------------------------------------------------------
  list.push(
    { kind: 'rug', x: 436, y: 44, w: 88, h: 88, layer: 'behind' },
    { kind: 'sofa', x: P(46, 7)[0], y: P(46, 7)[1], w: 16, h: 24, layer: 'behind', facing: 'right' },
    { kind: 'commDevice', x: P(46, 4)[0], y: P(46, 4)[1], w: 16, h: 12, layer: 'behind' },
    { kind: 'cabinet', x: P(52, 3)[0], y: P(52, 3)[1], w: 40, h: 12, layer: 'behind' },
    { kind: 'officeChair', x: P(59, 7)[0], y: P(59, 7)[1], w: 16, h: 14, layer: 'behind', facing: 'down' },
    { kind: 'managerDesk', x: P(57, 9)[0], y: P(57, 9)[1], w: 48, h: 24, layer: 'front' },
    { kind: 'papers', x: P(58, 9)[0], y: P(58, 9)[1], w: 12, h: 8, layer: 'front' },
    { kind: 'papers', x: P(62, 9)[0], y: P(62, 9)[1], w: 10, h: 6, layer: 'front' },
    { kind: 'guestChair', x: P(56, 13)[0], y: P(56, 13)[1], w: 16, h: 14, layer: 'behind', facing: 'up' },
    { kind: 'guestChair', x: P(61, 13)[0], y: P(61, 13)[1], w: 16, h: 14, layer: 'behind', facing: 'up' },
    { kind: 'waterDispenser', x: P(66, 14)[0], y: P(66, 14)[1], w: 16, h: 20, layer: 'behind' },
    { kind: 'pottedPlant', x: P(66, 17)[0], y: P(66, 17)[1], w: 18, h: 16, layer: 'behind' }
  )

  // ---- Central planning area ------------------------------------------------
  const [plx, ply] = P(20, 26)
  list.push({ kind: 'planter', x: plx, y: ply, w: 16, h: 72, layer: 'behind' })

  const [tbx, tby] = P(24, 28)
  list.push(
    { kind: 'conferenceTable', x: tbx, y: tby, w: 88, h: 24, layer: 'behind' },
    { kind: 'conferenceChair', x: P(25, 27)[0], y: P(25, 27)[1], w: 16, h: 14, layer: 'behind', facing: 'down' },
    { kind: 'conferenceChair', x: P(29, 27)[0], y: P(29, 27)[1], w: 16, h: 14, layer: 'behind', facing: 'down' },
    { kind: 'conferenceChair', x: P(33, 27)[0], y: P(33, 27)[1], w: 16, h: 14, layer: 'behind', facing: 'down' },
    { kind: 'conferenceChair', x: P(25, 31)[0], y: P(25, 31)[1], w: 16, h: 14, layer: 'behind', facing: 'up' },
    { kind: 'conferenceChair', x: P(29, 31)[0], y: P(29, 31)[1], w: 16, h: 14, layer: 'behind', facing: 'up' },
    { kind: 'conferenceChair', x: P(33, 31)[0], y: P(33, 31)[1], w: 16, h: 14, layer: 'behind', facing: 'up' },
    { kind: 'conferenceChair', x: P(23, 29)[0], y: P(23, 29)[1], w: 16, h: 14, layer: 'behind', facing: 'right' },
    { kind: 'conferenceChair', x: P(23, 30)[0], y: P(23, 30)[1], w: 16, h: 14, layer: 'behind', facing: 'right' },
    { kind: 'conferenceChair', x: P(36, 29)[0], y: P(36, 29)[1], w: 16, h: 14, layer: 'behind', facing: 'left' },
    { kind: 'conferenceChair', x: P(36, 30)[0], y: P(36, 30)[1], w: 16, h: 14, layer: 'behind', facing: 'left' },
    { kind: 'papers', x: P(26, 29)[0], y: P(26, 29)[1], w: 14, h: 8, layer: 'behind' },
    { kind: 'papers', x: P(30, 29)[0], y: P(30, 29)[1], w: 12, h: 8, layer: 'behind' },
    { kind: 'notebook', x: P(33, 29)[0], y: P(33, 29)[1], w: 14, h: 8, layer: 'behind' },
    { kind: 'tablet', x: P(27, 28)[0], y: P(27, 28)[1], w: 12, h: 7, layer: 'behind' },
    { kind: 'mug', x: P(31, 28)[0], y: P(31, 28)[1], w: 6, h: 6, layer: 'behind' },
    { kind: 'notes', x: P(25, 29)[0], y: P(25, 29)[1], w: 9, h: 5, layer: 'behind' },
    { kind: 'device', x: P(34, 28)[0], y: P(34, 28)[1], w: 14, h: 8, layer: 'behind' }
  )

  const [bdx, bdy] = P(40, 24)
  list.push({ kind: 'planningBoard', x: bdx, y: bdy, w: 16, h: 152, layer: 'behind' })

  // ---- Worker workstation pods ----------------------------------------------
  const deskRows: Array<[number, number, number]> = [
    [45, 24, 1],
    [58, 24, 2],
    [45, 34, 3],
    [58, 34, 4]
  ]
  for (const [dx, dy, n] of deskRows) {
    const [fx, fy] = P(dx, dy)
    list.push({ kind: 'workerDesk', x: fx, y: fy, w: 48, h: 16, layer: 'behind', variant: n })
    const [cx, cy] = P(dx + 2, dy + 3)
    list.push({
      kind: 'workerChair',
      x: cx,
      y: cy,
      w: 14,
      h: 12,
      layer: 'behind',
      facing: 'up',
      variant: n
    })
  }
  // Partition strips between the left/right pods.
  for (const rowY of [24, 34]) {
    const [x, y] = P(53, rowY)
    list.push({ kind: 'partition', x, y, w: 24, h: 16, layer: 'behind' })
  }

  // ---- Memory archive -------------------------------------------------------
  list.push(
    { kind: 'bookshelf', x: P(6, 46)[0], y: P(6, 46)[1], w: 24, h: 32, layer: 'behind' },
    { kind: 'bookshelf', x: P(12, 46)[0], y: P(12, 46)[1], w: 44, h: 32, layer: 'behind' },
    { kind: 'vertShelf', x: P(4, 52)[0], y: P(4, 52)[1], w: 16, h: 96, layer: 'behind' },
    { kind: 'readingTable', x: P(12, 56)[0], y: P(12, 56)[1], w: 40, h: 24, layer: 'behind' },
    { kind: 'archiveBox', x: P(14, 57)[0], y: P(14, 57)[1], w: 16, h: 12, layer: 'behind' },
    { kind: 'docCabinet', x: P(22, 55)[0], y: P(22, 55)[1], w: 16, h: 48, layer: 'behind' },
    { kind: 'pottedPlant', x: P(5, 66)[0], y: P(5, 66)[1], w: 16, h: 16, layer: 'behind' }
  )

  // ---- Waiting / Ask Me room ------------------------------------------------
  list.push(
    { kind: 'waitingSofa', x: P(26, 50)[0], y: P(26, 50)[1], w: 16, h: 32, layer: 'behind', facing: 'right' },
    { kind: 'waterCooler', x: P(38, 47)[0], y: P(38, 47)[1], w: 16, h: 20, layer: 'behind' },
    { kind: 'wallConsole', x: P(43, 52)[0], y: P(43, 52)[1], w: 16, h: 64, layer: 'behind' },
    { kind: 'noticePanel', x: P(30, 46)[0], y: P(30, 46)[1], w: 24, h: 12, layer: 'behind' },
    { kind: 'pottedPlant', x: P(43, 66)[0], y: P(43, 66)[1], w: 16, h: 16, layer: 'behind' }
  )

  // ---- Testing room ---------------------------------------------------------
  list.push(
    { kind: 'testDesk', x: P(47, 47)[0], y: P(47, 47)[1], w: 32, h: 16, layer: 'behind', variant: 1 },
    { kind: 'testDesk', x: P(53, 47)[0], y: P(53, 47)[1], w: 32, h: 16, layer: 'behind', variant: 2 },
    { kind: 'testInstrument', x: P(48, 47)[0], y: P(48, 47)[1], w: 14, h: 12, layer: 'behind' },
    { kind: 'testInstrument', x: P(56, 47)[0], y: P(56, 47)[1], w: 14, h: 12, layer: 'behind' },
    { kind: 'testWorkbench', x: P(47, 61)[0], y: P(47, 61)[1], w: 88, h: 24, layer: 'behind' },
    { kind: 'lamp', x: P(54, 61)[0], y: P(54, 61)[1], w: 12, h: 12, layer: 'behind' },
    { kind: 'papers', x: P(50, 61)[0], y: P(50, 61)[1], w: 14, h: 8, layer: 'behind' },
    { kind: 'papers', x: P(57, 62)[0], y: P(57, 62)[1], w: 12, h: 6, layer: 'behind' }
  )

  return list
}

function buildStations(): StationDef[] {
  const stand = (id: StationDef['id'], tx: number, ty: number, facing: StationDef['facing'], w = 16, h = 16): StationDef => {
    const [x, y] = P(tx, ty)
    return { id, x: x + 8, y: y + 8, facing, w, h }
  }
  const seat = (
    id: StationDef['id'],
    tx: number,
    ty: number,
    facing: StationDef['facing'],
    sx: number,
    sy: number,
    seatFacing: StationDef['facing'],
    w = 16,
    h = 16
  ): StationDef => {
    const [x, y] = P(tx, ty)
    const [px, py] = P(sx, sy)
    return { id, x: x + 8, y: y + 8, facing, seat: { x: px + 8, y: py + 8 }, seatFacing, w, h }
  }

  return [
    seat('manager_desk', 60, 9, 'down', 60, 8, 'down'),
    stand('conference_table', 29, 32, 'up'),
    seat('worker_desk_1', 47, 26, 'up', 47, 26, 'up'),
    seat('worker_desk_2', 60, 26, 'up', 60, 26, 'up'),
    seat('worker_desk_3', 47, 36, 'up', 47, 36, 'up'),
    seat('worker_desk_4', 60, 36, 'up', 60, 36, 'up'),
    stand('research_bench', 29, 7, 'up'),
    stand('diagnostic_console', 38, 28, 'up'),
    stand('server_rack', 7, 13, 'up'),
    stand('memory_shelf', 14, 53, 'up'),
    stand('memory_table', 14, 60, 'up'),
    seat('ask_me_sofa', 27, 52, 'right', 27, 52, 'right'),
    stand('test_desk_1', 49, 50, 'up'),
    stand('test_desk_2', 55, 50, 'up'),
    stand('test_workbench', 51, 65, 'up')
  ]
}

export const OFFICE_MAP: OfficeMap = {
  name: 'PixelForge HQ',
  tileSize: TILE,
  width: GRID_W,
  height: GRID_H,
  tiles: buildTiles(),
  furniture: buildFurniture(),
  stations: buildStations(),
  entrance: { x: 35, y: 71 }
}