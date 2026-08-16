import { create } from 'zustand'
import type {
  MemoryApproval,
  MemoryRecord,
  MemoryRevision,
  NewMemoryInput
} from '@shared/types'

/**
 * Persistent shared memory.
 *
 * Content is stored as Markdown inside SQLite records. This store keeps the
 * in-memory copy, handles revisions (history), usage tracking, merging, and
 * exposes the live events used by the office visuals. Pure business rules
 * (ranking, secrets, conflict detection) live in @shared/rules/memory.
 */

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
