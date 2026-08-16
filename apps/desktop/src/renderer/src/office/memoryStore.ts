import { create } from 'zustand'
import type {
  MemoryApproval,
  MemoryRecord,
  MemoryRevision,
  MemorySource,
  NewMemoryInput,
  TaskRecord
} from '@shared/types'

/**
 * Persistent shared memory.
 *
 * Content is stored as Markdown inside SQLite records. This store keeps the
 * in-memory copy, handles revisions (history), usage tracking, search and
 * ranking, merging, and exposes the live events used by the office visuals.
 */

export const SECRET_PATTERNS = [
  /\b(?:sk|pk|rk|ghp|gho|ghu|glpat|AKIA)[A-Za-z0-9_-]{10,}\b/,
  /\b(?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key|private[_-]?key|bearer)\s*[:=]\s*\S+/i,
  /\b(?:[345]\d{3}[-\s]?){4}\d{3,4}\b/,
  /\bBEGIN (?:RSA|OPENSSH|EC|PGP) PRIVATE KEY\b/
]

export function containsSecret(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text))
}

export function redactSecret(text: string): string {
  let out = text
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match) => {
      if (/private key/i.test(match)) {
        return match
      }
      return '[REDACTED]'
    })
  }
  return out
}

export function sourceLabel(source: MemorySource): string {
  switch (source.kind) {
    case 'user':
      return 'user message'
    case 'task-report':
      return `task report${source.taskId ? ` (#${source.taskId.slice(0, 6)})` : ''}`
    case 'ask-me':
      return 'ask-me answer'
    case 'file-inspection':
      return `file inspection${source.path ? ` (${source.path})` : ''}`
    case 'terminal':
      return 'terminal event'
    case 'memory':
      return 'derived'
    case 'manual':
      return 'manual'
    default:
      return 'unknown'
  }
}

export function isExpired(memory: MemoryRecord, goals: { id: string; status: string }[] = []): boolean {
  const expiration = memory.expiration
  if (expiration?.rule === 'date' && expiration.date) {
    return Date.now() > expiration.date
  }
  if (expiration?.rule === 'goal' && expiration.goalId) {
    const goal = goals.find((g) => g.id === expiration.goalId)
    if (goal && (goal.status === 'completed' || goal.status === 'cancelled' || goal.status === 'failed')) {
      return true
    }
  }
  return false
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2)
}

export interface MemoryFilters {
  search?: string
  types?: Set<string>
  projectPath?: string
  visibility?: string
  confidence?: string
  showArchived?: boolean
  pendingOnly?: boolean
  conflictsOnly?: boolean
}

export function filterMemories(memories: MemoryRecord[], filters: MemoryFilters): MemoryRecord[] {
  const search = (filters.search ?? '').trim().toLowerCase()
  return memories.filter((memory) => {
    if (!filters.showArchived && memory.archived) {
      return false
    }
    if (filters.pendingOnly && memory.approval !== 'pending') {
      return false
    }
    if (filters.conflictsOnly && !memory.conflictOf) {
      return false
    }
    if (filters.types && filters.types.size > 0 && !filters.types.has(memory.type)) {
      return false
    }
    if (filters.projectPath && memory.projectPath !== filters.projectPath) {
      return false
    }
    if (filters.visibility && memory.visibility !== filters.visibility) {
      return false
    }
    if (filters.confidence && memory.confidence !== filters.confidence) {
      return false
    }
    if (search) {
      const haystack = `${memory.title} ${memory.content} ${memory.tags.join(' ')}`.toLowerCase()
      const terms = search.split(/\s+/)
      if (!terms.every((term) => haystack.includes(term))) {
        return false
      }
    }
    return true
  })
}

/** Rank memories for a task about to start. Excludes non-approved/expired. */
export function rankMemories(
  memories: MemoryRecord[],
  task: Pick<TaskRecord, 'title' | 'instructions' | 'projectPath'>,
  agent?: { id: string; role?: string; projectPath?: string },
  goals: { id: string; status: string }[] = []
): MemoryRecord[] {
  const now = Date.now()
  const keywords = tokenize(`${task.title} ${task.instructions}`)
  const scored = memories
    .filter(
      (memory) =>
        !memory.archived &&
        !memory.unreliable &&
        memory.approval !== 'pending' &&
        memory.approval !== 'rejected' &&
        !isExpired(memory, goals)
    )
    .map((memory) => {
      let score = 0
      if (memory.projectPath && task.projectPath && memory.projectPath === task.projectPath) {
        score += 4
      } else if (!memory.projectPath) {
        score += 1
      }
      if (memory.pinned) {
        score += 3
      }
      if (memory.type === 'decision' && memory.approval === 'approved') {
        score += 3
      }
      if (memory.type === 'user' && memory.approval === 'approved') {
        score += 2
      }
      if (memory.confidence === 'high') {
        score += 1
      }
      if (memory.lastUsedAt && now - memory.lastUsedAt < 7 * 24 * 60 * 60 * 1000) {
        score += 1
      }
      if (agent && memory.relatedAgentId && memory.relatedAgentId === agent.id) {
        score += 1
      }
      if (agent && memory.relatedAgentId === undefined && memory.type === 'coworker') {
        score += 1
      }
      const overlap = keywords.filter((word) =>
        `${memory.title} ${memory.content}`.toLowerCase().includes(word)
      ).length
      score += Math.min(3, overlap)
      return { memory, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.map((entry) => entry.memory).slice(0, 6)
}

function ageLabel(ts: number): string {
  const minutes = Math.floor((Date.now() - ts) / 60000)
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Build the markdown memory block added to an assignment brief. */
export function memoryBriefForTask(
  memories: MemoryRecord[],
  goals: { id: string; status: string }[] = []
): string {
  const selected = memories.filter((m) => !isExpired(m, goals))
  if (selected.length === 0) {
    return ''
  }
  const lines = ['', '## Relevant project memory (from the shared archive)', '']
  for (const memory of selected) {
    lines.push(`### ${memory.title}`)
    lines.push(`_${memory.type} · ${sourceLabel(memory.source)} · ${ageLabel(memory.createdAt)}_`)
    lines.push(memory.content.trim())
    lines.push('')
  }
  lines.push('Use this context to guide your work. It is background, not a task requirement.')
  return lines.join('\n')
}

interface MemoryState {
  memories: Record<string, MemoryRecord>
  hydrated: boolean
  /** When false, automatic capture (task lessons, decisions) is disabled. */
  autoCreate: boolean
  /** Live events for office visuals. */
  lastCreated: { id: string; ts: number } | null
  conflictNotice: { id: string; ts: number } | null
  hydrate: () => Promise<void>
  createMemory: (input: NewMemoryInput) => Promise<MemoryRecord | null>
  removeMemory: (id: string) => void
  updateMemory: (id: string, changes: Partial<MemoryRecord>, reason: string) => void
  approveMemory: (id: string) => void
  rejectMemory: (id: string) => void
  addUsage: (id: string, usage: { taskId: string; agentId?: string }) => void
  mergeInto: (targetId: string, otherId: string) => void
  clearAll: () => Promise<void>
  exportAll: () => Promise<string | null>
  toggleAutoCreate: () => void
}

let revisionCounter = 0

function withRevision(
  memory: MemoryRecord,
  changes: Partial<MemoryRecord>,
  reason: string
): MemoryRecord {
  const titleChanged = changes.title !== undefined && changes.title !== memory.title
  const contentChanged = changes.content !== undefined && changes.content !== memory.content
  if (!titleChanged && !contentChanged) {
    return { ...memory, ...changes, updatedAt: Date.now() }
  }
  const revision: MemoryRevision = {
    id: ++revisionCounter,
    title: memory.title,
    content: memory.content,
    ts: Date.now(),
    reason
  }
  return {
    ...memory,
    ...changes,
    revisions: [...memory.revisions, revision],
    updatedAt: Date.now()
  }
}

export const useMemoryStore = create<MemoryState>()((set, get) => {
  const commit = (id: string, next: MemoryRecord): void => {
    window.workspace.memorySave(next).catch(() => {
      // persistence is best-effort
    })
    set({ memories: { ...get().memories, [id]: next } })
  }

  return {
    memories: {},
    hydrated: false,
    autoCreate: localStorage.getItem('pixelforge-memory-auto') !== 'off',
    lastCreated: null,
    conflictNotice: null,

    hydrate: async () => {
      try {
        const memories = await window.workspace.memoryList()
        const map: Record<string, MemoryRecord> = {}
        for (const memory of memories) {
          map[memory.id] = memory
        }
        set({ memories: map, hydrated: true })
      } catch {
        set({ hydrated: true })
      }
    },

    createMemory: async (input) => {
      let created: MemoryRecord | null = null
      try {
        created = await window.workspace.memoryCreate(input)
      } catch {
        return null
      }
      set({
        memories: { ...get().memories, [created.id]: created },
        lastCreated: { id: created.id, ts: Date.now() }
      })
      return created
    },

    removeMemory: (id) => {
      window.workspace.memoryRemove(id).catch(() => {
        // best-effort
      })
      const memories = { ...get().memories }
      delete memories[id]
      set({ memories })
    },

    updateMemory: (id, changes, reason) => {
      const memory = get().memories[id]
      if (!memory) {
        return
      }
      commit(id, withRevision(memory, changes, reason))
    },

    approveMemory: (id) => {
      const memory = get().memories[id]
      if (!memory) {
        return
      }
      let next = withRevision(
        memory,
        { approval: 'approved' as MemoryApproval },
        'approved by user'
      )
      if (memory.conflictOf) {
        const existing = get().memories[memory.conflictOf]
        if (existing) {
          const resolved = withRevision(
            existing,
            { archived: true, resolvedWith: memory.id },
            'superseded by an approved conflicting memory'
          )
          commit(memory.conflictOf, resolved)
        }
        next = { ...next, conflictOf: undefined }
      }
      commit(id, next)
    },

    rejectMemory: (id) => {
      const memory = get().memories[id]
      if (!memory) {
        return
      }
      commit(
        id,
        withRevision(memory, { approval: 'rejected' as MemoryApproval }, 'rejected by user')
      )
    },

    addUsage: (id, usage) => {
      const memory = get().memories[id]
      if (!memory) {
        return
      }
      commit(id, {
        ...memory,
        lastUsedAt: Date.now(),
        usage: [...memory.usage, { ...usage, ts: Date.now() }].slice(-100)
      })
    },

    mergeInto: (targetId, otherId) => {
      if (targetId === otherId) {
        return
      }
      const target = get().memories[targetId]
      const other = get().memories[otherId]
      if (!target || !other) {
        return
      }
      const tags = [...new Set([...target.tags, ...other.tags])]
      const mergedContent = `${target.content}\n\n---\n\nMerged from duplicate "${other.title}":\n\n${other.content}`.trim()
      const merged = withRevision(
        target,
        { tags, content: mergedContent, usage: [...target.usage, ...other.usage] },
        `merged duplicate "${other.title}"`
      )
      const archived = withRevision(other, { archived: true }, `merged into "${target.title}"`)
      commit(targetId, merged)
      commit(otherId, archived)
    },

    clearAll: async () => {
      try {
        await window.workspace.memoryClear()
      } catch {
        // best-effort
      }
      set({ memories: {} })
    },

    exportAll: async () => {
      try {
        return await window.workspace.memoryExport()
      } catch {
        return null
      }
    },

    toggleAutoCreate: () => {
      const next = !get().autoCreate
      localStorage.setItem('pixelforge-memory-auto', next ? 'on' : 'off')
      set({ autoCreate: next })
    }
  }
})
