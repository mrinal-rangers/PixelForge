import 'pixi.js/unsafe-eval'
import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import { useOfficeStore } from './store'
import type { OfficeAgentRecord } from './store'
import officeFloorUrl from '../assets/pixel-office/office-floor.png'
import lookRedUrl from '../assets/pixel-office/red.png'
import lookAmberUrl from '../assets/pixel-office/amber.png'
import lookGreenUrl from '../assets/pixel-office/green.png'
import lookCyanUrl from '../assets/pixel-office/cyan.png'
import lookWhiteUrl from '../assets/pixel-office/white.png'

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

const PIXEL_FONT = 'PressStart, monospace'

const LOOKS: string[] = ['red', 'amber', 'green', 'cyan', 'white']

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
  look: string
  visual: VisualState
  animTime: number
}

export class OfficeRenderer {
  private app!: Application
  private sceneRoot!: Container
  private agents = new Map<string, AgentBehavior>()
  private textures = new Map<string, Texture>()
  private destroyed = false

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

    this.syncAgents()
    app.ticker.add(() => this.tick())
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
  }

  private spawnAgent(id: string, record: OfficeAgentRecord, index: number): void {
    const slot = SLOTS[Math.min(index, SLOTS.length - 1)]
    const look = LOOKS[index % LOOKS.length]
    const tex = this.textures.get(look)
    if (!tex) {
      return
    }

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

    const label = this.buildLabel(record.name, record.role)
    container.addChild(label)

    const marker = new Graphics()
    marker.visible = false
    container.addChild(marker)

    const behavior: AgentBehavior = {
      id,
      container,
      sprite,
      shadow,
      label,
      marker,
      look,
      visual: 'idle',
      animTime: 0
    }
    this.wireAgentTap(behavior)
    this.sceneRoot.addChild(behavior.container)
    this.agents.set(id, behavior)
  }

  private buildLabel(name: string, role: string): Container {
    const label = new Container()
    const dot = new Graphics()
    dot.rect(0, 1, 5, 5).fill('#5a5f78')
    label.addChild(dot)

    const nameText = new Text({
      text: name,
      style: {
        fontFamily: PIXEL_FONT,
        fontSize: 9,
        fill: '#f0e6c8',
        stroke: { color: '#141a2e', width: 4 },
        letterSpacing: 0.5
      }
    })
    nameText.position.set(9, 0)
    label.addChild(nameText)

    const roleText = new Text({
      text: role.toUpperCase(),
      style: {
        fontFamily: PIXEL_FONT,
        fontSize: 7,
        fill: '#8b93ad',
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
    const color = kind === 'attention' ? '#ffcc33' : '#ff5c5c'
    g.roundRect(0, 0, 18, 18, 4).fill(color).stroke({ width: 3, color: '#141a2e' })
    g.rect(5, 16, 4, 4).fill(color)
    bubble.addChild(g)
    const glyph = new Text({
      text: kind === 'attention' ? '?' : '!',
      style: { fontFamily: PIXEL_FONT, fontSize: 12, fill: '#ffffff', stroke: { color: '#141a2e', width: 3 } }
    })
    glyph.anchor.set(0.5)
    glyph.position.set(9, 9)
    bubble.addChild(glyph)
    bubble.position.set(10, -92)
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
    g.poly([-6, -44, 6, -44, 0, -36]).fill('#ffcc33')
  }

  private tick(): void {
    if (this.destroyed) {
      return
    }
    const now = Date.now()
    this.syncAgents()
    const agents = useOfficeStore.getState().agents
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

    if (visual !== behavior.visual) {
      behavior.visual = visual
      this.setBubble(behavior, visual === 'attention' ? 'attention' : visual === 'error' ? 'error' : null)
    }

    if (visual === 'working' || visual === 'idle') {
      behavior.animTime += 1
      behavior.sprite.y = (behavior.animTime % 20 < 10 ? 0 : -2) + (visual === 'working' ? -2 : 0)
    } else {
      behavior.sprite.y = 0
    }
  }

  private wireAgentTap(behavior: AgentBehavior): void {
    const onTap = (): void => this.options.onFocus(behavior.id)
    behavior.sprite.on('pointertap', onTap)
    behavior.label.eventMode = 'static'
    behavior.label.cursor = 'pointer'
    behavior.label.on('pointertap', onTap)
  }
}