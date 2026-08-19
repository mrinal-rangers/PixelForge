import { TILE } from './officeMap'
import type { OfficeMap } from './types'

/**
 * Tile-graph BFS used to walk agents between stations. Furniture that blocks
 * movement is baked into a solid mask; chairs and rugs stay walkable so
 * characters can reach interaction points.
 */

export class Pathfinder {
  private walkable: boolean[] = []

  constructor(private readonly map: OfficeMap) {
    this.build()
  }

  private build(): void {
    const { tiles, width: w, height: h, furniture } = this.map
    this.walkable = new Array(w * h).fill(true)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (tiles[y][x] === 'W') {
          this.walkable[y * w + x] = false
        }
      }
    }
    const solidKinds = new Set<string>([
      'serverRack',
      'utilityDevice',
      'workbench',
      'bottles',
      'toolRack',
      'labMachine',
      'diagScreen',
      'diagConsole',
      'sofa',
      'managerDesk',
      'cabinet',
      'waterDispenser',
      'pottedPlant',
      'commDevice',
      'conferenceTable',
      'planter',
      'planningBoard',
      'workerDesk',
      'partition',
      'bookshelf',
      'vertShelf',
      'readingTable',
      'archiveBox',
      'docCabinet',
      'waitingSofa',
      'waterCooler',
      'wallConsole',
      'noticePanel',
      'testDesk',
      'testInstrument',
      'testWorkbench',
      'lamp',
      'papers',
      'notebook',
      'tablet',
      'mug',
      'notes',
      'device'
    ])
    for (const item of furniture) {
      if (!solidKinds.has(item.kind)) {
        continue
      }
      const x0 = Math.floor(item.x / TILE)
      const y0 = Math.floor(item.y / TILE)
      const x1 = Math.floor((item.x + (item.w ?? 16) - 1) / TILE)
      const y1 = Math.floor((item.y + (item.h ?? 16) - 1) / TILE)
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (x >= 0 && y >= 0 && x < w && y < h) {
            this.walkable[y * w + x] = false
          }
        }
      }
    }
  }

  isWalkable(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) {
      return false
    }
    return this.walkable[ty * this.map.width + tx]
  }

  /** BFS path in tile coordinates from (sx,sy) to (tx,ty), start excluded. */
  findPath(sx: number, sy: number, tx: number, ty: number): Array<[number, number]> {
    const w = this.map.width
    const h = this.map.height
    if (!this.isWalkable(sx, sy) || !this.isWalkable(tx, ty)) {
      return []
    }
    if (sx === tx && sy === ty) {
      return []
    }
    const prev = new Int32Array(w * h).fill(-1)
    const queue: number[] = [sy * w + sx]
    prev[sy * w + sx] = -2
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]
    let head = 0
    let found = -1
    while (head < queue.length) {
      const cur = queue[head++]
      if (cur === ty * w + tx) {
        found = cur
        break
      }
      const cx = cur % w
      const cy = Math.floor(cur / w)
      for (const [dx, dy] of dirs) {
        const nx = cx + dx
        const ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
          continue
        }
        const idx = ny * w + nx
        if (prev[idx] !== -1 || !this.walkable[idx]) {
          continue
        }
        prev[idx] = cur
        queue.push(idx)
      }
    }
    if (found === -1) {
      return []
    }
    const path: Array<[number, number]> = []
    let cur = found
    while (cur !== -2) {
      path.push([cur % w, Math.floor(cur / w)])
      cur = prev[cur]
    }
    path.reverse()
    path.shift() // drop the start tile
    return path
  }
}