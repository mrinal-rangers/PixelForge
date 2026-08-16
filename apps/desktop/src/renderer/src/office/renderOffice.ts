import 'pixi.js/unsafe-eval'
import { Application, Container, Graphics, Sprite, Text } from 'pixi.js'
import { PALETTE } from './palette'
import { OFFICE_MAP, tileAnchorX, tileAnchorY } from './officeMap'
import type { Direction, FrameName, FurnitureSpec } from './types'
import type { DeskSpec } from './types'
import { buildCharacterSheet } from './sheetBuilder'
import type { CharacterSheet } from './sheetBuilder'
import { useOfficeStore } from './store'
import type { OfficeAgentRecord } from './store'
import { DEFAULT_COWORKER, getAvatar } from './characters'
import type { CharacterSpec } from './types'

type VisualState =
  | 'entering'
  | 'walking'
  | 'working'
  | 'idle'
  | 'attention'
  | 'error'
  | 'leaving'
  | 'offline'

const TILE = OFFICE_MAP.tileSize
const MAP_W = OFFICE_MAP.width * TILE
const MAP_H = OFFICE_MAP.height * TILE
const CAM_MARGIN = 48
const WALK_SPEED = 64
const WORK_IDLE_MS = 2800
const ATTENTION_MS = 1400

const PIXEL_FONT = 'PressStart, monospace'

export interface OfficeRendererOptions {
  onFocus: (sessionId: string) => void
}

interface AgentBehavior {
  id: string
  container: Container
  sprite: Sprite
  shadow: Graphics
  label: Container
  marker: Graphics
  sheet: CharacterSheet
  direction: Direction
  frame: FrameName
  state: 'spawning' | 'walking' | 'atDesk' | 'leaving' | 'gone'
  path: { x: number; y: number }[]
  pathIndex: number
  visual: VisualState
  deskIndex: number
  animTime: number
  blinkTimer: number
  blinkUntil: number
}

export class OfficeRenderer {
  private app!: Application
  private sceneRoot!: Container
  private depthLayer!: Container
  private sheets = new Map<string, CharacterSheet>()
  private agents = new Map<string, AgentBehavior>()
  private deskScreens: Graphics[] = []
  private camera: { x: number; y: number } = { x: 0, y: 0 }
  private canvasScale = 1
  private destroyed = false
  private pointerCleanup?: () => void
  private lastFollowedId: string | null = null

  constructor(private readonly options: OfficeRendererOptions) {}

  async init(root: HTMLElement): Promise<void> {
    const app = new Application()
    await app.init({
      width: MAP_W,
      height: MAP_H,
      background: PALETTE.bgDeep,
      antialias: false,
      resolution: 1,
      autoDensity: false
    })
    this.app = app
    app.canvas.style.imageRendering = 'pixelated'
    app.canvas.style.display = 'block'
    root.appendChild(app.canvas)

    this.sceneRoot = new Container()
    app.stage.addChild(this.sceneRoot)

    this.buildBackdrop()

    this.depthLayer = new Container()
    this.depthLayer.sortableChildren = true
    this.sceneRoot.addChild(this.depthLayer)
    this.buildFurniture()

    this.wireInteraction()
    this.applyCamera(0, 0)
    app.ticker.add(() => this.tick())
  }

  resize(availW: number, availH: number, zoom: number | 'fit'): void {
    if (!this.app || this.destroyed) {
      return
    }
    let scale: number
    if (zoom === 'fit') {
      scale = Math.max(1, Math.floor(Math.min(availW / MAP_W, availH / MAP_H)))
    } else {
      scale = zoom
    }
    this.canvasScale = scale
    const canvas = this.app.canvas
    canvas.style.width = `${MAP_W * scale}px`
    canvas.style.height = `${MAP_H * scale}px`
  }

  destroy(): void {
    this.destroyed = true
    this.pointerCleanup?.()
    this.app?.destroy(true, { children: true })
  }

  // ---- Scene construction --------------------------------------------------

  private buildBackdrop(): void {
    const edge = CAM_MARGIN + 16
    const bg = new Graphics()
    bg.rect(-edge, -edge, MAP_W + edge * 2, MAP_H + edge * 2).fill(PALETTE.bgDeep)
    this.sceneRoot.addChild(bg)

    const floor = new Graphics()
    for (let y = 0; y < OFFICE_MAP.height; y++) {
      for (let x = 0; x < OFFICE_MAP.width; x++) {
        this.drawTile(floor, x, y, OFFICE_MAP.tiles[y * OFFICE_MAP.width + x])
      }
    }
    this.sceneRoot.addChild(floor)

    this.drawRugsAndMat()
    this.drawWallItems()
  }

  private drawTile(g: Graphics, x: number, y: number, code: string): void {
    const px = x * TILE
    const py = y * TILE
    if (code === 'W') {
      const shade = (x + y) % 2 === 0 ? PALETTE.bgRaised : '#182038'
      g.rect(px, py, TILE, TILE).fill(shade)
      g.rect(px, py + TILE - 4, TILE, 4).fill('#0d1120')
      return
    }
    if (code === 'D') {
      g.rect(px, py, TILE, TILE).fill('#0a0d18')
      g.rect(px + 2, py + 2, TILE - 4, TILE - 4).fill(PALETTE.glass)
      return
    }
    const plank = (x + y) % 2 === 0 ? PALETTE.woodLight : PALETTE.wood
    g.rect(px, py, TILE, TILE).fill(plank)
    g.rect(px, py + TILE - 2, TILE, 2).fill(PALETTE.woodEdge)
    if ((x + y) % 3 === 0) {
      g.rect(px + TILE - 2, py, 2, TILE).fill(PALETTE.woodEdge)
    }
  }

  private drawRugsAndMat(): void {
    for (const rug of OFFICE_MAP.rugs) {
      const g = new Graphics()
      const x = rug.x * TILE
      const y = rug.y * TILE
      const w = rug.w * TILE
      const h = rug.h * TILE
      g.rect(x, y, w, h).fill('#0f1c1f')
      g.rect(x + 3, y + 3, w - 6, h - 6).fill(PALETTE.tealDark)
      g.rect(x + 6, y + 6, w - 12, h - 12).fill(PALETTE.teal)
      g.rect(x + 9, y + 9, w - 18, h - 18).fill('#2fae9a')
      this.sceneRoot.addChild(g)
    }

    const mat = new Graphics()
    mat.rect(16 * TILE, 21 * TILE, 4 * TILE, TILE).fill(PALETTE.woodDark)
    mat.rect(16 * TILE + 2, 21 * TILE + 2, 4 * TILE - 4, TILE - 4).fill(PALETTE.wood)
    this.sceneRoot.addChild(mat)
  }

  private drawWallItems(): void {
    for (const furniture of OFFICE_MAP.furniture) {
      if (
        furniture.kind !== 'window' &&
        furniture.kind !== 'noticeboard' &&
        furniture.kind !== 'shelf' &&
        furniture.kind !== 'clock'
      ) {
        continue
      }
      const g = new Graphics()
      this.drawWallItem(g, furniture)
      g.position.set(furniture.tileX * TILE, furniture.tileY * TILE)
      this.sceneRoot.addChild(g)
    }
  }

  private drawWallItem(g: Graphics, furniture: FurnitureSpec): void {
    if (furniture.kind === 'window') {
      const w = TILE * 2
      g.rect(0, 4, w, 26).fill(PALETTE.windowFrame)
      g.rect(3, 7, w - 6, 20).fill(PALETTE.sky)
      g.rect(3, 16, w - 6, 2).fill(PALETTE.windowFrame)
      g.rect(w / 2 - 1, 7, 2, 20).fill(PALETTE.windowFrame)
      g.rect(3, 24, w - 6, 3).fill(PALETTE.woodDark)
      g.rect(3, 25, w - 6, 2).fill(PALETTE.creamLight)
      return
    }
    if (furniture.kind === 'noticeboard') {
      const w = TILE * 3
      g.rect(0, 2, w, 24).fill(PALETTE.woodDark)
      g.rect(2, 4, w - 4, 20).fill(PALETTE.wood)
      const notes: Array<[number, number, number, number, string]> = [
        [5, 6, 12, 9, PALETTE.coral],
        [19, 6, 11, 9, PALETTE.amber],
        [5, 17, 10, 7, PALETTE.teal],
        [17, 16, 12, 7, PALETTE.violet]
      ]
      for (const [nx, ny, nw, nh, color] of notes) {
        g.rect(nx, ny, nw, nh).fill(color)
        g.rect(nx + 1, ny + 1, nw - 2, 1).fill('#ffffff33')
        g.rect(nx + nw / 2 - 1, ny - 1, 2, 2).fill('#2a2133')
      }
      return
    }
    if (furniture.kind === 'shelf') {
      const w = TILE * 2
      g.rect(0, 8, w, 20).fill(PALETTE.woodDark)
      g.rect(0, 8, w, 3).fill(PALETTE.woodLight)
      const books: Array<[number, number, number, string]> = [
        [2, 12, 4, PALETTE.coral],
        [7, 12, 4, PALETTE.teal],
        [12, 12, 4, PALETTE.violet],
        [17, 12, 4, PALETTE.amber],
        [2, 18, 5, PALETTE.amber],
        [8, 18, 4, PALETTE.violet],
        [13, 18, 6, PALETTE.teal]
      ]
      for (const [bx, by, bw, color] of books) {
        g.rect(bx, by, bw, 3).fill(color)
        g.rect(bx + 1, by, 1, 3).fill('#ffffff44')
      }
      return
    }
    if (furniture.kind === 'clock') {
      g.rect(1, 2, 14, 14).fill(PALETTE.windowFrame)
      g.rect(3, 4, 10, 10).fill('#f6ecd4')
      g.rect(7, 4, 2, 5).fill(PALETTE.ink)
      g.rect(9, 8, 3, 1).fill(PALETTE.ink)
      g.rect(0, 16, 16, 2).fill(PALETTE.woodDark)
      g.rect(1, 17, 14, 1).fill(PALETTE.creamLight)
      return
    }
  }

  private buildFurniture(): void {
    const all: FurnitureSpec[] = [...OFFICE_MAP.furniture, ...OFFICE_MAP.desks]
    for (const furniture of all) {
      if (
        furniture.kind === 'window' ||
        furniture.kind === 'noticeboard' ||
        furniture.kind === 'shelf' ||
        furniture.kind === 'clock'
      ) {
        continue
      }
      const container = new Container()
      container.position.set(
        tileAnchorX(OFFICE_MAP, furniture.tileX),
        tileAnchorY(OFFICE_MAP, furniture.tileY)
      )
      const g = new Graphics()
      this.drawFloorItem(g, furniture)
      container.addChild(g)

      if (furniture.kind === 'desk') {
        const desk = furniture as DeskSpec
        const screen = new Graphics()
        container.addChild(screen)
        this.deskScreens[desk.owner] = screen
      }

      container.zIndex = Math.round(container.position.y)
      this.depthLayer.addChild(container)
    }
  }

  private drawFloorItem(g: Graphics, furniture: FurnitureSpec): void {
    switch (furniture.kind) {
      case 'desk': {
        g.rect(-20, -4, 8, 4).fill(PALETTE.woodEdge)
        g.rect(12, -4, 8, 4).fill(PALETTE.woodEdge)
        g.rect(-24, -10, 48, 8).fill(PALETTE.woodEdge)
        g.rect(-22, -9, 44, 6).fill(PALETTE.wood)
        g.rect(-22, -9, 44, 2).fill(PALETTE.woodLight)
        g.rect(-16, -20, 4, 10).fill(PALETTE.woodDark)
        g.rect(-20, -24, 12, 4).fill(PALETTE.windowFrame)
        g.rect(-19, -24, 10, 3).fill('#4a4262')
        g.rect(4, -8, 10, 3).fill(PALETTE.ink)
        g.rect(14, -10, 4, 5).fill(PALETTE.coral)
        g.rect(15, -11, 2, 1).fill(PALETTE.amber)
        break
      }
      case 'chair': {
        g.rect(-5, -12, 10, 4).fill(PALETTE.windowFrame)
        g.rect(-4, -9, 8, 3).fill('#5a516e')
        g.rect(-5, -6, 10, 4).fill('#5a516e')
        g.rect(-4, -3, 8, 3).fill(PALETTE.ink)
        break
      }
      case 'plant': {
        g.rect(-5, -7, 10, 7).fill(PALETTE.pot)
        g.rect(-4, -6, 8, 1).fill('#c9825d')
        g.rect(-1, -14, 4, 7).fill(PALETTE.leafDark)
        g.rect(-7, -17, 6, 6).fill(PALETTE.leaf)
        g.rect(1, -18, 7, 6).fill(PALETTE.leafLight)
        g.rect(-3, -12, 4, 5).fill(PALETTE.leaf)
        break
      }
      case 'sofa': {
        g.rect(-14, -16, 28, 12).fill('#3a3145')
        g.rect(-14, -10, 28, 10).fill('#4a4262')
        g.rect(-12, -6, 24, 6).fill('#5a516e')
        g.rect(-16, -10, 4, 12).fill('#2e2737')
        g.rect(12, -10, 4, 12).fill('#2e2737')
        break
      }
      case 'table': {
        const w = (furniture.variant ?? 1) * TILE
        g.rect(-w / 2 + 4, -6, 4, 6).fill(PALETTE.woodEdge)
        g.rect(w / 2 - 8, -6, 4, 6).fill(PALETTE.woodEdge)
        g.rect(-w / 2, -8, w, 3).fill(PALETTE.woodLight)
        g.rect(-w / 2, -5, w, 1).fill(PALETTE.wood)
        g.rect(-2, -9, 4, 1).fill(PALETTE.tealDark)
        break
      }
      case 'counter': {
        const w = (furniture.variant ?? 3) * TILE
        g.rect(-w / 2 + 4, -14, 4, 14).fill(PALETTE.woodEdge)
        g.rect(w / 2 - 8, -14, 4, 14).fill(PALETTE.woodEdge)
        g.rect(-w / 2, -18, w, 6).fill(PALETTE.windowFrame)
        g.rect(-w / 2 + 1, -17, w - 2, 4).fill('#4a4262')
        g.rect(-w / 2, -12, w, 2).fill(PALETTE.woodLight)
        g.rect(-w / 2, -16, w, 2).fill(PALETTE.wood)
        break
      }
      case 'coffee': {
        g.rect(-5, -10, 10, 10).fill('#4a4262')
        g.rect(-4, -12, 6, 3).fill('#5a516e')
        g.rect(-3, -11, 4, 1).fill('#2a2133')
        g.rect(3, -13, 3, 6).fill('#8a6a4a')
        g.rect(4, -12, 1, 4).fill('#c9a05a')
        g.rect(-2, -5, 4, 5).fill(PALETTE.pot)
        break
      }
      case 'watercooler': {
        g.rect(-4, -16, 8, 16).fill('#bfe3f2')
        g.rect(-5, -17, 10, 2).fill('#5a516e')
        g.rect(-3, -4, 6, 4).fill('#9c6f3f')
        g.rect(-5, 0, 10, 2).fill('#3a3145')
        break
      }
      case 'rack': {
        g.rect(-7, -18, 14, 18).fill('#23203a')
        g.rect(-6, -17, 12, 3).fill('#3a3145')
        g.rect(-6, -12, 12, 3).fill('#3a3145')
        g.rect(-6, -7, 12, 3).fill('#3a3145')
        g.rect(-4, -16, 2, 1).fill(PALETTE.teal)
        g.rect(0, -16, 2, 1).fill(PALETTE.amber)
        g.rect(4, -16, 2, 1).fill(PALETTE.coral)
        g.rect(-4, -11, 2, 1).fill(PALETTE.amber)
        g.rect(0, -11, 2, 1).fill(PALETTE.teal)
        g.rect(4, -11, 2, 1).fill(PALETTE.violet)
        break
      }
      default:
        break
    }
  }

  // ---- Agent lifecycle -----------------------------------------------------

  private sheetFor(record: OfficeAgentRecord): CharacterSheet {
    const avatar = record.avatarId ? getAvatar(record.avatarId) : undefined
    const spec: CharacterSpec = avatar ?? DEFAULT_COWORKER
    let sheet = this.sheets.get(spec.name)
    if (!sheet) {
      sheet = buildCharacterSheet(spec)
      this.sheets.set(spec.name, sheet)
    }
    return sheet
  }

  private syncAgents(): void {
    const { agents } = useOfficeStore.getState()
    const ids = Object.keys(agents)

    for (const id of ids) {
      if (!this.agents.has(id)) {
        this.spawnAgent(id, agents[id])
      }
    }

    for (const [id, behavior] of this.agents) {
      if (!agents[id] && behavior.state !== 'leaving' && behavior.state !== 'gone') {
        behavior.state = 'leaving'
        behavior.pathIndex = behavior.path.length - 1
        this.applyVisual(behavior, 'leaving')
      }
    }

    for (const [id, behavior] of this.agents) {
      if (behavior.state === 'gone') {
        this.depthLayer.removeChild(behavior.container)
        behavior.container.destroy({ children: true })
        this.agents.delete(id)
      }
    }
  }

  private spawnAgent(id: string, record: OfficeAgentRecord): void {
    const sheet = this.sheetFor(record)
    const deskIndex = Math.min(this.agents.size, OFFICE_MAP.desks.length - 1)
    const desk = OFFICE_MAP.desks[deskIndex]
    const standTile = { x: desk.tileX, y: desk.tileY + 1 }

    const container = new Container()
    container.position.set(
      tileAnchorX(OFFICE_MAP, OFFICE_MAP.entrance.x),
      tileAnchorY(OFFICE_MAP, OFFICE_MAP.entrance.y)
    )

    const shadow = new Graphics()
    shadow.ellipse(0, 1, 6, 2.5).fill('#00000055')
    container.addChild(shadow)

    const sprite = new Sprite(sheet.frames.down.idle)
    sprite.position.set(-sheet.cellW / 2, -sheet.cellH + 1)
    sprite.eventMode = 'static'
    sprite.cursor = 'pointer'
    container.addChild(sprite)

    const label = this.buildLabel(record.name, record.role)
    container.addChild(label)

    const marker = new Graphics()
    marker.visible = false
    container.addChild(marker)

    const path = this.findPathPixel(OFFICE_MAP.entrance, standTile)
    const behavior: AgentBehavior = {
      id,
      container,
      sprite,
      shadow,
      label,
      marker,
      sheet,
      direction: 'up',
      frame: 'idle',
      state: 'spawning',
      path,
      pathIndex: 0,
      visual: 'entering',
      deskIndex,
      animTime: 0,
      blinkTimer: 1.5 + Math.random() * 2,
      blinkUntil: 0
    }
    this.applyVisual(behavior, 'entering')
    this.wireAgentTap(behavior)
    this.depthLayer.addChild(behavior.container)
    this.agents.set(id, behavior)
  }

  private findPathPixel(start: { x: number; y: number }, goal: { x: number; y: number }): { x: number; y: number }[] {
    const tiles = this.bfsPath(start, goal)
    return tiles.map((tile) => ({
      x: tileAnchorX(OFFICE_MAP, tile.x),
      y: tileAnchorY(OFFICE_MAP, tile.y)
    }))
  }

  private bfsPath(start: { x: number; y: number }, goal: { x: number; y: number }): { x: number; y: number }[] {
    const width = OFFICE_MAP.width
    const passable = (x: number, y: number): boolean =>
      x >= 0 &&
      y >= 0 &&
      x < width &&
      y < OFFICE_MAP.height &&
      OFFICE_MAP.tiles[y * width + x] !== 'W'
    const prev = new Map<number, number>()
    const startKey = start.y * width + start.x
    prev.set(startKey, -1)
    const queue: { x: number; y: number }[] = [{ ...start }]
    while (queue.length > 0) {
      const cur = queue.shift() as { x: number; y: number }
      const key = cur.y * width + cur.x
      if (cur.x === goal.x && cur.y === goal.y) {
        break
      }
      const dirs = [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0]
      ]
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx
        const ny = cur.y + dy
        if (!passable(nx, ny)) {
          continue
        }
        const nk = ny * width + nx
        if (prev.has(nk)) {
          continue
        }
        prev.set(nk, key)
        queue.push({ x: nx, y: ny })
      }
    }
    const path: { x: number; y: number }[] = []
    let cur = { ...goal }
    let key = goal.y * width + goal.x
    if (!prev.has(key)) {
      return [start, goal]
    }
    while (key !== -1) {
      path.push({ x: cur.x, y: cur.y })
      const parent = prev.get(key)
      if (parent === -1 || parent === undefined) {
        break
      }
      cur = { x: parent % width, y: Math.floor(parent / width) }
      key = parent
    }
    return path.reverse()
  }

  private buildLabel(name: string, role: string): Container {
    const label = new Container()
    const dot = new Graphics()
    dot.rect(0, 1, 4, 4).fill(PALETTE.teal)
    label.addChild(dot)

    const nameText = new Text({
      text: name,
      style: {
        fontFamily: PIXEL_FONT,
        fontSize: 8,
        fill: PALETTE.paper,
        stroke: { color: '#141a2e', width: 3 },
        letterSpacing: 0.5
      }
    })
    nameText.position.set(7, 0)
    label.addChild(nameText)

    const roleText = new Text({
      text: role.toUpperCase(),
      style: {
        fontFamily: PIXEL_FONT,
        fontSize: 6,
        fill: PALETTE.creamDark,
        stroke: { color: '#141a2e', width: 2 }
      }
    })
    roleText.position.set(7, 9)
    label.addChild(roleText)

    label.pivot.set(label.width / 2, 0)
    label.position.set(0, -26 - 12)
    return label
  }

  private setLabelDot(behavior: AgentBehavior, color: string): void {
    const dot = behavior.label.children[0] as Graphics
    dot.clear()
    dot.rect(0, 1, 4, 4).fill(color)
  }

  private updateLabelState(behavior: AgentBehavior, record?: OfficeAgentRecord): void {
    const status = record?.status
    let color: string = PALETTE.inkSoft
    if (status === 'running' || status === 'starting') {
      color = PALETTE.teal
    }
    if (status === 'error') {
      color = PALETTE.coral
    }
    if (record?.promptPending && status === 'running') {
      color = PALETTE.amber
    }
    this.setLabelDot(behavior, color)
  }

  private setBubble(behavior: AgentBehavior, kind: 'attention' | 'error' | null): void {
    const old = behavior.container.getChildByLabel('bubble')
    if (old) {
      old.destroy({ children: true })
    }
    if (!kind) {
      return
    }
    const bubble = new Container()
    bubble.label = 'bubble'
    const g = new Graphics()
    const color = kind === 'attention' ? PALETTE.amber : PALETTE.coral
    g.roundRect(0, 0, 14, 14, 3).fill(color).stroke({ width: 2, color: PALETTE.ink })
    g.rect(3, 12, 3, 3).fill(color)
    bubble.addChild(g)
    const glyph = new Text({
      text: kind === 'attention' ? '?' : '!',
      style: { fontFamily: PIXEL_FONT, fontSize: 10, fill: '#ffffff', stroke: { color: PALETTE.ink, width: 2 } }
    })
    glyph.anchor.set(0.5)
    glyph.position.set(7, 7)
    bubble.addChild(glyph)
    bubble.position.set(7, -26 - 8)
    behavior.container.addChild(bubble)
  }

  private updateSelectionMarker(behavior: AgentBehavior): void {
    const selected = useOfficeStore.getState().selectedId === behavior.id
    behavior.marker.visible = selected
    if (!selected) {
      return
    }
    const g = behavior.marker
    g.clear()
    g.poly([-4, -34, 4, -34, 0, -29]).fill(PALETTE.amber)
  }

  // ---- Simulation ----------------------------------------------------------

  private tick(): void {
    if (this.destroyed) {
      return
    }
    const dt = Math.min(this.app.ticker.deltaMS, 50) / 1000
    const now = Date.now()
    this.syncAgents()
    const agents = useOfficeStore.getState().agents
    for (const behavior of this.agents.values()) {
      const record = agents[behavior.id]
      this.updateAgent(behavior, dt, now, record)
      this.updateLabelState(behavior, record)
      this.updateSelectionMarker(behavior)
    }
    this.updateDeskScreens(agents)
    this.updateCamera()
    this.sortDepth()
  }

  private updateAgent(behavior: AgentBehavior, dt: number, now: number, record?: OfficeAgentRecord): void {
    const status = record?.status ?? 'stopped'

    if (status === 'starting' && (behavior.state === 'gone' || behavior.state === 'leaving')) {
      behavior.state = 'spawning'
      behavior.pathIndex = 0
      behavior.container.visible = true
      behavior.container.position.set(
        tileAnchorX(OFFICE_MAP, OFFICE_MAP.entrance.x),
        tileAnchorY(OFFICE_MAP, OFFICE_MAP.entrance.y)
      )
      this.followTo(behavior)
    }

    if (behavior.state === 'spawning') {
      behavior.state = 'walking'
      this.applyVisual(behavior, 'walking')
    }

    if (behavior.state === 'walking') {
      const nextIndex = behavior.pathIndex + 1
      const target = behavior.path[nextIndex]
      if (!target) {
        behavior.state = 'atDesk'
        behavior.pathIndex = behavior.path.length - 1
        this.updateVisual(behavior, now, record)
        return
      }
      const current = { x: behavior.container.x, y: behavior.container.y }
      const dx = target.x - current.x
      const dy = target.y - current.y
      const dist = Math.hypot(dx, dy)
      const step = WALK_SPEED * dt
      if (step >= dist) {
        behavior.pathIndex = nextIndex
        behavior.container.position.set(target.x, target.y)
      } else {
        behavior.container.x += (dx / dist) * step
        behavior.container.y += (dy / dist) * step
      }
      this.setDirection(behavior, dx, dy)
      this.animateWalk(behavior)
      return
    }

    if (behavior.state === 'leaving') {
      const prevIndex = behavior.pathIndex - 1
      const target = behavior.path[prevIndex]
      if (!target || prevIndex < 0) {
        behavior.state = 'gone'
        behavior.container.visible = false
        this.applyVisual(behavior, 'offline')
        return
      }
      const current = { x: behavior.container.x, y: behavior.container.y }
      const dx = target.x - current.x
      const dy = target.y - current.y
      const dist = Math.hypot(dx, dy)
      const step = WALK_SPEED * dt
      if (step >= dist) {
        behavior.pathIndex = prevIndex
        behavior.container.position.set(target.x, target.y)
      } else {
        behavior.container.x += (dx / dist) * step
        behavior.container.y += (dy / dist) * step
      }
      this.setDirection(behavior, dx, dy)
      this.animateWalk(behavior)
      return
    }

    if (behavior.state === 'atDesk') {
      this.updateVisual(behavior, now, record)
    }
  }

  private updateVisual(behavior: AgentBehavior, now: number, record?: OfficeAgentRecord): void {
    const status = record?.status ?? 'stopped'
    let visual: VisualState = 'idle'
    if (status === 'starting' || status === 'running') {
      const last = record?.lastActivityAt ?? 0
      const quiet = last > 0 ? now - last : 0
      if (record?.promptPending && quiet > ATTENTION_MS) {
        visual = 'attention'
      } else if (quiet > WORK_IDLE_MS) {
        visual = 'idle'
      } else {
        visual = 'working'
      }
    } else if (status === 'error') {
      visual = 'error'
    }
    this.applyVisual(behavior, visual)

    if (visual === 'working') {
      behavior.animTime += 1
      behavior.frame = behavior.animTime % 6 < 3 ? 'type1' : 'type2'
      behavior.sprite.texture = behavior.sheet.frames.down[behavior.frame]
      behavior.sprite.y = -behavior.sheet.cellH + 1 + (behavior.animTime % 2 === 0 ? -1 : 0)
    } else if (visual === 'idle' || visual === 'attention') {
      behavior.animTime += 1
      this.maybeBlink(behavior, now)
    } else if (visual === 'error') {
      this.maybeBlink(behavior, now)
    }
  }

  private applyVisual(behavior: AgentBehavior, visual: VisualState): void {
    if (behavior.visual === visual) {
      return
    }
    behavior.visual = visual
    behavior.sprite.y = -behavior.sheet.cellH + 1
    this.setBubble(behavior, visual === 'attention' ? 'attention' : visual === 'error' ? 'error' : null)
    if (visual === 'error') {
      behavior.sprite.texture = behavior.sheet.frames.down.idle
    }
  }

  private animateWalk(behavior: AgentBehavior): void {
    behavior.animTime += 1
    behavior.frame = behavior.animTime % 10 < 5 ? 'walk1' : 'walk2'
    behavior.sprite.texture = behavior.sheet.frames[behavior.direction][behavior.frame]
    behavior.sprite.y = -behavior.sheet.cellH + 1 + (behavior.frame === 'walk2' ? -1 : 0)
  }

  private setDirection(behavior: AgentBehavior, dx: number, dy: number): void {
    let direction: Direction
    if (dy < 0 && Math.abs(dy) >= Math.abs(dx)) {
      direction = 'up'
    } else if (dy > 0 && Math.abs(dy) > Math.abs(dx)) {
      direction = 'down'
    } else if (dx > 0) {
      direction = 'right'
    } else if (dx < 0) {
      direction = 'left'
    } else {
      direction = 'down'
    }
    if (direction !== behavior.direction) {
      behavior.direction = direction
      behavior.sprite.texture = behavior.sheet.frames[direction][behavior.frame]
    }
  }

  private maybeBlink(behavior: AgentBehavior, now: number): void {
    if (behavior.blinkTimer <= 0) {
      if (behavior.blinkUntil === 0) {
        behavior.blinkUntil = now + 160
        behavior.sprite.texture = behavior.sheet.blink[behavior.direction]
      }
      if (now >= behavior.blinkUntil) {
        behavior.blinkUntil = 0
        behavior.sprite.texture = behavior.sheet.frames[behavior.direction].idle
        behavior.blinkTimer = 2.5 + Math.random() * 3
      }
    } else {
      behavior.blinkTimer -= 1 / 60
    }
  }

  private sortDepth(): void {
    for (const child of this.depthLayer.children) {
      child.zIndex = Math.round(child.position.y)
    }
    this.depthLayer.sortChildren()
  }

  private updateDeskScreens(agents: Record<string, OfficeAgentRecord>): void {
    for (const desk of OFFICE_MAP.desks) {
      const g = this.deskScreens[desk.owner]
      if (!g) {
        continue
      }
      let visual: VisualState = 'offline'
      let status: string | undefined
      for (const behavior of this.agents.values()) {
        if (behavior.deskIndex === desk.owner) {
          visual = behavior.visual
          status = agents[behavior.id]?.status
          break
        }
      }
      this.paintDeskScreen(g, visual, status)
    }
  }

  private paintDeskScreen(g: Graphics, visual: VisualState, status?: string): void {
    const now = Date.now()
    const blink = Math.floor(now / 300) % 2 === 0
    g.clear()
    let fg = '#3a4256'
    let cursor = false
    if (visual === 'working') {
      fg = '#7fe0c8'
      cursor = blink
    } else if (visual === 'idle') {
      fg = '#3a8a7a'
    } else if (visual === 'attention') {
      fg = PALETTE.amber
      cursor = true
    } else if (visual === 'error') {
      fg = PALETTE.coral
    } else if (visual === 'entering' || visual === 'walking') {
      fg = '#3a8a7a'
    } else {
      fg = '#3a4256'
    }
    g.rect(-19, -24, 10, 3).fill('#0d1118')
    g.rect(-18, -23, 8, 1).fill(fg)
    g.rect(-18, -22, 5, 1).fill(fg)
    if (visual === 'error') {
      g.rect(-17, -23, 6, 1).fill('#2a0d0d')
      g.rect(-18, -23, 8, 1).fill(fg)
      g.rect(-18, -22, 8, 1).fill('#2a0d0d')
    }
    if (cursor) {
      g.rect(-18 + (blink ? 5 : 4), -22, 1, 1).fill(PALETTE.creamLight)
    }
    if (status === 'stopped' || status === 'completed') {
      g.rect(-19, -24, 10, 3).fill('#10131c')
    }
  }

  // ---- Camera & interaction --------------------------------------------------

  private updateCamera(): void {
    const selected = useOfficeStore.getState().selectedId
    if (selected && selected !== this.lastFollowedId) {
      this.lastFollowedId = selected
      const behavior = this.agents.get(selected)
      if (behavior) {
        this.followTo(behavior)
      }
    }
  }

  private followTo(behavior: AgentBehavior): void {
    this.applyCamera(MAP_W / 2 - behavior.container.x, MAP_H / 2 - behavior.container.y)
  }

  private applyCamera(x: number, y: number): void {
    const clamp = (v: number): number => Math.max(-CAM_MARGIN, Math.min(CAM_MARGIN, v))
    this.camera.x = clamp(x)
    this.camera.y = clamp(y)
    this.sceneRoot.position.set(this.camera.x, this.camera.y)
  }

  private wireAgentTap(behavior: AgentBehavior): void {
    const onTap = (): void => this.options.onFocus(behavior.id)
    behavior.sprite.on('pointertap', onTap)
    behavior.label.eventMode = 'static'
    behavior.label.cursor = 'pointer'
    behavior.label.on('pointertap', onTap)
  }

  private wireInteraction(): void {
    let dragging = false
    let lastX = 0
    let lastY = 0
    const canvas = this.app.canvas
    const start = (e: PointerEvent): void => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
    }
    const move = (e: PointerEvent): void => {
      if (!dragging) {
        return
      }
      const dx = (e.clientX - lastX) / this.canvasScale
      const dy = (e.clientY - lastY) / this.canvasScale
      lastX = e.clientX
      lastY = e.clientY
      this.applyCamera(this.camera.x + dx, this.camera.y + dy)
    }
    const end = (): void => {
      dragging = false
    }
    canvas.addEventListener('pointerdown', start)
    canvas.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    canvas.style.touchAction = 'none'

    this.pointerCleanup = (): void => {
      canvas.removeEventListener('pointerdown', start)
      canvas.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    }
  }
}