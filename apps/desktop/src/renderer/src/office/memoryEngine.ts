import type { MemoryRecord, NewMemoryInput, TaskQuestion, TaskRecord } from '@shared/types'
import {
  useMemoryStore,
  tokenize,
  redactSecret,
  rankMemories,
  memoryBriefForTask
} from './memoryStore'
import { useGoalStore } from './goalStore'

/**
 * Controlled creation of memories.
 *
 * Memories are never written directly from raw streams. Everything funnels
 * through proposeMemory/captureTaskMemory which redact secrets, run conflict
 * detection and set an approval state the user can review.
 */

function findConflict(input: NewMemoryInput, memories: MemoryRecord[]): MemoryRecord | undefined {
  const incoming = tokenize(`${input.title} ${input.content}`)
  if (incoming.length === 0) {
    return undefined
  }
  const candidates = memories.filter(
    (memory) =>
      !memory.archived &&
      memory.approval !== 'rejected' &&
      memory.type === input.type &&
      (!memory.projectPath || memory.projectPath === input.projectPath)
  )
  let best: MemoryRecord | undefined
  let bestOverlap = 0
  for (const memory of candidates) {
    const existing = tokenize(`${memory.title} ${memory.content}`)
    let overlap = 0
    for (const word of incoming) {
      if (existing.includes(word)) {
        overlap += 1
      }
    }
    const ratio = overlap / Math.max(1, Math.min(incoming.length, existing.length))
    if (ratio > 0.45 && overlap > bestOverlap) {
      best = memory
      bestOverlap = overlap
    }
  }
  return best
}

/** Create a memory through the controlled pipeline. */
export async function proposeMemory(input: NewMemoryInput): Promise<MemoryRecord | null> {
  const content = redactSecret(input.content)
  const conflict = findConflict(input, Object.values(useMemoryStore.getState().memories))
  const created = await useMemoryStore.getState().createMemory({
    ...input,
    content,
    conflictOf: conflict?.id
  })
  if (created && conflict) {
    useMemoryStore.setState({ conflictNotice: { id: created.id, ts: Date.now() } })
  }
  return created
}

function makeTaskMemory(task: TaskRecord): NewMemoryInput | null {
  const report = task.report
  if (!report) {
    return null
  }
  const lines: string[] = []
  if (report.summary) {
    lines.push(report.summary)
  }
  const parts: string[] = []
  if (report.files.length > 0) {
    parts.push(`Files: ${report.files.join(', ')}`)
  }
  if (report.commands.length > 0) {
    parts.push(`Commands: ${report.commands.join('; ')}`)
  }
  if (report.tests) {
    parts.push(`Tests: ${report.tests}`)
  }
  if (report.concerns) {
    parts.push(`Concerns: ${report.concerns}`)
  }
  if (report.next.length > 0) {
    parts.push(`Follow-up: ${report.next.join('; ')}`)
  }
  if (parts.length > 0) {
    lines.push('', ...parts)
  }
  const content = lines.join('\n').trim()
  if (!content) {
    return null
  }
  const keywords = tokenize(task.title)
  return {
    title: `Task: ${task.title}`,
    content,
    type: 'task',
    projectPath: task.projectPath,
    relatedTaskId: task.id,
    source: { kind: 'task-report', taskId: task.id },
    createdBy: 'system',
    confidence: 'medium',
    tags: keywords.slice(0, 4),
    visibility: 'team',
    approval: 'auto',
    relatedAgentId: task.assignedAgentId
  }
}

/** Capture a concise lesson from a completed task, updating any existing one. */
export async function captureTaskMemory(task: TaskRecord): Promise<void> {
  if (!useMemoryStore.getState().autoCreate) {
    return
  }
  const input = makeTaskMemory(task)
  if (!input) {
    return
  }
  const existing = Object.values(useMemoryStore.getState().memories).find(
    (memory) => memory.relatedTaskId === task.id
  )
  if (existing) {
    useMemoryStore
      .getState()
      .updateMemory(existing.id, { title: input.title, content: input.content }, 'updated from task report')
    return
  }
  await proposeMemory(input)
}

/** Propose a decision memory when the user answers an Ask Me question. */
export function rememberAnswer(question: TaskQuestion, answer: string, task: TaskRecord): void {
  const trimmed = answer.trim()
  if (trimmed.length < 12) {
    return
  }
  if (!useMemoryStore.getState().autoCreate) {
    return
  }
  void proposeMemory({
    title: `Decision: ${question.need.slice(0, 80)}`,
    content: `The user decided: ${trimmed}${
      question.choices && question.choices.length > 0
        ? `\n\nOptions were: ${question.choices.join(' | ')}`
        : ''
    }`,
    type: 'decision',
    projectPath: task.projectPath,
    relatedTaskId: task.id,
    source: { kind: 'ask-me', taskId: task.id },
    createdBy: 'system',
    confidence: 'high',
    tags: [...tokenize(question.need), 'decision'].slice(0, 4),
    visibility: 'team',
    approval: 'pending'
  })
}

/** Archive temporary memories bound to a finished goal. */
export function expireGoalMemory(goalId: string): void {
  for (const memory of Object.values(useMemoryStore.getState().memories)) {
    if (
      memory.type === 'temporary' &&
      memory.expiration?.rule === 'goal' &&
      memory.expiration.goalId === goalId &&
      !memory.archived
    ) {
      useMemoryStore.getState().updateMemory(memory.id, { archived: true }, 'goal finished')
    }
  }
}

/** Relevant memories for a task, with usage recorded. */
export function memoriesForTask(
  task: Pick<TaskRecord, 'title' | 'instructions' | 'projectPath'>,
  agent?: { id: string; role?: string; projectPath?: string }
): MemoryRecord[] {
  const state = useMemoryStore.getState()
  const goals = Object.values(useGoalStore.getState().goals).map((goal) => ({
    id: goal.id,
    status: goal.status
  }))
  const selected = rankMemories(
    Object.values(state.memories),
    task,
    agent,
    goals
  )
  for (const memory of selected) {
    state.addUsage(memory.id, { taskId: (task as TaskRecord).id ?? '', agentId: agent?.id })
  }
  return selected
}

/** Markdown memory block for an assignment, with usage recorded. */
export function memoryBlockForTask(
  task: Pick<TaskRecord, 'title' | 'instructions' | 'projectPath' | 'id'>,
  agent?: { id: string; role?: string; projectPath?: string }
): string {
  const goals = Object.values(useGoalStore.getState().goals).map((goal) => ({
    id: goal.id,
    status: goal.status
  }))
  return memoryBriefForTask(memoriesForTask(task, agent), goals)
}