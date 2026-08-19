import 'pixi.js/unsafe-eval'
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import { useOfficeStore } from '../../application/state/officeStore'
import { useTaskStore } from '../../application/state/taskStore'
import { useGoalStore } from '../../application/state/goalStore'
import { useMemoryStore } from '../../application/state/memoryStore'
import { useMessageStore, unreadCountFor } from '../../application/state/messageStore'
import type { MailEvent } from '../../application/state/messageStore'
import type { OfficeAgentRecord } from '../../application/state/officeStore'
import { OFFICE_MAP, TILE } from './officeMap'
import { buildOffice, CANVAS_W, CANVAS_H, MARGIN } from './buildOffice'
import type { ScreenRect } from './buildOffice'
import { buildCharacterSheet } from './sheetBuilder'
import type { CharacterSheet } from './sheetBuilder'
import { getAvatar, DEFAULT_COWORKER } from './characters'
import { Pathfinder } from './pathfinding'
import type { CharacterSpec, Direction, FrameName, StationId } from './types'

type VisualState = 'working' | 'idle' | 'attention' | 'error' | 'offline'

const WORK_IDLE_MS = 3000
const ATTENTION_MS = 1400
const SUCCESS_MS = 4000
const MEMORY_VISIT_MS = 9000
const WALK_SPEED = 2.6

const PIXEL_FONT = 'PressStart, monospace'

const COLORS = {
  green: '#3ad95e',
  amber: '#ffcc33',
  red: '#ff5c5c',
  cyan: '#3fe0e0',
  grey: '#5a5f78'
}

/** Overflow anchors (office px) for coworker teams larger than four desks. */
const OVERFLOW_SPOTS: Array<{ x: number; y: number; facing: Direction }> = [
  { x: 236, y: 208, facing: 'down' },
  { x: 236, y: 260, facing: 'up' },
  { x: 300, y: 208, facing: 'down' },
  { x: 480, y: 252, facing: 'up' },
  { x: 148, y: 320, facing: 'right' },
  { x: 400, y: 312, facing: 'down' }
]

const DESK_STATIONS: StationId[] = ['worker_desk_1', 'worker_desk_2', 'worker_desk_3', 'worker_desk_4']

interface Anchor {
  x: number
  y: number
  facing: Direction
}

interface Target {
  anchor: Anchor
  seat: Anchor | null
  visual: VisualState
  bubble: 'attention' | 'error' | 'success' | null
}

interface AgentBehavior {
  id: string
  container: Container
  sprite: Sprite
  sheet: CharacterSheet
  shadow: Graphics
  label: Container
  marker: Graphics
  taskIcon: Graphics
  homeStation: StationId | null
  facing: Direction
  visual: VisualState
  path: Array<[number, number]>
  pathIndex: number
  seated: boolean
  lastBubble: 'attention' | 'error' | 'success' | null
  bubbleGfx: Container | null
  prevStatus: string
  animTime: number
  stepPhase: number
  blinkAt: number
  walkedIn: boolean
}

interface MailFlight {
  group: Container
  fromX: number
  fromY: number
  toX: number
  toY: number
  start: number
}

export interface OfficeRendererOptions {
  onFocus: (sessionId: string) => void
}

export class OfficeRenderer {
  private app!: Application
  private sceneRoot!: Container
  private agentsLayer!: Container
  private fxLayer!: Container
  private bubbleLayer!: Container
  private agents = new Map<string, AgentBehavior>()
  private destroyed = false
  private pathfinder = new Pathfinder(OFFICE_MAP)
  private screens: ScreenRect[] = []
  private deskLights: Array<{ id: number; x: number; y: number }> = []
  private screenGfx!: Graphics
  private deskLightGfx!: Graphics
  private stationAgent = new Map<string, string>()
  private archiveDoc!: Container
  private archiveWarning!: Container
  private mailFlights = new Map<string, MailFlight>()
  private seenMail = new Set<string>()
  private mailIndicators = new Map<string, Graphics>()

  constructor(private readonly options: OfficeRendererOptions) {}

  async init(root: HTMLElement): Promise<void> {
    const app = new Application()
    await app.init({
      width: CANVAS_W,
      height: CANVAS_H,
      background: '#0a0d18',
      antialias: false,
      resolution: 1,
      autoDensity: false
    })
    this.app = app
    app.canvas.style.imageRendering = 'pixelated'
    app.canvas.style.display = 'block'
    root.appendChild(app.canvas)

    this.sceneRoot = new Container()
    this.sceneRoot.sortableChildren = true
    app.stage.addChild(this.sceneRoot)

    const built = buildOffice()
    this.screens = built.screens
    this.deskLights = built.deskLights

    const layerA = new Sprite(Texture.from(built.layerA))
    layerA.zIndex = 0
    this.sceneRoot.addChild(layerA)

    this.agentsLayer = new Container()
    this.agentsLayer.zIndex = 1
    this.agentsLayer.sortableChildren = true
    this.sceneRoot.addChild(this.agentsLayer)

    const layerB = new Sprite(Texture.from(built.layerB))
    layerB.zIndex = 10000
    this.sceneRoot.addChild(layerB)

    this.fxLayer = new Container()
    this.fxLayer.zIndex = 20000
    this.sceneRoot.addChild(this.fxLayer)

    this.screenGfx = new Graphics()
    this.fxLayer.addChild(this.screenGfx)

    this.deskLightGfx = new Graphics()
    this.fxLayer.addChild(this.deskLightGfx)

    this.bubbleLayer = new Container()
    this.bubbleLayer.zIndex = 30000
    this.sceneRoot.addChild(this.bubbleLayer)

    this.buildStationHits()
    this.buildArchiveFx()
    this.syncAgents()
    app.ticker.add(() => this.tick())
  }

  // ---- Station hit areas ------------------------------------------------------

  private buildStationHits(): void {
    for (const station of OFFICE_MAP.stations) {
      const g = new Graphics()
      const cx = station.x + MARGIN
      const cy = station.y + MARGIN
      const w = Math.max(24, station.w + 8)
      const h = Math.max(32, station.h + 20)
      g.rect(cx - w / 2, cy - h / 2, w, h)
      g.fill({ color: '#ffffff', alpha: 0.001 })
      g.eventMode = 'static'
      g.cursor = 'pointer'
      g.on('pointertap', () => {
        const agentId = this.stationAgent.get(station.id)
        if (agentId) {
          this.options.onFocus(agentId)
        }
      })
      g.zIndex = 40000
      this.fxLayer.addChild(g)
    }
  }

  private buildArchiveFx(): void {
    this.archiveDoc = new Container()
    this.archiveDoc.visible = false
    this.archiveDoc.zIndex = 40001
    this.fxLayer.addChild(this.archiveDoc)
    const doc = new Graphics()
    doc.rect(0, 0, 12, 15).fill('#f0e6c8').stroke({ width: 2, color: '#141a2e' })
    doc.rect(3, 4, 6, 1).fill('#5a5f78')
    doc.rect(3, 7, 6, 1).fill('#5a5f78')
    doc.rect(3, 10, 4, 1).fill('#5a5f78')
    this.archiveDoc.addChild(doc)

    this.archiveWarning = new Container()
    this.archiveWarning.visible = false
    this.archiveWarning.zIndex = 40002
    this.fxLayer.addChild(this.archiveWarning)
    const warn = new Graphics()
    warn.roundRect(0, 0, 18, 18, 3).fill('#ff5c5c').stroke({ width: 3, color: '#141a2e' })
    this.archiveWarning.addChild(warn)
    const glyph = new Text({
      text: '!',
      style: { fontFamily: PIXEL_FONT, fontSize: 12, fill: '#ffffff', stroke: { color: '#141a2e', width: 3 } }
    })
    glyph.anchor.set(0.5)
    glyph.position.set(9, 9)
    this.archiveWarning.addChild(glyph)
  }

  resize(availW: number, availH: number): void {
    if (!this.app || this.destroyed) {
      return
    }
    const scale = Math.max(0.5, Math.min(availW / CANVAS_W, availH / CANVAS_H))
    const canvas = this.app.canvas
    canvas.style.width = `${Math.round(CANVAS_W * scale)}px`
    canvas.style.height = `${Math.round(CANVAS_H * scale)}px`
  }

  destroy(): void {
    this.destroyed = true
    this.app?.destroy(true, { children: true })
  }

  // ---- Agents ----------------------------------------------------------------

  private specFor(record: OfficeAgentRecord): CharacterSpec {
    const avatar = getAvatar(record.avatarId ?? '')
    return { ...(avatar ?? DEFAULT_COWORKER), name: record.name, role: record.role }
  }

  private stationFor(record: OfficeAgentRecord, index: number): { id: StationId | null; overflow: Anchor | null } {
    if (record.id === useOfficeStore.getState().managerId) {
      return { id: 'manager_desk', overflow: null }
    }
    const desk = record.desk ?? index
    if (desk >= 1 && desk <= 4) {
      return { id: DESK_STATIONS[desk - 1], overflow: null }
    }
    const spot = OVERFLOW_SPOTS[(desk - 5 + OVERFLOW_SPOTS.length) % OVERFLOW_SPOTS.length]
    return { id: null, overflow: spot }
  }

  private syncAgents(): void {
    const { agents } = useOfficeStore.getState()
    const ids = Object.keys(agents)
    for (let index = 0; index < ids.length; index++) {
      const id = ids[index]
      if (!this.agents.has(id)) {
        this.spawnAgent(id, agents[id], index)
      }
    }
    for (const [id, behavior] of this.agents) {
      if (!agents[id]) {
        this.depthRemove(behavior)
        this.agents.delete(id)
      }
    }
  }

  private depthRemove(behavior: AgentBehavior): void {
    this.agentsLayer.removeChild(behavior.container)
    behavior.container.destroy({ children: true })
    const indicator = this.mailIndicators.get(behavior.id)
    if (indicator) {
      this.mailIndicators.delete(behavior.id)
    }
  }

  private spawnAgent(id: string, record: OfficeAgentRecord, index: number): void {
    const spec = this.specFor(record)
    const sheet = buildCharacterSheet(spec)
    const isManager = id === useOfficeStore.getState().managerId
    const { id: stationId } = this.stationFor(record, index)

    const container = new Container()
    const entrance = OFFICE_MAP.entrance
    container.position.set(entrance.x * TILE + TILE / 2 + MARGIN, entrance.y * TILE + TILE + MARGIN)
    container.zIndex = 1

    const shadow = new Graphics()
    shadow.ellipse(0, 1, 9, 4).fill('#00000055')
    container.addChild(shadow)

    const sprite = new Sprite(sheet.frames.down.idle)
    sprite.anchor.set(0.5, 1)
    sprite.eventMode = 'static'
    sprite.cursor = 'pointer'
    container.addChild(sprite)

    const label = this.buildLabel(record.name, record.role, isManager)
    container.addChild(label)

    const marker = new Graphics()
    marker.visible = false
    container.addChild(marker)

    const taskIcon = new Graphics()
    taskIcon.visible = false
    container.addChild(taskIcon)

    const behavior: AgentBehavior = {
      id,
      container,
      sprite,
      sheet,
      shadow,
      label,
      marker,
      taskIcon,
      homeStation: stationId,
      facing: 'down',
      visual: 'idle',
      path: [],
      pathIndex: 0,
      seated: false,
      lastBubble: null,
      bubbleGfx: null,
      prevStatus: record.status,
      animTime: 0,
      stepPhase: 0,
      blinkAt: Date.now() + 1500 + Math.random() * 3000,
      walkedIn: false
    }
    this.wireAgentTap(behavior)
    this.agentsLayer.addChild(behavior.container)
    this.agents.set(id, behavior)
  }

  private buildLabel(name: string, role: string, isManager: boolean): Container {
    const label = new Container()
    const dot = new Graphics()
    dot.rect(0, 1, 5, 5).fill('#5a5f78')
    label.addChild(dot)
    if (isManager) {
      const crown = new Graphics()
      crown.poly([0, 10, 3, 3, 6, 8, 9, 3, 12, 10]).fill('#ffd95a')
      crown.rect(0, 10, 12, 3).fill('#ffd95a')
      crown.position.set(9, -8)
      label.addChild(crown)
    }
    const nameText = new Text({
      text: name,
      style: {
        fontFamily: PIXEL_FONT,
        fontSize: 9,
        fill: isManager ? '#ffd95a' : '#f0e6c8',
        stroke: { color: '#141a2e', width: 4 },
        letterSpacing: 0.5
      }
    })
    nameText.position.set(9, 0)
    label.addChild(nameText)
    const roleText = new Text({
      text: isManager ? 'BOSS' : role.toUpperCase(),
      style: {
        fontFamily: PIXEL_FONT,
        fontSize: 7,
        fill: isManager ? '#ffd95a' : '#8b93ad',
        stroke: { color: '#141a2e', width: 3 }
      }
    })
    roleText.position.set(9, 12)
    label.addChild(roleText)
    label.pivot.set(label.width / 2, 0)
    label.position.set(0, -36)
    return label
  }

  private setLabelDot(behavior: AgentBehavior, color: string): void {
    const dot = behavior.label.children[0] as Graphics
    dot.clear()
    dot.rect(0, 1, 5, 5).fill(color)
  }

  private wireAgentTap(behavior: AgentBehavior): void {
    const onTap = (): void => this.options.onFocus(behavior.id)
    behavior.sprite.on('pointertap', onTap)
    behavior.label.eventMode = 'static'
    behavior.label.cursor = 'pointer'
    behavior.label.on('pointertap', onTap)
  }

  // ---- Target resolution ------------------------------------------------------

  private stationById(id: StationId | null, overflow: Anchor | null): Anchor & { seat: Anchor | null } {
    if (overflow) {
      return { x: overflow.x + MARGIN, y: overflow.y + MARGIN, facing: overflow.facing, seat: null }
    }
    const station = OFFICE_MAP.stations.find((s) => s.id === id)
    if (!station) {
      return { x: 236 + MARGIN, y: 208 + MARGIN, facing: 'down', seat: null }
    }
    return {
      x: station.x + MARGIN,
      y: station.y + MARGIN,
      facing: station.facing,
      seat: station.seat ? { x: station.seat.x + MARGIN, y: station.seat.y + MARGIN, facing: station.seatFacing ?? station.facing } : null
    }
  }

  private hasOpenQuestion(record: OfficeAgentRecord): boolean {
    const tasks = useTaskStore.getState().tasks
    for (const task of Object.values(tasks)) {
      if (task.assignedAgentId !== record.id) {
        continue
      }
      if (task.status === 'needs-input' && task.questions.some((q) => q.answeredAt == null)) {
        return true
      }
    }
    if (record.id === useOfficeStore.getState().managerId) {
      for (const goal of Object.values(useGoalStore.getState().goals)) {
        if (goal.questions.some((q) => q.answeredAt == null)) {
          return true
        }
      }
    }
    return false
  }

  private hasFailed(record: OfficeAgentRecord): boolean {
    const tasks = useTaskStore.getState().tasks
    for (const task of Object.values(tasks)) {
      if (task.assignedAgentId === record.id && task.status === 'failed') {
        return true
      }
    }
    return false
  }

  private hasQueued(record: OfficeAgentRecord): boolean {
    const tasks = useTaskStore.getState().tasks
    for (const task of Object.values(tasks)) {
      if (task.assignedAgentId === record.id && task.status === 'todo') {
        return true
      }
    }
    return false
  }

  private justCompleted(record: OfficeAgentRecord, now: number): boolean {
    const tasks = useTaskStore.getState().tasks
    for (const task of Object.values(tasks)) {
      if (task.assignedAgentId === record.id && task.status === 'done' && task.completedAt && now - task.completedAt < SUCCESS_MS) {
        return true
      }
    }
    return false
  }

  private recentlyUsedMemory(record: OfficeAgentRecord, now: number): boolean {
    for (const memory of Object.values(useMemoryStore.getState().memories)) {
      if (memory.lastUsedAt && now - memory.lastUsedAt < MEMORY_VISIT_MS) {
        if (memory.usage.some((u) => u.agentId === record.id)) {
          return true
        }
      }
    }
    return false
  }

  private isOffline(record: OfficeAgentRecord): boolean {
    return record.cliId === '' || record.status === 'idle' || record.status === 'stopped' || record.status === 'completed'
  }

  private resolveTarget(behavior: AgentBehavior, record: OfficeAgentRecord, index: number, now: number): Target {
    const { id: stationId, overflow } = this.stationFor(record, index)
    const base = this.stationById(stationId, overflow)
    const status = record.status ?? 'stopped'

    const question = this.hasOpenQuestion(record)
    const failed = this.hasFailed(record)
    const offline = this.isOffline(record)

    // Needs human input → walk to the waiting sofa, sit, show a question bubble.
    if (!offline && question && (status === 'running' || status === 'starting')) {
      const sofa = this.stationById('ask_me_sofa', null)
      return {
        anchor: sofa.seat ?? sofa,
        seat: sofa.seat,
        visual: 'attention',
        bubble: 'attention'
      }
    }

    // Task failed or the session is in a hard error state.
    if (failed || status === 'error') {
      return { anchor: base, seat: base.seat, visual: 'error', bubble: 'error' }
    }

    // Agent is booting a session → walk in from the entrance.
    if (status === 'starting' && !behavior.walkedIn) {
      return { anchor: base, seat: base.seat, visual: 'idle', bubble: null }
    }

    // Recently used shared memory → visit the archive reading table.
    if (!offline && this.recentlyUsedMemory(record, now)) {
      const memory = this.stationById('memory_table', null)
      return { anchor: memory, seat: memory.seat, visual: 'working', bubble: null }
    }

    const quiet = record.lastActivityAt ? now - record.lastActivityAt : Number.POSITIVE_INFINITY
    let visual: VisualState = offline ? 'offline' : 'idle'
    let bubble: 'attention' | 'error' | 'success' | null = null
    if (!offline && (status === 'running' || status === 'starting')) {
      if (record.promptPending && quiet > ATTENTION_MS) {
        visual = 'attention'
        bubble = 'attention'
      } else if (quiet > WORK_IDLE_MS) {
        visual = 'idle'
      } else {
        visual = 'working'
      }
    }
    if (this.justCompleted(record, now)) {
      bubble = 'success'
    }
    return { anchor: base, seat: base.seat, visual, bubble }
  }

  // ---- Ticker -----------------------------------------------------------------

  private tick(): void {
    if (this.destroyed) {
      return
    }
    const now = Date.now()
    this.syncAgents()
    const agents = useOfficeStore.getState().agents
    const ids = Object.keys(agents)
    this.stationAgent.clear()

    for (let index = 0; index < ids.length; index++) {
      const id = ids[index]
      const behavior = this.agents.get(id)
      const record = agents[id]
      if (!behavior || !record) {
        continue
      }
      const target = this.resolveTarget(behavior, record, index, now)
      if (behavior.homeStation) {
        this.stationAgent.set(behavior.homeStation, id)
      }
      this.updateAgent(behavior, record, target, now)
      this.updateLabelState(behavior, record)
      this.updateSelectionMarker(behavior)
    }
    this.tickScreens(now)
    this.tickDeskLights(agents, now)
    this.tickArchive(now)
    this.tickMail(now)
    this.sceneRoot.sortChildren()
    this.agentsLayer.sortChildren()
  }

  private updateAgent(behavior: AgentBehavior, record: OfficeAgentRecord, target: Target, now: number): void {
    const status = record.status ?? 'stopped'
    if (status === 'starting' && behavior.prevStatus !== 'starting') {
      behavior.walkedIn = false
    }
    behavior.prevStatus = status

    const dest = target.seat && target.visual !== 'offline' ? target.seat : target.anchor
    this.walkTo(behavior, dest)
    if (behavior.path.length === 0 && status !== 'starting') {
      behavior.walkedIn = true
    }

    const walking = behavior.path.length > 0
    if (walking) {
      behavior.seated = false
      behavior.facing = this.stepDirection(behavior)
    } else {
      behavior.facing = dest.facing
      behavior.seated = Boolean(target.seat && this.atAnchor(behavior, dest))
    }
    if (target.visual !== behavior.visual) {
      behavior.visual = target.visual
    }

    if (target.bubble !== behavior.lastBubble) {
      behavior.lastBubble = target.bubble
      this.setBubble(behavior, target.bubble)
    }
    const hasQueued = !this.isOffline(record) && this.hasQueued(record)
    this.setTaskIcon(behavior, hasQueued)

    this.updateFrames(behavior, walking, now)
    behavior.sprite.alpha = behavior.visual === 'offline' ? 0.4 : 1
    behavior.label.alpha = behavior.visual === 'offline' ? 0.55 : 1
    behavior.shadow.alpha = behavior.visual === 'offline' ? 0.35 : 1
    behavior.container.zIndex = Math.round(behavior.container.position.y) + (this.agentsLayer.zIndex ?? 1)
  }

  private atAnchor(behavior: AgentBehavior, anchor: Anchor): boolean {
    return Math.abs(behavior.container.position.x - anchor.x) < 0.5 && Math.abs(behavior.container.position.y - anchor.y) < 0.5
  }

  private walkTo(behavior: AgentBehavior, dest: Anchor): void {
    const pos = behavior.container.position
    const dx = dest.x - pos.x
    const dy = dest.y - pos.y
    const dist = Math.hypot(dx, dy)
    if (dist <= WALK_SPEED) {
      pos.set(dest.x, dest.y)
      behavior.path = []
      behavior.pathIndex = 0
      return
    }
    if (behavior.path.length === 0) {
      const fromX = Math.floor(pos.x / TILE)
      const fromY = Math.floor(pos.y / TILE)
      const toX = Math.floor(dest.x / TILE)
      const toY = Math.floor(dest.y / TILE)
      behavior.path = this.pathfinder.findPath(fromX, fromY, toX, toY)
      behavior.pathIndex = 0
    }
    if (behavior.path.length > 0) {
      const [tx, ty] = behavior.path[behavior.pathIndex]
      const wx = tx * TILE + TILE / 2 + MARGIN
      const wy = ty * TILE + TILE / 2 + MARGIN
      const pdx = wx - pos.x
      const pdy = wy - pos.y
      const pd = Math.hypot(pdx, pdy)
      if (pd <= WALK_SPEED) {
        pos.set(wx, wy)
        behavior.pathIndex += 1
        if (behavior.pathIndex >= behavior.path.length) {
          behavior.path = []
          behavior.pathIndex = 0
        }
      } else {
        pos.x += (pdx / pd) * WALK_SPEED
        pos.y += (pdy / pd) * WALK_SPEED
      }
      return
    }
    // No path found: ease straight toward the destination.
    pos.x += (dx / dist) * WALK_SPEED
    pos.y += (dy / dist) * WALK_SPEED
  }

  private stepDirection(behavior: AgentBehavior): Direction {
    const pos = behavior.container.position
    if (behavior.path.length > 0) {
      const [tx, ty] = behavior.path[Math.min(behavior.pathIndex, behavior.path.length - 1)]
      const wx = tx * TILE + TILE / 2 + MARGIN
      const wy = ty * TILE + TILE / 2 + MARGIN
      const dx = wx - pos.x
      const dy = wy - pos.y
      if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? 'right' : 'left'
      }
      return dy > 0 ? 'down' : 'up'
    }
    return behavior.facing
  }

  private updateFrames(behavior: AgentBehavior, walking: boolean, now: number): void {
    const dir = behavior.facing
    const frame: FrameName = walking
      ? behavior.stepPhase % 2 === 0
        ? 'walk1'
        : 'walk2'
      : behavior.visual === 'working'
        ? behavior.stepPhase % 2 === 0
          ? 'type1'
          : 'type2'
        : behavior.seated
          ? 'sit'
          : 'idle'
    const tex =
      frame === 'idle' && now - behavior.blinkAt < 140
        ? behavior.sheet.blink[dir]
        : behavior.sheet.frames[dir][frame]
    if (behavior.sprite.texture !== tex) {
      behavior.sprite.texture = tex
    }
    if (now > behavior.blinkAt + 140) {
      behavior.blinkAt = now + 1800 + Math.random() * 3200
    }
    if (walking) {
      behavior.stepPhase = Math.floor(now / 90)
      behavior.sprite.y = 0
    } else if (behavior.visual === 'working') {
      behavior.stepPhase = Math.floor(now / 130)
      behavior.sprite.y = behavior.seated ? (now % 260 < 130 ? 0 : -1) : now % 260 < 130 ? 0 : -2
    } else if (behavior.seated) {
      behavior.stepPhase = 0
      behavior.sprite.y = 0
    } else {
      behavior.stepPhase = 0
      behavior.sprite.y = now % 2000 < 140 ? -1 : 0
    }
  }

  private setBubble(behavior: AgentBehavior, kind: 'attention' | 'error' | 'success' | null): void {
    if (!kind) {
      return
    }
    if (behavior.bubbleGfx) {
      this.bubbleLayer.removeChild(behavior.bubbleGfx)
      behavior.bubbleGfx.destroy({ children: true })
      behavior.bubbleGfx = null
    }
    const g = new Graphics()
    const color = kind === 'attention' ? COLORS.amber : kind === 'error' ? COLORS.red : COLORS.green
    g.roundRect(0, 0, 18, 18, 4).fill(color).stroke({ width: 3, color: '#141a2e' })
    g.rect(5, 16, 4, 4).fill(color)
    const glyph = new Text({
      text: kind === 'attention' ? '?' : kind === 'error' ? '!' : '✓',
      style: { fontFamily: PIXEL_FONT, fontSize: kind === 'success' ? 10 : 12, fill: '#ffffff', stroke: { color: '#141a2e', width: 3 } }
    })
    glyph.anchor.set(0.5)
    glyph.position.set(9, 9)
    g.addChild(glyph)
    g.position.set(behavior.container.position.x + 8, behavior.container.position.y - 34)
    g.zIndex = 50000
    this.bubbleLayer.addChild(g)
    behavior.bubbleGfx = g
    setTimeout(() => {
      if (!this.destroyed) {
        this.bubbleLayer.removeChild(g)
        g.destroy({ children: true })
        if (behavior.bubbleGfx === g) {
          behavior.bubbleGfx = null
        }
      }
    }, kind === 'success' ? 2600 : 5200)
  }

  private setTaskIcon(behavior: AgentBehavior, visible: boolean): void {
    if (behavior.taskIcon.visible === visible) {
      return
    }
    behavior.taskIcon.visible = visible
    if (!visible) {
      return
    }
    const g = behavior.taskIcon
    g.clear()
    g.rect(0, 0, 10, 12).fill('#f0e6c8').stroke({ width: 2, color: '#141a2e' })
    g.rect(2, 3, 6, 1).fill('#5a5f78')
    g.rect(2, 6, 6, 1).fill('#5a5f78')
    g.position.set(12, -16)
  }

  private updateLabelState(behavior: AgentBehavior, record: OfficeAgentRecord): void {
    const status = record.status
    let color = COLORS.grey
    if (status === 'running' || status === 'starting') {
      color = COLORS.green
    }
    if (status === 'error') {
      color = COLORS.red
    }
    if (record.promptPending && status === 'running') {
      color = COLORS.amber
    }
    if (this.hasOpenQuestion(record)) {
      color = COLORS.amber
    }
    this.setLabelDot(behavior, color)
  }

  private updateSelectionMarker(behavior: AgentBehavior): void {
    const selected = useOfficeStore.getState().selectedId === behavior.id
    behavior.marker.visible = selected
    if (!selected) {
      return
    }
    const g = behavior.marker
    g.clear()
    g.poly([-8, -40, 8, -40, 0, -32]).fill('#ffcc33')
  }

  // ---- Screen + desk-light overlays -------------------------------------------

  private tickScreens(now: number): void {
    const g = this.screenGfx
    g.clear()
    const tasks = useTaskStore.getState().tasks
    const anyOngoing = Object.values(tasks).some((t) => t.status === 'ongoing' || t.status === 'needs-input')
    const agents = useOfficeStore.getState().agents

    for (const screen of this.screens) {
      const active = this.screenActivity(screen.id, agents, now, anyOngoing)
      const { x, y, w, h } = screen
      g.rect(x, y, w, h).fill('#0d1526')
      if (!active) {
        g.rect(x + 2, y + h / 2, w - 4, 1).fill('#1a2335')
        continue
      }
      const t = now / 60
      for (let i = 0; i < w - 4; i += 3) {
        const row = y + 3 + ((i * 2 + Math.floor(t)) % (h - 6))
        g.rect(x + 2 + i, row, 2, 2).fill('#3fe0e0')
      }
      g.rect(x + 2, y + h - 3, w - 4, 1).fill('#1f7070')
    }
  }

  private screenActivity(id: string, agents: Record<string, OfficeAgentRecord>, now: number, anyOngoing: boolean): boolean {
    const activeNow = (agentId: string): boolean => {
      const record = agents[agentId]
      if (!record || this.isOffline(record)) {
        return false
      }
      const quiet = record.lastActivityAt ? now - record.lastActivityAt : Number.POSITIVE_INFINITY
      return quiet < WORK_IDLE_MS
    }
    if (id.startsWith('desk')) {
      const n = Number.parseInt(id.slice(4), 10)
      const station = `worker_desk_${n}`
      const agentId = this.stationAgent.get(station)
      return agentId ? activeNow(agentId) : false
    }
    if (id.startsWith('test')) {
      return anyOngoing
    }
    if (id === 'lab') {
      return anyOngoing
    }
    if (id === 'server') {
      return true
    }
    if (id === 'console') {
      return true
    }
    if (id === 'wallconsole') {
      return true
    }
    return false
  }

  private tickDeskLights(agents: Record<string, OfficeAgentRecord>, now: number): void {
    const g = this.deskLightGfx
    g.clear()
    for (const light of this.deskLights) {
      const station = `worker_desk_${light.id}`
      const agentId = this.stationAgent.get(station)
      let color = '#20262e'
      if (agentId && agents[agentId]) {
        const record = agents[agentId]
        if (this.isOffline(record)) {
          color = '#3a4150'
        } else if (record.status === 'error' || this.hasFailed(record)) {
          color = COLORS.red
        } else if (this.hasOpenQuestion(record)) {
          color = COLORS.amber
        } else if (record.promptPending) {
          color = COLORS.amber
        } else {
          const quiet = record.lastActivityAt ? now - record.lastActivityAt : Number.POSITIVE_INFINITY
          color = quiet < WORK_IDLE_MS ? COLORS.green : COLORS.cyan
        }
      }
      g.rect(light.x, light.y, 2, 2).fill(color)
    }
  }

  private tickArchive(now: number): void {
    const memory = useMemoryStore.getState()
    const [docX, docY] = [14 * TILE + MARGIN, 59 * TILE + MARGIN]
    if (memory.lastCreated && now - memory.lastCreated.ts < 4000) {
      this.archiveDoc.visible = true
      this.archiveDoc.position.set(docX, docY + Math.floor((now % 500) / 250) * -2)
    } else if (this.archiveDoc.visible) {
      this.archiveDoc.visible = false
    }
    const [warnX, warnY] = [10 * TILE + MARGIN, 50 * TILE + MARGIN]
    if (memory.conflictNotice && now - memory.conflictNotice.ts < 4000) {
      this.archiveWarning.visible = true
      this.archiveWarning.position.set(warnX, warnY)
    } else if (this.archiveWarning.visible) {
      this.archiveWarning.visible = false
    }
  }

  // ---- Mail envelopes ---------------------------------------------------------

  private tickMail(now: number): void {
    const { mailEvents } = useMessageStore.getState()
    for (const event of mailEvents) {
      if (this.seenMail.has(event.id)) {
        continue
      }
      this.seenMail.add(event.id)
      this.spawnMailFlight(event, now)
    }
    if (this.seenMail.size > 120) {
      const active = new Set(mailEvents.map((event) => event.id))
      for (const id of [...this.seenMail]) {
        if (!active.has(id)) {
          this.seenMail.delete(id)
        }
      }
    }
    for (const [id, flight] of this.mailFlights) {
      const t = Math.min(1, (now - flight.start) / 900)
      const x = flight.fromX + (flight.toX - flight.fromX) * t
      const y = flight.fromY + (flight.toY - flight.fromY) * t - Math.sin(t * Math.PI) * 32
      flight.group.position.set(x, y)
      flight.group.rotation = Math.sin(t * Math.PI) * 0.18
      if (t >= 1) {
        this.sceneRoot.removeChild(flight.group)
        flight.group.destroy({ children: true })
        this.mailFlights.delete(id)
      }
    }
    for (const [agentId, behavior] of this.agents) {
      const unread = unreadCountFor(agentId)
      let indicator = this.mailIndicators.get(agentId)
      if (unread > 0) {
        if (!indicator) {
          indicator = this.buildMailIndicator()
          this.fxLayer.addChild(indicator)
          this.mailIndicators.set(agentId, indicator)
        }
        indicator.visible = true
        const bob = Math.floor(now / 400) % 2 === 0 ? -2 : 0
        indicator.position.set(behavior.container.position.x + 12, behavior.container.position.y - 22 + bob)
      } else if (indicator) {
        indicator.visible = false
      }
    }
  }

  private spawnMailFlight(event: MailEvent, now: number): void {
    const desk = (id: string): { x: number; y: number } | null => {
      if (id === 'user') {
        return null
      }
      const behavior = this.agents.get(id)
      return behavior ? { x: behavior.container.position.x, y: behavior.container.position.y - 40 } : null
    }
    const from = desk(event.fromId)
    if (!from) {
      return
    }
    const to = desk(event.toId)
    const group = this.buildEnvelope(event.urgent)
    group.position.set(from.x, from.y)
    group.zIndex = 40003
    this.sceneRoot.addChild(group)
    this.mailFlights.set(event.id, {
      group,
      fromX: from.x,
      fromY: from.y,
      toX: to ? to.x : from.x + 160,
      toY: to ? to.y : -40,
      start: now
    })
  }

  private buildEnvelope(urgent: boolean): Container {
    const group = new Container()
    const g = new Graphics()
    const color = urgent ? '#ff4d5e' : '#f0e6c8'
    g.rect(-8, -6, 16, 12).fill(color).stroke({ width: 2, color: '#141a2e' })
    g.poly([-8, -6, 0, 2, 8, -6]).fill('#141a2e')
    g.rect(-4, -3, 2, 2).fill(urgent ? '#ffffff' : '#5a5f78')
    g.poly([-8, 6, 0, -2, 8, 6]).fill('#ffffff33')
    group.addChild(g)
    return group
  }

  private buildMailIndicator(): Graphics {
    const g = new Graphics()
    g.rect(-7, -5, 14, 10).fill('#ffcc33').stroke({ width: 2, color: '#141a2e' })
    g.poly([-7, -5, 0, 1, 7, -5]).fill('#141a2e')
    g.visible = false
    return g
  }
}