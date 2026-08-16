import type { TaskRecord } from '../types'

/**
 * Pure rules for tasks: dependency graphs and coworker load. Framework-free so
 * they can be shared by the renderer stores, the goal engine and the UI.
 */

export function recomputeDependents(tasks: Record<string, TaskRecord>): Record<string, TaskRecord> {
  const dependents = new Map<string, string[]>()
  for (const task of Object.values(tasks)) {
    for (const dep of task.dependencies) {
      const list = dependents.get(dep) ?? []
      if (!list.includes(task.id)) {
        list.push(task.id)
      }
      dependents.set(dep, list)
    }
  }
  const next: Record<string, TaskRecord> = {}
  for (const [id, task] of Object.entries(tasks)) {
    next[id] = { ...task, dependents: dependents.get(id) ?? [] }
  }
  return next
}

export function dependenciesMet(task: TaskRecord, tasks: Record<string, TaskRecord>): boolean {
  return task.dependencies.every((id) => tasks[id]?.status === 'done')
}

export interface AgentTaskLoad {
  active: TaskRecord[]
  needsInput: TaskRecord[]
  queue: TaskRecord[]
  history: TaskRecord[]
}

export function taskLoadFor(
  tasks: Record<string, TaskRecord>,
  agentId: string
): AgentTaskLoad {
  const list = Object.values(tasks).filter((t) => t.assignedAgentId === agentId)
  return {
    active: list.filter((t) => t.status === 'ongoing'),
    needsInput: list.filter((t) => t.status === 'needs-input'),
    queue: list.filter((t) => t.status === 'todo'),
    history: list.filter((t) => t.status === 'done' || t.status === 'failed')
  }
}

/** True when the coworker already has an active task (and it is not this one). */
export function agentIsBusy(
  tasks: Record<string, TaskRecord>,
  agentId: string,
  excludeTaskId?: string
): boolean {
  return Object.values(tasks).some(
    (t) =>
      t.id !== excludeTaskId &&
      t.assignedAgentId === agentId &&
      (t.status === 'ongoing' || t.status === 'needs-input')
  )
}