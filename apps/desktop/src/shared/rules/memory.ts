import type { MemoryRecord, MemorySource, NewMemoryInput, TaskRecord } from '../types'

/**
 * Pure business rules for the shared memory system.
 *
 * Everything here is deterministic and framework-free so it can run in any
 * process and be unit tested without stores or IPC.
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

/** Find an existing memory the incoming one would conflict with. */
export function findConflict(input: NewMemoryInput, memories: MemoryRecord[]): MemoryRecord | undefined {
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

/** Build a concise task memory from a completed task report. */
export function makeTaskMemory(task: TaskRecord): NewMemoryInput | null {
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