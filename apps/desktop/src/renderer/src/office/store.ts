import { create } from 'zustand'
import type { CoworkerConfig, SessionInfo, SessionStatus } from '@shared/types'

export interface OfficeAgentRecord {
  id: string
  name: string
  role: string
  cliId: string
  status: SessionStatus
  /** Unix ms of the most recent terminal output. */
  lastActivityAt: number | null
  /** Heuristic: last output ended with something that reads like a prompt. */
  promptPending: boolean
  projectPath?: string
  avatarId?: string
  accent?: string
  description?: string
  goal?: string
  startedAt?: number
  provider?: string
  model?: string
  autoMode?: boolean
  reasoning?: string
  template?: string
  desk?: number
  resumeSessionId?: string
  worktree?: CoworkerConfig['worktree']
  createdAt?: number
}

export interface MemoryNote {
  id: string
  agentId: string
  text: string
  ts: number
}

export interface ConversationItem {
  id: number
  from: 'me' | 'agent'
  text: string
  ts: number
}

export interface HireProfile {
  name: string
  role: string
  projectPath?: string
  cliId?: string
  description?: string
  goal?: string
  avatarId?: string
  accent?: string
  autoMode?: boolean
  reasoning?: string
  template?: string
  desk?: number
  resumeSessionId?: string
  worktree?: CoworkerConfig['worktree']
}

interface OfficeState {
  agents: Record<string, OfficeAgentRecord>
  selectedId: string | null
  managerId: string | null
  focusRequest: { sessionId: string; nonce: number } | null
  autoMode: boolean
  projects: string[]
  activity: Record<string, string[]>
  memory: MemoryNote[]
  conversations: Record<string, ConversationItem[]>
  upsertAgent: (session: SessionInfo) => void
  hireAgent: (profile: HireProfile) => string
  hydrateCoworkers: (configs: CoworkerConfig[]) => void
  setAgentAutoMode: (sessionId: string, value: boolean) => void
  updateAgentMeta: (
    sessionId: string,
    fields: { name?: string; role?: string; description?: string; goal?: string }
  ) => void
  recordOutput: (sessionId: string, data: string) => void
  recordInput: (sessionId: string) => void
  removeAgent: (sessionId: string) => void
  requestFocus: (sessionId: string) => void
  setSelected: (sessionId: string | null) => void
  toggleAutoMode: () => void
  pushConversation: (agentId: string, item: ConversationItem) => void
  clearConversation: (agentId: string) => void
  addProject: (path: string) => void
  removeProject: (path: string) => void
  addMemory: (agentId: string, text: string) => void
  removeMemory: (noteId: string) => void
  clearActivity: (sessionId: string) => void
}

let focusNonce = 0
let idCounter = 0
let draftCounter = 0
let conversationCounter = 0

const AUTO_KEY = 'pixelforge-auto-mode'
const PROJECTS_KEY = 'pixelforge-projects'

function loadProjects(): string[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY)
    if (!raw) {
      return []
    }
    return JSON.parse(raw) as string[]
  } catch {
    return []
  }
}

function toCoworkerConfig(record: OfficeAgentRecord): CoworkerConfig {
  return {
    id: record.id,
    name: record.name,
    role: record.role,
    description: record.description,
    goal: record.goal,
    avatarId: record.avatarId,
    accent: record.accent,
    projectPath: record.projectPath,
    cliId: record.cliId || undefined,
    provider: record.provider,
    model: record.model,
    autoMode: record.autoMode,
    reasoning: record.reasoning,
    template: record.template,
    desk: record.desk,
    startedAt: record.startedAt,
    resumeSessionId: record.resumeSessionId,
    worktree: record.worktree,
    createdAt: record.createdAt ?? record.startedAt ?? Date.now()
  }
}

const lastConfigs = new Map<string, CoworkerConfig>()

function persistCoworker(record: OfficeAgentRecord): void {
  const prev = lastConfigs.get(record.id)
  const config = toCoworkerConfig(record)
  const merged: CoworkerConfig = {
    ...prev,
    ...config,
    desk: config.desk ?? prev?.desk,
    reasoning: config.reasoning ?? prev?.reasoning,
    template: config.template ?? prev?.template,
    worktree: config.worktree ?? prev?.worktree,
    resumeSessionId: config.resumeSessionId ?? prev?.resumeSessionId,
    createdAt: config.createdAt ?? prev?.createdAt
  }
  lastConfigs.set(record.id, merged)
  window.workspace.saveCoworker(merged).catch(() => {
    // persistence is best-effort
  })
}

function stripAnsi(data: string): string {
  // eslint-disable-next-line no-control-regex
  return data.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
}

function looksLikePrompt(data: string): boolean {
  const lines = stripAnsi(data)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
  const last = (lines[lines.length - 1] ?? '').trimEnd()
  if (!last) {
    return false
  }
  return (
    /[>?]$/.test(last) ||
    /\((y|n)\/(y|n)\)|y\/n|Y\/N|n\/y|N\/y/i.test(last) ||
    /\[[yY]\/[nN]\]/.test(last) ||
    /press enter|press return/i.test(last) ||
    /select an option|choose one|your answer/i.test(last)
  )
}

export const useOfficeStore = create<OfficeState>()((set, get) => ({
  agents: {},
  selectedId: null,
  managerId: null,
  focusRequest: null,
  autoMode: localStorage.getItem(AUTO_KEY) !== 'off',
  projects: loadProjects(),
  activity: {},
  memory: [],
  conversations: {},

  upsertAgent: (session) =>
    set((state) => {
      const isFirst = Object.keys(state.agents).length === 0
      const existing = state.agents[session.id]
      const record: OfficeAgentRecord = {
        id: session.id,
        name: isFirst ? 'Manager' : session.name ?? existing?.name ?? session.cli.name,
        role: isFirst ? 'Manager' : session.role ?? existing?.role ?? 'Developer',
        cliId: session.cli.id,
        status: session.status,
        lastActivityAt: existing?.lastActivityAt ?? null,
        promptPending: existing?.promptPending ?? false,
        projectPath: session.projectPath,
        avatarId: session.avatarId,
        accent: session.accent,
        description: session.description,
        goal: session.goal,
        startedAt: session.startedAt ?? existing?.startedAt,
        provider: session.provider ?? session.cli.name,
        model: session.model,
        autoMode: session.autoMode,
        reasoning: existing?.reasoning,
        template: existing?.template,
        desk: existing?.desk,
        resumeSessionId: session.resumeSessionId ?? existing?.resumeSessionId,
        worktree: existing?.worktree,
        createdAt: existing?.createdAt
      }
      persistCoworker(record)
      return {
        agents: {
          ...state.agents,
          [session.id]: record
        },
        managerId: isFirst ? session.id : state.managerId,
        selectedId: state.selectedId ?? session.id
      }
    }),

  hireAgent: (profile) => {
    const id = `draft-${++draftCounter}`
    const isFirst = Object.keys(get().agents).length === 0
    const desk = Object.keys(get().agents).length
    const record: OfficeAgentRecord = {
      id,
      name: isFirst ? 'Manager' : profile.name,
      role: isFirst ? 'Manager' : profile.role,
      cliId: profile.cliId ?? '',
      status: 'idle',
      lastActivityAt: null,
      promptPending: false,
      projectPath: profile.projectPath,
      description: profile.description,
      goal: profile.goal,
      avatarId: profile.avatarId,
      accent: profile.accent,
      autoMode: profile.autoMode,
      reasoning: profile.reasoning,
      template: profile.template,
      desk: profile.desk ?? desk,
      resumeSessionId: profile.resumeSessionId,
      worktree: profile.worktree,
      createdAt: Date.now()
    }
    persistCoworker(record)
    set((state) => ({
      agents: {
        ...state.agents,
        [id]: record
      },
      managerId: isFirst ? id : state.managerId,
      selectedId: state.selectedId ?? id
    }))
    return id
  },

  hydrateCoworkers: (configs) => {
    for (const config of configs) {
      lastConfigs.set(config.id, config)
    }
    const existing = new Set(Object.keys(get().agents))
    let changed = false
    const hydrated: Record<string, OfficeAgentRecord> = {}
    for (const config of configs) {
      if (existing.has(config.id)) {
        continue
      }
      changed = true
      hydrated[config.id] = {
        id: config.id,
        name: config.name,
        role: config.role,
        cliId: config.cliId ?? '',
        status: 'idle',
        lastActivityAt: null,
        promptPending: false,
        projectPath: config.projectPath,
        avatarId: config.avatarId,
        accent: config.accent,
        description: config.description,
        goal: config.goal,
        startedAt: config.startedAt,
        provider: config.provider,
        model: config.model,
        autoMode: config.autoMode,
        reasoning: config.reasoning,
        template: config.template,
        desk: config.desk,
        resumeSessionId: config.resumeSessionId,
        worktree: config.worktree,
        createdAt: config.createdAt
      }
    }
    if (!changed) {
      return
    }
    set((state) => {
      const isFirst = Object.keys(state.agents).length === 0
      return {
        agents: { ...state.agents, ...hydrated },
        managerId: isFirst && Object.keys(hydrated).length > 0 ? Object.keys(hydrated)[0] : state.managerId,
        selectedId: state.selectedId ?? (Object.keys(hydrated)[0] ?? null)
      }
    })
  },

  recordOutput: (sessionId, data) => {
    if (!data) {
      return
    }
    const agent = get().agents[sessionId]
    if (!agent) {
      return
    }
    const now = Date.now()
    const lines = stripAnsi(data)
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
    set({
      agents: {
        ...get().agents,
        [sessionId]: {
          ...agent,
          lastActivityAt: now,
          promptPending: looksLikePrompt(data) ? true : agent.promptPending
        }
      },
      activity: {
        ...get().activity,
        [sessionId]: [
          ...(get().activity[sessionId] ?? []),
          ...lines.map((line) => `[${new Date(now).toLocaleTimeString()}] ${line}`)
        ].slice(-400)
      }
    })
  },

  recordInput: (sessionId) => {
    const agent = get().agents[sessionId]
    if (!agent) {
      return
    }
    set({
      agents: {
        ...get().agents,
        [sessionId]: { ...agent, lastActivityAt: Date.now(), promptPending: false }
      }
    })
  },

  removeAgent: (sessionId) => {
    if (sessionId === get().managerId) {
      return
    }
    const agent = get().agents[sessionId]
    if (agent?.worktree && agent.worktree.base) {
      window.workspace
        .worktreeRemove(agent.worktree.base, agent.worktree.path)
        .catch(() => {
          // worktree cleanup is best-effort
        })
    }
    window.workspace.removeCoworker(sessionId).catch(() => {
      // config removal is best-effort
    })
    lastConfigs.delete(sessionId)
    set((state) => {
      const agents = { ...state.agents }
      delete agents[sessionId]
      return {
        agents,
        selectedId: state.selectedId === sessionId ? null : state.selectedId,
        activity: Object.fromEntries(
          Object.entries(state.activity).filter(([id]) => id !== sessionId)
        ),
        conversations: Object.fromEntries(
          Object.entries(state.conversations).filter(([id]) => id !== sessionId)
        )
      }
    })
  },

  setAgentAutoMode: (sessionId, value) =>
    set((state) => {
      const agent = state.agents[sessionId]
      if (!agent) {
        return state
      }
      const record = { ...agent, autoMode: value }
      persistCoworker(record)
      return { agents: { ...state.agents, [sessionId]: record } }
    }),

  updateAgentMeta: (sessionId, fields) =>
    set((state) => {
      const agent = state.agents[sessionId]
      if (!agent) {
        return state
      }
      const record = { ...agent, ...fields }
      persistCoworker(record)
      return { agents: { ...state.agents, [sessionId]: record } }
    }),

  requestFocus: (sessionId) =>
    set({
      focusRequest: { sessionId, nonce: ++focusNonce },
      selectedId: sessionId
    }),

  setSelected: (sessionId) => set({ selectedId: sessionId }),

  toggleAutoMode: () => {
    const next = !get().autoMode
    localStorage.setItem(AUTO_KEY, next ? 'on' : 'off')
    set({ autoMode: next })
  },

  addProject: (path) => {
    if (!path || get().projects.includes(path)) {
      return
    }
    const projects = [...get().projects, path]
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
    set({ projects })
  },

  removeProject: (path) => {
    const projects = get().projects.filter((p) => p !== path)
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
    set({ projects })
  },

  addMemory: (agentId, text) => {
    const note: MemoryNote = { id: `m${++idCounter}`, agentId, text, ts: Date.now() }
    set({ memory: [note, ...get().memory].slice(0, 200) })
  },

  removeMemory: (noteId) => {
    set({ memory: get().memory.filter((note) => note.id !== noteId) })
  },

  clearActivity: (sessionId) => {
    set({ activity: { ...get().activity, [sessionId]: [] } })
  },

  pushConversation: (agentId, item) => {
    set({
      conversations: {
        ...get().conversations,
        [agentId]: [...(get().conversations[agentId] ?? []), { ...item, id: ++conversationCounter }]
      }
    })
  },

  clearConversation: (agentId) => {
    set({ conversations: { ...get().conversations, [agentId]: [] } })
  }
}))