import { buildGraph } from '@shared/rules/graph'
import type { GraphSnapshot } from '@shared/types'
import { useTaskStore } from '../state/taskStore'
import { useGoalStore } from '../state/goalStore'
import { useMemoryStore } from '../state/memoryStore'
import { useMessageStore } from '../state/messageStore'
import { useOfficeStore } from '../state/officeStore'
import { useGraphStore } from '../state/graphStore'

/**
 * Graph service.
 *
 * Rebuilds the projected graph from every store and merges persisted inferred
 * relationships. Rebuilds are debounced so high-frequency terminal output does
 * not churn the graph, and the panel stays responsive on large projects.
 */

let timer: ReturnType<typeof setTimeout> | null = null

export function projectGraph(): GraphSnapshot {
  const tasks = Object.values(useTaskStore.getState().tasks)
  const goals = Object.values(useGoalStore.getState().goals)
  const memories = Object.values(useMemoryStore.getState().memories)
  const messages = Object.values(useMessageStore.getState().messages)
  const conversations = Object.values(useMessageStore.getState().conversations)
  const office = useOfficeStore.getState()
  const agents = Object.values(office.agents).map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    status: agent.status,
    projectPath: agent.projectPath
  }))
  const graph = useGraphStore.getState()
  const built = buildGraph({
    goals,
    tasks,
    memories,
    messages,
    conversations,
    agents,
    managerId: office.managerId,
    persistedNodes: graph.persistedNodes,
    persistedRelationships: graph.persistedRelationships
  })
  return { nodes: built.nodes, relationships: built.relationships }
}

/** Debounced rebuild (max one per 800ms quiet window). */
export function refreshGraph(): void {
  if (timer) {
    return
  }
  timer = setTimeout(() => {
    timer = null
    const snapshot = projectGraph()
    useGraphStore.getState().setSnapshot(snapshot)
  }, 800)
}

export function refreshGraphNow(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  useGraphStore.getState().setSnapshot(projectGraph())
}

/** Load persisted graph records and start listening to the source stores. */
export async function startGraphEngine(): Promise<void> {
  await useGraphStore.getState().hydrate()
  refreshGraphNow()

  const stores = [
    useTaskStore,
    useGoalStore,
    useMemoryStore,
    useMessageStore,
    useOfficeStore
  ]
  for (const store of stores) {
    store.subscribe(() => refreshGraph())
  }
}