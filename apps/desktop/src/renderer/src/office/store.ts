import { create } from 'zustand'
import type { SessionInfo, SessionStatus } from '@shared/types'

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
}

export interface AgentTask {
  id: string
  text: string
  done: boolean
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
}

interface OfficeState {
  agents: Record<string, OfficeAgentRecord>
  selectedId: string | null
  managerId: string | null
  focusRequest: { sessionId: string; nonce: number } | null
  autoMode: boolean
  projects: string[]
  activity: Record<string, string[]>
  tasks: Record<string, AgentTask[]>
  memory: MemoryNote[]
  conversations: Record<string, ConversationItem[]>
  upsertAgent: (session: SessionInfo) => void
  hireAgent: (profile: HireProfile) => string
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
  addTask: (sessionId: string, text: string) => void
  toggleTask: (sessionId: string, taskId: string) => void
  removeTask: (sessionId: string, taskId: string) => void
  addMemory: (agentId: string, text: string) => void
  removeMemory: (noteId: string) => void
  clearActivity: (sessionId: string) => void
}

let focusNonce = 0
let idCounter = 0
let taskIdCounter = 0
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
  tasks: {},
  memory: [],
  conversations: {},

  upsertAgent: (session) =>
    set((state) => {
      const isFirst = Object.keys(state.agents).length === 0
      const existing = state.agents[session.id]
      return {
        agents: {
          ...state.agents,
          [session.id]: {
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
            autoMode: session.autoMode
          }
        },
        managerId: isFirst ? session.id : state.managerId,
        selectedId: state.selectedId ?? session.id
      }
    }),

  hireAgent: (profile) => {
    const id = `draft-${++draftCounter}`
    set((state) => {
      const isFirst = Object.keys(state.agents).length === 0
      return {
        agents: {
          ...state.agents,
          [id]: {
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
            autoMode: profile.autoMode
          }
        },
        managerId: isFirst ? id : state.managerId,
        selectedId: state.selectedId ?? id
      }
    })
    return id
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
    set((state) => {
      const agents = { ...state.agents }
      delete agents[sessionId]
      return {
        agents,
        selectedId: state.selectedId === sessionId ? null : state.selectedId,
        activity: Object.fromEntries(
          Object.entries(state.activity).filter(([id]) => id !== sessionId)
        ),
        tasks: Object.fromEntries(Object.entries(state.tasks).filter(([id]) => id !== sessionId)),
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
      return { agents: { ...state.agents, [sessionId]: { ...agent, autoMode: value } } }
    }),

  updateAgentMeta: (sessionId, fields) =>
    set((state) => {
      const agent = state.agents[sessionId]
      if (!agent) {
        return state
      }
      return { agents: { ...state.agents, [sessionId]: { ...agent, ...fields } } }
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

  addTask: (sessionId, text) => {
    const task = { id: `t${++taskIdCounter}`, text, done: false }
    set({
      tasks: {
        ...get().tasks,
        [sessionId]: [...(get().tasks[sessionId] ?? []), task]
      }
    })
  },

  toggleTask: (sessionId, taskId) => {
    set({
      tasks: {
        ...get().tasks,
        [sessionId]: (get().tasks[sessionId] ?? []).map((task) =>
          task.id === taskId ? { ...task, done: !task.done } : task
        )
      }
    })
  },

  removeTask: (sessionId, taskId) => {
    set({
      tasks: {
        ...get().tasks,
        [sessionId]: (get().tasks[sessionId] ?? []).filter((task) => task.id !== taskId)
      }
    })
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