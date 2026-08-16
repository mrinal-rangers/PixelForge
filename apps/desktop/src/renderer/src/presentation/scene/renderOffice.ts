import 'pixi.js/unsafe-eval'
import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import { useOfficeStore } from '../../application/state/officeStore'
import { useTaskStore } from '../../application/state/taskStore'
import { useMemoryStore } from '../../application/state/memoryStore'
import { useMessageStore, unreadCountFor } from '../../application/state/messageStore'
import type { MailEvent } from '../../application/state/messageStore'
import type { OfficeAgentRecord } from '../../application/state/officeStore'
import officeFloorUrl from '../../assets/pixel-office/office-floor.png'
import lookRedUrl from '../../assets/pixel-office/red.png'
import lookAmberUrl from '../../assets/pixel-office/amber.png'
import lookGreenUrl from '../../assets/pixel-office/green.png'
import lookCyanUrl from '../../assets/pixel-office/cyan.png'
import lookWhiteUrl from '../../assets/pixel-office/white.png'

type VisualState =
  | 'working'
  | 'idle'
  | 'attention'
  | 'error'
  | 'offline'

const FLOOR_W = 1024
const FLOOR_H = 896
const WORK_IDLE_MS = 2800
const ATTENTION_MS = 1400
const WALK_SPEED = 3.2
const SUCCESS_MS = 4000

const PIXEL_FONT = 'PressStart, monospace'

const LOOKS: string[] = ['red', 'amber', 'green', 'cyan', 'white']

function lookFor(avatarId: string | undefined, index: number): string {
  if (!avatarId) {
    return LOOKS[index % LOOKS.length]
  }
  let hash = 0
  for (let i = 0; i < avatarId.length; i++) {
    hash = (hash * 31 + avatarId.charCodeAt(i)) >>> 0
  }
  return LOOKS[hash % LOOKS.length]
}

/**
 * Agent anchor slots on the 1024x896 office floor (4x of the 256x224 scene).
 * The first five sit on the baked-in figures; the rest spread across open floor.
 */
const SLOTS: { x: number; y: number }[] = [
  { x: 188, y: 820 },
  { x: 728, y: 824 },
  { x: 876, y: 848 },
  { x: 188, y: 600 },
  { x: 700, y: 600 },
  { x: 380, y: 820 },
  { x: 520, y: 680 },
  { x: 380, y: 680 },
  { x: 600, y: 840 },
  { x: 96, y: 640 },
  { x: 928, y: 640 }
]

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
  taskIcon: Graphics
  look: string
  visual: VisualState
  lastBubble: 'attention' | 'error' | 'success' | null
  prevStatus: string
  animTime: number
  homeX: number
  homeY: number
  entering: boolean
}

interface MailFlight {
  group: Container
  fromX: number
  fromY: number
  toX: number
  toY: number
  start: number
}

export class OfficeRenderer {
  private app!: Application
  private sceneRoot!: Container
  private agents = new Map<string, AgentBehavior>()
  private textures = new Map<string, Texture>()
  private destroyed = false
  private archiveDoc!: Graphics
  private archiveWarning!: Graphics
  private archiveGlyph!: Text
  private mailFlights = new Map<string, MailFlight>()
  private seenMail = new Set<string>()
  private mailIndicators = new Map<string, Graphics>()

  constructor(private readonly options: OfficeRendererOptions) {}

  async init(root: HTMLElement): Promise<void> {
    const app = new Application()
    await app.init({
      width: FLOOR_W,
      height: FLOOR_H,
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
    app.stage.addChild(this.sceneRoot)

    const [floorTex, redTex, amberTex, greenTex, cyanTex, whiteTex] = await Promise.all([
      Assets.load<Texture>(officeFloorUrl),
      Assets.load<Texture>(lookRedUrl),
      Assets.load<Texture>(lookAmberUrl),
      Assets.load<Texture>(lookGreenUrl),
      Assets.load<Texture>(lookCyanUrl),
      Assets.load<Texture>(lookWhiteUrl)
    ])
    this.textures.set('floor', floorTex)
    this.textures.set('red', redTex)
    this.textures.set('amber', amberTex)
    this.textures.set('green', greenTex)
    this.textures.set('cyan', cyanTex)
    this.textures.set('white', whiteTex)

    const floor = new Sprite(floorTex)
    floor.position.set(0, 0)
    this.sceneRoot.addChild(floor)

    this.buildArchive()
    this.syncAgents()
    app.ticker.add(() => this.tick())
  }

  private buildArchive(): void {
    const archive = new Container()
    const shelf = new Graphics()
    shelf.rect(0, 0, 96, 60).fill('#151a30').stroke({ width: 4, color: '#3b4a82' })
    shelf.rect(4, 20, 88, 4).fill('#2a3352')
    shelf.rect(4, 40, 88, 4).fill('#2a3352')
    const bookColors = ['#e8b84b', '#4b9de8', '#7b5bd6', '#4bc98a', '#e86b6b']
    for (let i = 0; i < 8; i++) {
      const x = 8 + i * 11
      const y = i % 2 === 0 ? 8 : 28
      shelf.rect(x, y, 8, 12).fill(bookColors[i % bookColors.length])
    }
    archive.addChild(shelf)
    const label = new Text({
      text: 'ARCHIVE',
      style: {
        fontFamily: PIXEL_FONT,
        fontSize: 8,
        fill: '#8b93ad',
        stroke: { color: '#141a2e', width: 3 }
      }
    })
    label.position.set(0, 68)
    archive.addChild(label)
    archive.position.set(56, 160)
    archive.zIndex = 100
    this.sceneRoot.addChild(archive)

    this.archiveDoc = new Graphics()
    this.archiveDoc.visible = false
    this.archiveDoc.zIndex = 101
    this.sceneRoot.addChild(this.archiveDoc)

    this.archiveWarning = new Graphics()
    this.archiveWarning.visible = false
    this.archiveWarning.zIndex = 102
    this.sceneRoot.addChild(this.archiveWarning)

    this.archiveGlyph = new Text({
      text: '!',
      style: { fontFamily: PIXEL_FONT, fontSize: 12, fill: '#ffffff', stroke: { color: '#141a2e', width: 3 } }
    })
    this.archiveGlyph.anchor.set(0.5)
    this.archiveGlyph.position.set(9, 9)
    this.archiveWarning.addChild(this.archiveGlyph)
  }

  private tickArchive(now: number): void {
    const memory = useMemoryStore.getState()
    if (memory.lastCreated && now - memory.lastCreated.ts < 4000) {
      this.archiveDoc.visible = true
      this.archiveDoc.clear()
      this.archiveDoc.rect(0, 0, 12, 15).fill('#f0e6c8').stroke({ width: 2, color: '#141a2e' })
      this.archiveDoc.rect(3, 4, 6, 1).fill('#5a5f78')
      this.archiveDoc.rect(3, 7, 6, 1).fill('#5a5f78')
      this.archiveDoc.rect(3, 10, 4, 1).fill('#5a5f78')
      this.archiveDoc.position.set(96, 160 + Math.floor((now % 500) / 250) * -2)
    } else if (this.archiveDoc.visible) {
      this.archiveDoc.visible = false
    }

    if (memory.conflictNotice && now - memory.conflictNotice.ts < 4000) {
      this.archiveWarning.visible = true
      this.archiveWarning.clear()
      this.archiveWarning.roundRect(0, 0, 18, 18, 3).fill('#ff5c5c').stroke({ width: 3, color: '#141a2e' })
      this.archiveWarning.position.set(150, 150)
    } else if (this.archiveWarning.visible) {
      this.archiveWarning.clear()
      this.archiveWarning.visible = false
    }
  }

  resize(availW: number, availH: number): void {
    if (!this.app || this.destroyed) {
      return
    }
    let scale: number
    if (availW >= FLOOR_W && availH >= FLOOR_H) {
      scale = Math.max(1, Math.floor(Math.min(availW / FLOOR_W, availH / FLOOR_H)))
    } else {
      scale = Math.min(availW / FLOOR_W, availH / FLOOR_H)
    }
    const canvas = this.app.canvas
    canvas.style.width = `${FLOOR_W * scale}px`
    canvas.style.height = `${FLOOR_H * scale}px`
  }

  destroy(): void {
    this.destroyed = true
    this.app?.destroy(true, { children: true })
  }

  // ---- Agents --------------------------------------------------------------

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
    this.sceneRoot.removeChild(behavior.container)
    behavior.container.destroy({ children: true })
    const indicator = this.mailIndicators.get(behavior.id)
    if (indicator) {
      this.mailIndicators.delete(behavior.id)
    }
  }

  private spawnAgent(id: string, record: OfficeAgentRecord, index: number): void {
    const slot = SLOTS[Math.min(record.desk ?? index, SLOTS.length - 1)]
    const look = lookFor(record.avatarId, index)
    const tex = this.textures.get(look)
    if (!tex) {
      return
    }
    const isManager = id === useOfficeStore.getState().managerId

    const container = new Container()
    container.position.set(slot.x, slot.y)
    container.zIndex = slot.y

    const shadow = new Graphics()
    shadow.ellipse(0, 1, 16, 6).fill('#00000055')
    container.addChild(shadow)

    const sprite = new Sprite(tex)
    sprite.anchor.set(0.5, 1)
    sprite.scale.set(4)
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
      shadow,
      label,
      marker,
      taskIcon,
      look,
      visual: 'idle',
      lastBubble: null,
      prevStatus: record.status,
      animTime: 0,
      homeX: slot.x,
      homeY: slot.y,
      entering: false
    }
    if (record.status === 'starting') {
      behavior.entering = true
      container.position.set(slot.x, -40)
    }
    this.wireAgentTap(behavior)
    this.sceneRoot.addChild(behavior.container)
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
    label.position.set(0, -84)
    return label
  }

  private setLabelDot(behavior: AgentBehavior, color: string): void {
    const dot = behavior.label.children[0] as Graphics
    dot.clear()
    dot.rect(0, 1, 5, 5).fill(color)
  }

  private updateLabelState(behavior: AgentBehavior, record?: OfficeAgentRecord): void {
    const status = record?.status
    let color = '#5a5f78'
    if (status === 'running' || status === 'starting') {
      color = '#3ad95e'
    }
    if (status === 'error') {
      color = '#ff5c5c'
    }
    if (record?.promptPending && status === 'running') {
      color = '#ffcc33'
    }
    this.setLabelDot(behavior, color)
  }

  private setBubble(
    behavior: AgentBehavior,
    kind: 'attention' | 'error' | 'success' | null
  ): void {
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
    const color = kind === 'attention' ? '#ffcc33' : kind === 'error' ? '#ff5c5c' : '#3ad95e'
    g.roundRect(0, 0, 18, 18, 4).fill(color).stroke({ width: 3, color: '#141a2e' })
    g.rect(5, 16, 4, 4).fill(color)
    bubble.addChild(g)
    const glyph = new Text({
      text: kind === 'attention' ? '?' : kind === 'error' ? '!' : '✓',
      style: { fontFamily: PIXEL_FONT, fontSize: kind === 'success' ? 10 : 12, fill: '#ffffff', stroke: { color: '#141a2e', width: 3 } }
    })
    glyph.anchor.set(0.5)
    glyph.position.set(9, 9)
    bubble.addChild(glyph)
    bubble.position.set(10, -92)
    behavior.container.addChild(bubble)
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
    g.position.set(16, -24)
  }

  private updateSelectionMarker(behavior: AgentBehavior): void {
    const selected = useOfficeStore.getState().selectedId === behavior.id
    behavior.marker.visible = selected
    if (!selected) {
      return
    }
    const g = behavior.marker
    g.clear()
    g.poly([-6, -44, 6, -44, 0, -36]).fill('#ffcc33')
  }

  private tick(): void {
    if (this.destroyed) {
      return
    }
    const now = Date.now()
    this.syncAgents()
    const agents = useOfficeStore.getState().agents
    this.tickArchive(now)
    this.tickMail(now)
    for (const behavior of this.agents.values()) {
      const record = agents[behavior.id]
      this.updateVisual(behavior, now, record)
      this.updateLabelState(behavior, record)
      this.updateSelectionMarker(behavior)
    }
    this.sceneRoot.sortChildren()
  }

  private updateVisual(behavior: AgentBehavior, now: number, record?: OfficeAgentRecord): void {
    const status = record?.status ?? 'stopped'
    let visual: VisualState = 'offline'
    if (record && record.cliId === '') {
      visual = 'offline'
    } else if (status === 'starting' || status === 'running') {
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

    if (status === 'starting' && behavior.prevStatus !== 'starting') {
      behavior.entering = true
      behavior.container.position.set(behavior.homeX, -40)
    }
    behavior.prevStatus = status

    const taskState = this.taskStateFor(behavior.id, now)
    const offline = visual === 'offline'
    if (!offline && (status === 'running' || status === 'starting')) {
      if (taskState.hasOpenQuestion) {
        visual = 'attention'
      } else if (taskState.hasFailed) {
        visual = 'error'
      }
    }
    let bubbleKind: 'attention' | 'error' | 'success' | null = null
    if (taskState.justCompleted) {
      bubbleKind = 'success'
    } else if (visual === 'attention') {
      bubbleKind = 'attention'
    } else if (visual === 'error') {
      bubbleKind = 'error'
    }

    if (visual !== behavior.visual) {
      behavior.visual = visual
    }
    if (bubbleKind !== behavior.lastBubble) {
      behavior.lastBubble = bubbleKind
      this.setBubble(behavior, bubbleKind)
    }
    this.setTaskIcon(behavior, !offline && taskState.hasQueued)

    if (behavior.entering) {
      const dx = behavior.homeX - behavior.container.position.x
      const dy = behavior.homeY - behavior.container.position.y
      const dist = Math.hypot(dx, dy)
      if (dist < WALK_SPEED) {
        behavior.entering = false
        behavior.container.position.set(behavior.homeX, behavior.homeY)
      } else {
        behavior.container.position.x += (dx / dist) * WALK_SPEED
        behavior.container.position.y += (dy / dist) * WALK_SPEED
      }
      const bob = Math.floor(now / 120) % 2 === 0 ? -3 : 0
      behavior.sprite.y = bob
    } else if (visual === 'working' || visual === 'idle') {
      behavior.animTime += 1
      const period = visual === 'working' ? 10 : 20
      const amp = visual === 'working' ? 3 : 2
      behavior.sprite.y = (behavior.animTime % period < period / 2 ? 0 : -amp) + (visual === 'working' ? -2 : 0)
    } else {
      behavior.sprite.y = 0
    }

    behavior.sprite.alpha = offline ? 0.35 : 1
    behavior.label.alpha = offline ? 0.5 : 1
    behavior.shadow.alpha = offline ? 0.4 : 1
    behavior.container.zIndex = Math.round(behavior.container.position.y)
  }

  private taskStateFor(
    agentId: string,
    now: number
  ): { hasOpenQuestion: boolean; hasFailed: boolean; hasQueued: boolean; justCompleted: boolean } {
    let hasOpenQuestion = false
    let hasFailed = false
    let hasQueued = false
    let justCompleted = false
    for (const task of Object.values(useTaskStore.getState().tasks)) {
      if (task.assignedAgentId !== agentId) {
        continue
      }
      if (task.status === 'needs-input' && task.questions.some((q) => q.answeredAt == null)) {
        hasOpenQuestion = true
      } else if (task.status === 'failed') {
        hasFailed = true
      } else if (task.status === 'todo') {
        hasQueued = true
      } else if (task.status === 'done' && task.completedAt && now - task.completedAt < SUCCESS_MS) {
        justCompleted = true
      }
    }
    return { hasOpenQuestion, hasFailed, hasQueued, justCompleted }
  }

  private wireAgentTap(behavior: AgentBehavior): void {
    const onTap = (): void => this.options.onFocus(behavior.id)
    behavior.sprite.on('pointertap', onTap)
    behavior.label.eventMode = 'static'
    behavior.label.cursor = 'pointer'
    behavior.label.on('pointertap', onTap)
  }

  // ---- Mail envelopes and indicators ---------------------------------------

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
      const y = flight.fromY + (flight.toY - flight.fromY) * t - Math.sin(t * Math.PI) * 42
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
          behavior.container.addChild(indicator)
          this.mailIndicators.set(agentId, indicator)
        }
        indicator.visible = true
        const bob = Math.floor(now / 400) % 2 === 0 ? -2 : 0
        indicator.position.set(26, -30 + bob)
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
      return behavior
        ? { x: behavior.container.position.x, y: behavior.container.position.y - 70 }
        : null
    }
    const from = desk(event.fromId)
    if (!from) {
      return
    }
    const to = desk(event.toId)
    const group = this.buildEnvelope(event.urgent)
    group.position.set(from.x, from.y)
    group.zIndex = 1000
    this.sceneRoot.addChild(group)
    this.mailFlights.set(event.id, {
      group,
      fromX: from.x,
      fromY: from.y,
      toX: to ? to.x : from.x + 200,
      toY: to ? to.y : -60,
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