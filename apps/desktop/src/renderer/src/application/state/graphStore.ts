import { create } from 'zustand'
import type { GraphNode, GraphRelationship, GraphSnapshot } from '@shared/types'

/**
 * Graph state.
 *
 * The projected snapshot is rebuilt from all other stores (tasks, goals,
 * memories, messages, coworkers) plus persisted inferred relationships that
 * survive restarts. Users can confirm or delete inferred relationships here.
 */

interface GraphState {
  snapshot: GraphSnapshot
  persistedNodes: GraphNode[]
  persistedRelationships: GraphRelationship[]
  hydrated: boolean
  hydrate: () => Promise<void>
  setSnapshot: (snapshot: GraphSnapshot) => void
  addPersistedNode: (node: GraphNode) => Promise<void>
  removePersistedNode: (id: string) => Promise<void>
  addPersistedRelationship: (rel: GraphRelationship) => Promise<void>
  updatePersistedRelationship: (id: string, changes: Partial<GraphRelationship>) => Promise<void>
  removePersistedRelationship: (id: string) => Promise<void>
  markRelationshipConfirmed: (id: string) => Promise<void>
}

export const useGraphStore = create<GraphState>()((set, get) => ({
  snapshot: { nodes: [], relationships: [] },
  persistedNodes: [],
  persistedRelationships: [],
  hydrated: false,

  hydrate: async () => {
    try {
      const [nodes, relationships] = await Promise.all([
        window.workspace.graphNodeList(),
        window.workspace.graphRelationshipList()
      ])
      set({ persistedNodes: nodes, persistedRelationships: relationships, hydrated: true })
    } catch {
      set({ hydrated: true })
    }
  },

  setSnapshot: (snapshot) => set({ snapshot }),

  addPersistedNode: async (node) => {
    let saved: GraphNode | null = null
    try {
      saved = await window.workspace.graphNodeSave(node)
    } catch {
      return
    }
    const next = get().persistedNodes.filter((n) => n.id !== node.id)
    set({ persistedNodes: [...next, saved ?? node] })
  },

  removePersistedNode: async (id) => {
    try {
      await window.workspace.graphNodeRemove(id)
    } catch {
      // best-effort
    }
    set({ persistedNodes: get().persistedNodes.filter((n) => n.id !== id) })
  },

  addPersistedRelationship: async (rel) => {
    let saved: GraphRelationship | null = null
    try {
      saved = await window.workspace.graphRelationshipSave(rel)
    } catch {
      return
    }
    const next = get().persistedRelationships.filter((r) => r.id !== rel.id)
    set({ persistedRelationships: [...next, saved ?? rel] })
  },

  updatePersistedRelationship: async (id, changes) => {
    const rel = get().persistedRelationships.find((r) => r.id === id)
    if (!rel) {
      return
    }
    const next: GraphRelationship = {
      ...rel,
      ...changes,
      updatedAt: Date.now()
    }
    try {
      await window.workspace.graphRelationshipSave(next)
    } catch {
      return
    }
    set({
      persistedRelationships: get().persistedRelationships.map((r) => (r.id === id ? next : r))
    })
  },

  removePersistedRelationship: async (id) => {
    try {
      await window.workspace.graphRelationshipRemove(id)
    } catch {
      // best-effort
    }
    set({ persistedRelationships: get().persistedRelationships.filter((r) => r.id !== id) })
  },

  markRelationshipConfirmed: async (id) => {
    await get().updatePersistedRelationship(id, { status: 'user-confirmed' })
  }
}))