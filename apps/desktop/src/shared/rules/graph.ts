import type {
  ConversationRecord,
  GoalRecord,
  GraphNode,
  GraphNodeType,
  GraphRelationship,
  GraphRelationshipStatus,
  GraphRelationshipType,
  GraphSnapshot,
  MemoryConfidence,
  MemoryRecord,
  MessageRecord,
  TaskRecord
} from '../types'
import { messageKindLabel, messagePreview } from './message'

/**
 * Pure knowledge & work graph rules.
 *
 * The graph is a visual projection of existing structured records, not a
 * separate source of truth. `buildGraph` derives nodes and *confirmed*
 * relationships directly from goals, tasks, memories, messages and coworkers.
 * AI-proposed connections live in persisted `graph_relationships` rows and are
 * merged in with a lower authority (`inferred`) so they never silently become
 * facts. Everything here is pure and unit-testable.
 */

export const USER_NODE_ID = 'coworker:user'
export const NODE_TYPE_LABELS: Record<GraphNodeType, string> = {
  goal: 'Goal',
  task: 'Task',
  subtask: 'Subtask',
  coworker: 'Coworker',
  project: 'Project',
  file: 'File',
  memory: 'Memory',
  decision: 'Decision',
  question: 'Question',
  message: 'Message',
  test: 'Test',
  commit: 'Commit',
  external: 'External'
}

export const NODE_TYPE_SHAPES: Record<GraphNodeType, string> = {
  goal: 'star',
  task: 'roundrectangle',
  subtask: 'roundrectangle',
  coworker: 'ellipse',
  project: 'hexagon',
  file: 'cutrectangle',
  memory: 'round-diamond',
  decision: 'diamond',
  question: 'ellipse',
  message: 'roundrectangle',
  test: 'vee',
  commit: 'octagon',
  external: 'barrel'
}

export const NODE_TYPE_COLORS: Record<GraphNodeType, string> = {
  goal: '#ffcc33',
  task: '#3a9dff',
  subtask: '#6bb8ff',
  coworker: '#3ad95e',
  project: '#9aa6cf',
  file: '#c07bff',
  memory: '#c07bff',
  decision: '#ffcc33',
  question: '#6bb8ff',
  message: '#3a9dff',
  test: '#3ad95e',
  commit: '#9aa6cf',
  external: '#ff9f5e'
}

export const NODE_TYPE_GLYPHS: Record<GraphNodeType, string> = {
  goal: '◎',
  task: '▤',
  subtask: '▢',
  coworker: '◈',
  project: '▣',
  file: '❏',
  memory: '◍',
  decision: '◆',
  question: '?',
  message: '≡',
  test: '✓',
  commit: '⬢',
  external: '✱'
}

export const RELATIONSHIP_LABELS: Record<GraphRelationshipType, string> = {
  contains: 'contains',
  'depends-on': 'depends on',
  'assigned-to': 'assigned to',
  changed: 'changed',
  verifies: 'verifies',
  'came-from': 'came from',
  'approved-by': 'approved by',
  answered: 'answered',
  reviewed: 'reviewed',
  handoff: 'handed off to',
  imports: 'imports',
  uses: 'uses',
  produced: 'produced',
  contradicts: 'contradicts',
  'blocked-by': 'blocked by',
  references: 'references',
  sent: 'sent',
  received: 'received'
}

export type StatusCategory =
  | 'inactive'
  | 'planned'
  | 'ongoing'
  | 'waiting'
  | 'completed'
  | 'blocked'

export const STATUS_CATEGORY_COLORS: Record<StatusCategory, string> = {
  inactive: '#9aa6cf',
  planned: '#3a9dff',
  ongoing: '#ffcc33',
  waiting: '#c07bff',
  completed: '#3ad95e',
  blocked: '#ff4d5e'
}

export const STATUS_CATEGORY_LABELS: Record<StatusCategory, string> = {
  inactive: 'Inactive',
  planned: 'Planned',
  ongoing: 'Ongoing',
  waiting: 'Waiting',
  completed: 'Completed',
  blocked: 'Blocked'
}

/** Derive the visual status category for any node. */
export function nodeStatusCategory(node: GraphNode): StatusCategory {
  if (node.archived) {
    return 'inactive'
  }
  const status = node.status ?? ''
  switch (node.type) {
    case 'task':
      if (status === 'todo') return 'planned'
      if (status === 'ongoing') return 'ongoing'
      if (status === 'needs-input') return 'waiting'
      if (status === 'done') return 'completed'
      if (status === 'failed') return 'blocked'
      return 'planned'
    case 'subtask':
      return status === 'done' ? 'completed' : 'planned'
    case 'goal':
      if (status === 'planning') return 'planned'
      if (status === 'awaiting-approval') return 'waiting'
      if (status === 'running' || status === 'partially-completed') return 'ongoing'
      if (status === 'needs-input') return 'waiting'
      if (status === 'completed') return 'completed'
      if (status === 'failed') return 'blocked'
      if (status === 'cancelled') return 'inactive'
      return 'planned'
    case 'coworker':
      if (status === 'running' || status === 'starting') return 'ongoing'
      if (status === 'error') return 'blocked'
      return 'inactive'
    case 'question':
      return status === 'answered' ? 'completed' : 'waiting'
    case 'message':
      if (status === 'failed') return 'blocked'
      if (status === 'draft') return 'planned'
      if (
        status === 'acknowledged' ||
        status === 'replied' ||
        status === 'processed'
      ) {
        return 'completed'
      }
      return 'ongoing'
    case 'memory':
    case 'decision':
      if (status === 'rejected' || status === 'conflicting' || status === 'unreliable') {
        return 'blocked'
      }
      if (status === 'pending') return 'waiting'
      if (status === 'approved' || status === 'auto') return 'completed'
      return 'planned'
    default:
      return 'inactive'
  }
}

export function nodeStatusColor(node: GraphNode): string {
  return STATUS_CATEGORY_COLORS[nodeStatusCategory(node)]
}

function isTestFile(path: string): boolean {
  return /(\.test\.|\.spec\.|\.tests?$|__tests__|[-_]test$|[-_]spec$)/i.test(path)
}

function basename(path: string): string {
  const clean = path.replace(/\/+$/, '')
  return clean.split('/').pop() ?? clean
}

let relCounter = 0
let commitIndex = 0

function rel(
  source: string,
  target: string,
  type: GraphRelationshipType,
  status: GraphRelationshipStatus,
  evidence: string,
  evidenceId?: string,
  extra?: Partial<GraphRelationship>
): GraphRelationship {
  const id = `r:${type}:${source}->${target}:${++relCounter}`
  const now = Date.now()
  return {
    id,
    source,
    target,
    type,
    status,
    evidence,
    evidenceId,
    createdAt: now,
    updatedAt: now,
    ...extra
  }
}

export interface GraphSourceData {
  goals: GoalRecord[]
  tasks: TaskRecord[]
  memories: MemoryRecord[]
  messages: MessageRecord[]
  conversations: ConversationRecord[]
  agents: Array<{ id: string; name: string; role: string; status: string; projectPath?: string }>
  managerId: string | null
  persistedNodes: GraphNode[]
  persistedRelationships: GraphRelationship[]
}

export interface BuildGraphResult extends GraphSnapshot {
  /** Total records scanned (for stats). */
  stats: { goals: number; tasks: number; memories: number; messages: number }
}

/** Build the projected graph from every structured record. */
export function buildGraph(source: GraphSourceData): BuildGraphResult {
  relCounter = 0
  commitIndex = 0
  const nodesById = new Map<string, GraphNode>()
  const relationships: GraphRelationship[] = []
  const goalTaskEdges: Array<{ goalId: string; taskId: string }> = []

  const conversationsById = new Map(source.conversations.map((c) => [c.id, c]))

  const addNode = (node: GraphNode): void => {
    nodesById.set(node.id, node)
  }

  const coworkerNode = (id: string, name: string, role?: string, status?: string, projectPath?: string): string => {
    const key = `coworker:${id}`
    if (!nodesById.has(key)) {
      addNode({
        id: key,
        type: 'coworker',
        label: name,
        projectPath,
        status,
        meta: { id, role: role ?? '' }
      })
    }
    return key
  }

  const projectNode = (projectPath?: string): string | null => {
    if (!projectPath) {
      return null
    }
    const key = `project:${projectPath}`
    if (!nodesById.has(key)) {
      addNode({
        id: key,
        type: 'project',
        label: basename(projectPath),
        projectPath,
        meta: { path: projectPath }
      })
    }
    return key
  }

  const fileNode = (path: string): string => {
    const key = `file:${path}`
    if (!nodesById.has(key)) {
      addNode({
        id: key,
        type: 'file',
        label: basename(path),
        meta: { path }
      })
    }
    return key
  }

  // ---- Coworkers -----------------------------------------------------------

  const userNodeId = coworkerNode('user', 'You', 'Manager / user', 'idle')
  for (const agent of source.agents) {
    coworkerNode(agent.id, agent.name, agent.role, agent.status, agent.projectPath)
    const project = projectNode(agent.projectPath)
    if (project) {
      relationships.push(rel(coworkerNode(agent.id, agent.name), project, 'references', 'confirmed', 'Coworker workspace folder.'))
    }
  }

  // ---- Goals ---------------------------------------------------------------

  for (const goal of source.goals) {
    const goalNode: GraphNode = {
      id: `goal:${goal.id}`,
      type: 'goal',
      label: goal.title,
      projectPath: goal.projectPath,
      status: goal.status,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
      meta: { request: goal.request, id: goal.id }
    }
    addNode(goalNode)
    const project = projectNode(goal.projectPath)
    if (project) {
      relationships.push(rel(project, goalNode.id, 'contains', 'confirmed', 'The goal belongs to this project.', goal.id))
    }

    goalTaskEdges.push(
      ...goal.taskIds.map((taskId) => ({ goalId: goalNode.id, taskId }))
    )

    for (const question of goal.questions) {
      const qid = `question:goal:${goal.id}:${question.id}`
      addNode({
        id: qid,
        type: 'question',
        label: question.ask,
        status: question.answeredAt ? 'answered' : 'open',
        createdAt: question.createdAt,
        meta: { why: question.why, recommendation: question.recommendation, goalId: goal.id }
      })
      relationships.push(rel(goalNode.id, qid, 'references', 'confirmed', 'The goal raised this question.', String(question.id)))
      if (!question.answeredAt) {
        relationships.push(rel(goalNode.id, qid, 'blocked-by', 'confirmed', 'This unanswered question is blocking the goal.', String(question.id)))
      }
    }
  }

  // ---- Tasks ---------------------------------------------------------------

  const taskNodeById = new Map<string, string>()
  for (const task of source.tasks) {
    const taskNode: GraphNode = {
      id: `task:${task.id}`,
      type: 'task',
      label: task.title,
      projectPath: task.projectPath,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      meta: {
        id: task.id,
        description: task.instructions,
        requirements: task.requirements,
        priority: task.priority,
        files: task.filesChanged
      }
    }
    addNode(taskNode)
    taskNodeById.set(task.id, taskNode.id)
    const project = projectNode(task.projectPath)
    if (project) {
      relationships.push(rel(project, taskNode.id, 'contains', 'confirmed', 'The task belongs to this project.', task.id))
    }

    for (const subtask of task.subtasks) {
      const sid = `subtask:${task.id}:${subtask.id}`
      addNode({
        id: sid,
        type: 'subtask',
        label: subtask.text,
        status: subtask.done ? 'done' : 'todo'
      })
      relationships.push(rel(taskNode.id, sid, 'contains', 'confirmed', 'The task contains this subtask.', task.id))
    }

    for (const dep of task.dependencies) {
      if (!taskNodeById.has(dep)) {
        continue
      }
      relationships.push(
        rel(taskNode.id, taskNodeById.get(dep)!, 'depends-on', 'confirmed', 'Task declares this dependency before it can start.', dep)
      )
      const depTask = source.tasks.find((t) => t.id === dep)
      if (depTask && depTask.status !== 'done') {
        relationships.push(
          rel(taskNode.id, taskNodeById.get(dep)!, 'blocked-by', 'confirmed', 'This dependency is not finished yet.', dep)
        )
      }
    }

    if (task.assignedAgentId) {
      const coworker = coworkerNode(task.assignedAgentId, task.assignedAgentId)
      relationships.push(
        rel(coworker, taskNode.id, 'assigned-to', 'confirmed', 'This coworker is assigned to the task.', task.id)
      )
    }

    for (const path of task.filesChanged) {
      const file = fileNode(path)
      relationships.push(
        rel(taskNode.id, file, 'changed', 'confirmed', 'The task reported this file in its verified changes.', task.id)
      )
    }
    for (const path of task.report?.files ?? []) {
      const file = fileNode(path)
      if (!relationships.some((r) => r.source === taskNode.id && r.type === 'changed' && r.target === file)) {
        relationships.push(
          rel(taskNode.id, file, 'changed', 'agent-reported', 'The task completion report lists this file.', task.id)
        )
      }
    }
    for (const path of task.report?.commands ?? []) {
      if (!/git\s+commit/.test(path)) {
        continue
      }
      const cid = `commit:${task.id}:${commitIndex++}`
      addNode({
        id: cid,
        type: 'commit',
        label: 'Git commit',
        meta: { command: path, taskId: task.id }
      })
      relationships.push(
        rel(taskNode.id, cid, 'produced', 'agent-reported', 'The task completion report listed this git commit command.', task.id)
      )
    }

    for (const question of task.questions) {
      const qid = `question:${task.id}:${question.id}`
      addNode({
        id: qid,
        type: 'question',
        label: question.need,
        status: question.answeredAt ? 'answered' : 'open',
        meta: { why: question.why, consequence: question.consequence, taskId: task.id }
      })
      relationships.push(rel(taskNode.id, qid, 'references', 'confirmed', 'The task asked this question.', String(question.id)))
      if (question.answeredAt) {
        relationships.push(rel(qid, userNodeId, 'approved-by', 'user-confirmed', 'The user answered this question.', String(question.id)))
      } else if (task.status === 'needs-input') {
        relationships.push(rel(taskNode.id, qid, 'blocked-by', 'confirmed', 'An unanswered question is blocking this task.', String(question.id)))
      }
    }

    // Test nodes from files that look like tests.
    for (const path of task.filesChanged) {
      if (!isTestFile(path)) {
        continue
      }
      const tid = `test:${path}`
      if (!nodesById.has(tid)) {
        addNode({
          id: tid,
          type: 'test',
          label: basename(path),
          meta: { path }
        })
      }
      relationships.push(
        rel(taskNode.id, tid, 'changed', 'confirmed', 'The task changed a test file.', task.id)
      )
      const base = baseFileForTest(path)
      if (base) {
        relationships.push(
          rel(tid, fileNode(base), 'verifies', 'confirmed', 'The test file verifies this source file.', path)
        )
      }
    }
  }

  // Goal → task membership (resolved after task nodes exist).
  for (const edge of goalTaskEdges) {
    if (!nodesById.has(`task:${edge.taskId}`)) {
      continue
    }
    relationships.push(
      rel(edge.goalId, `task:${edge.taskId}`, 'contains', 'confirmed', 'The goal task board lists this task.', edge.taskId)
    )
  }

  // ---- Memories and decisions ----------------------------------------------

  for (const memory of source.memories) {
    const isDecision = memory.type === 'decision'
    const node: GraphNode = {
      id: `memory:${memory.id}`,
      type: isDecision ? 'decision' : 'memory',
      label: memory.title,
      projectPath: memory.projectPath,
      status: memory.approval,
      confidence: memory.confidence,
      tags: memory.tags,
      archived: memory.archived,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
      meta: {
        id: memory.id,
        content: memory.content,
        createdBy: memory.createdBy,
        source: memory.source
      }
    }
    addNode(node)

    if (memory.conflictOf) {
      const existing = `memory:${memory.conflictOf}`
      if (nodesById.has(existing)) {
        relationships.push(
          rel(existing, node.id, 'contradicts', 'conflicting', 'Conflict detection flagged these two memories as disagreeing.', memory.id)
        )
      }
    }

    if (memory.type === 'decision' && memory.approval === 'approved') {
      relationships.push(
        rel(node.id, userNodeId, 'approved-by', 'user-confirmed', 'The user approved this decision.', memory.id)
      )
    }

    // Source links.
    const src = memory.source
    if (src.kind === 'task-report' && src.taskId && taskNodeById.has(src.taskId)) {
      relationships.push(rel(node.id, `task:${src.taskId}`, 'came-from', 'confirmed', 'Captured from this task completion report.', memory.id))
    } else if (src.kind === 'ask-me' && src.goalId && nodesById.has(`goal:${src.goalId}`)) {
      relationships.push(rel(node.id, `goal:${src.goalId}`, 'came-from', 'confirmed', 'Captured from a user decision.', memory.id))
    } else if (src.kind === 'ask-me' && src.taskId && taskNodeById.has(src.taskId)) {
      relationships.push(rel(node.id, `task:${src.taskId}`, 'came-from', 'confirmed', 'Captured from a user decision.', memory.id))
    } else if (src.kind === 'message' && conversationsById.has(src.conversationId)) {
      const conversation = conversationsById.get(src.conversationId)!
      if (conversation.taskId && taskNodeById.has(conversation.taskId)) {
        relationships.push(rel(node.id, `task:${conversation.taskId}`, 'came-from', 'agent-reported', 'Captured from a task conversation.', memory.id))
      } else if (conversation.goalId && nodesById.has(`goal:${conversation.goalId}`)) {
        relationships.push(rel(node.id, `goal:${conversation.goalId}`, 'came-from', 'agent-reported', 'Captured from a goal conversation.', memory.id))
      }
    } else if (src.kind === 'file-inspection' && src.path) {
      relationships.push(rel(node.id, fileNode(src.path), 'references', 'agent-reported', 'Captured while inspecting this file.', memory.id))
    } else if (src.kind === 'terminal' && src.sessionId) {
      const coworker = coworkerNode(src.sessionId, src.sessionId)
      relationships.push(rel(node.id, coworker, 'came-from', 'agent-reported', 'Captured from this coworker terminal.', memory.id))
    } else if (src.kind === 'user' || src.kind === 'manual') {
      relationships.push(rel(node.id, userNodeId, 'came-from', 'user-confirmed', 'Created by the user.', memory.id))
    }

    if (memory.relatedAgentId) {
      relationships.push(
        rel(coworkerNode(memory.relatedAgentId, memory.relatedAgentId), node.id, 'references', 'agent-reported', 'The coworker contributed this memory.', memory.id)
      )
    }
    if (memory.relatedTaskId && taskNodeById.has(memory.relatedTaskId)) {
      relationships.push(rel(node.id, `task:${memory.relatedTaskId}`, 'came-from', 'confirmed', 'Related to this task.', memory.id))
    }
    if (memory.relatedGoalId && nodesById.has(`goal:${memory.relatedGoalId}`)) {
      relationships.push(rel(node.id, `goal:${memory.relatedGoalId}`, 'came-from', 'confirmed', 'Related to this goal.', memory.id))
    }
    for (const usage of memory.usage) {
      if (taskNodeById.has(usage.taskId)) {
        relationships.push(
          rel(`task:${usage.taskId}`, node.id, 'uses', 'confirmed', 'The task used this memory while working.', usage.taskId)
        )
      }
    }
    const project = projectNode(memory.projectPath)
    if (project) {
      relationships.push(rel(project, node.id, 'references', 'confirmed', 'Belongs to this project.', memory.id))
    }
  }

  // ---- Messages ------------------------------------------------------------

  const importantKinds = new Set(['assignment', 'blocker', 'review', 'handoff', 'finding', 'answer', 'announcement'])
  const byConversation = new Map<string, MessageRecord[]>()
  for (const message of source.messages) {
    if (!importantKinds.has(message.kind)) {
      continue
    }
    const list = byConversation.get(message.conversationId) ?? []
    list.push(message)
    byConversation.set(message.conversationId, list)
  }
  let messageBudget = 120
  const sortedMessages = [...byConversation.values()]
    .map((list) => list.slice(-12))
    .flat()
    .sort((a, b) => a.createdAt - b.createdAt)
    .filter(() => messageBudget-- > 0)

  for (const message of sortedMessages) {
    const mid = `message:${message.id}`
    addNode({
      id: mid,
      type: 'message',
      label: `${messageKindLabel(message.kind)}: ${messagePreview(message.text, 60)}`,
      status: message.status,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      meta: {
        id: message.id,
        kind: message.kind,
        text: message.text,
        urgent: message.urgent,
        priority: message.priority,
        conversationId: message.conversationId
      }
    })

    const sender = coworkerNode(message.senderId, message.senderId)
    relationships.push(rel(sender, mid, 'sent', 'confirmed', 'The coworker sent this message.', message.id))
    const recipient = message.recipientId
      ? coworkerNode(message.recipientId, message.recipientId)
      : null
    if (recipient) {
      relationships.push(rel(mid, recipient, 'received', 'confirmed', 'The coworker received this message.', message.id))
    }

    if (message.kind === 'review') {
      if (recipient) {
        relationships.push(rel(sender, recipient, 'reviewed', 'agent-reported', 'Review message from the sender to the recipient.', message.id))
      }
    } else if (message.kind === 'handoff') {
      if (recipient) {
        relationships.push(rel(sender, recipient, 'handoff', 'agent-reported', 'Work was handed off between coworkers.', message.id))
      }
    }

    if (message.taskId && taskNodeById.has(message.taskId)) {
      relationships.push(rel(mid, `task:${message.taskId}`, 'references', 'confirmed', 'The message concerns this task.', message.id))
    }

    if (message.kind === 'answer' && message.taskId) {
      const task = source.tasks.find((t) => t.id === message.taskId)
      const answered = task?.questions.filter((q) => q.answeredAt).sort((a, b) => b.answeredAt! - a.answeredAt!)[0]
      if (answered) {
        relationships.push(
          rel(mid, `question:${message.taskId}:${answered.id}`, 'answered', 'user-confirmed', 'This answer message resolved the question.', message.id)
        )
      }
    }
  }

  // ---- Persisted (inferred / custom) nodes and relationships ---------------

  for (const persisted of source.persistedNodes) {
    if (!nodesById.has(persisted.id)) {
      addNode({
        id: persisted.id,
        type: persisted.type,
        label: persisted.label,
        projectPath: persisted.projectPath,
        status: persisted.status,
        archived: persisted.archived,
        confidence: persisted.confidence,
        tags: persisted.tags,
        createdAt: persisted.createdAt,
        updatedAt: persisted.updatedAt,
        meta: persisted.meta
      })
    }
  }

  for (const persisted of source.persistedRelationships) {
    if (persisted.archived) {
      continue
    }
    const sourceNode = nodesById.get(persisted.source)
    const targetNode = nodesById.get(persisted.target)
    if (!sourceNode) {
      addNode({
        id: persisted.source,
        type: 'external',
        label: persisted.source,
        meta: { persisted: true }
      })
    }
    if (!targetNode) {
      addNode({
        id: persisted.target,
        type: 'external',
        label: persisted.target,
        meta: { persisted: true }
      })
    }
    relationships.push({ ...persisted })
  }

  return {
    nodes: [...nodesById.values()],
    relationships,
    stats: {
      goals: source.goals.length,
      tasks: source.tasks.length,
      memories: source.memories.length,
      messages: source.messages.length
    }
  }
}

function baseFileForTest(path: string): string | null {
  const candidates = [
    path.replace(/\.test\.(\w+)$/, '.$1'),
    path.replace(/\.spec\.(\w+)$/, '.$1'),
    path.replace(/([-_]test|[-_]spec)\.(\w+)$/, '.$2'),
    path.replace(/\/(__tests__)\/([^/]+)\.(\w+)$/, '/$2.$3')
  ]
  for (const candidate of candidates) {
    if (candidate !== path) {
      return candidate
    }
  }
  return null
}

export const CONFIRMED_STATUSES: GraphRelationshipStatus[] = ['confirmed', 'user-confirmed', 'agent-reported']
export const INFERRED_STATUSES: GraphRelationshipStatus[] = ['inferred', 'outdated']

/** Solid for confirmed/user-confirmed, dashed for inferred/agent-reported/outdated. */
export function relationshipLineStyle(rel: GraphRelationship): string {
  if (rel.status === 'inferred' || rel.status === 'outdated' || rel.status === 'agent-reported') {
    return 'dashed'
  }
  return 'solid'
}

export function relationshipLineColor(rel: GraphRelationship): string {
  if (rel.status === 'conflicting' || rel.type === 'blocked-by' || rel.status === 'outdated') {
    return rel.type === 'blocked-by' || rel.status === 'conflicting' ? '#ff4d5e' : '#9aa6cf'
  }
  return '#7c88b8'
}

export function relationshipArrow(rel: GraphRelationship): boolean {
  return rel.type !== 'contradicts'
}

export interface GraphFilters {
  nodeTypes?: GraphNodeType[]
  statusCategories?: StatusCategory[]
  projectPath?: string
  agentId?: string
  goalId?: string
  confidence?: MemoryConfidence
  dateFrom?: number
  dateTo?: number
  showArchived?: boolean
  confirmedOnly?: boolean
  query?: string
  maxNodes?: number
}

const DEFAULT_MAX_NODES = 350

/** Apply filters to a snapshot. Neighbour-keeping filters keep 1 hop of context. */
export function applyFilters(snapshot: GraphSnapshot, filters: GraphFilters): GraphSnapshot {
  const maxNodes = filters.maxNodes ?? DEFAULT_MAX_NODES
  const keep = new Set<string>()

  const keepIf = (node: GraphNode): boolean => {
    if (filters.nodeTypes && !filters.nodeTypes.includes(node.type)) {
      return false
    }
    if (!filters.showArchived && node.archived) {
      return false
    }
    if (filters.statusCategories) {
      const category = nodeStatusCategory(node)
      if (!filters.statusCategories.includes(category)) {
        return false
      }
    }
    if (filters.projectPath && node.projectPath !== filters.projectPath) {
      return false
    }
    if (filters.confidence && node.confidence && node.confidence !== filters.confidence) {
      return false
    }
    if (filters.dateFrom && (node.updatedAt ?? node.createdAt ?? 0) < filters.dateFrom) {
      return false
    }
    if (filters.dateTo && (node.createdAt ?? 0) > filters.dateTo) {
      return false
    }
    if (filters.query) {
      const q = filters.query.toLowerCase()
      const haystack = `${node.label} ${node.meta?.description ?? ''} ${node.tags?.join(' ') ?? ''} ${node.meta?.content ?? ''}`.toLowerCase()
      if (!haystack.includes(q)) {
        return false
      }
    }
    return true
  }

  for (const node of snapshot.nodes) {
    if (keepIf(node)) {
      keep.add(node.id)
    }
  }

  // Neighbour-keeping filters.
  const neighbours = new Set<string>()
  const neighbourCenters = new Set<string>()
  if (filters.agentId) {
    neighbourCenters.add(`coworker:${filters.agentId}`)
  }
  if (filters.goalId) {
    neighbourCenters.add(`goal:${filters.goalId}`)
  }
  if (neighbourCenters.size > 0) {
    for (const rel of snapshot.relationships) {
      if (neighbourCenters.has(rel.source) && keep.has(rel.source)) {
        neighbours.add(rel.target)
      }
      if (neighbourCenters.has(rel.target) && keep.has(rel.target)) {
        neighbours.add(rel.source)
      }
    }
  }
  for (const id of neighbours) {
    keep.add(id)
  }

  // Cap the visible node set (keep most recent).
  if (keep.size > maxNodes) {
    const sorted = [...keep]
      .map((id) => snapshot.nodes.find((n) => n.id === id)!)
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0))
    const keptIds = new Set(sorted.slice(0, maxNodes).map((n) => n.id))
    keep.clear()
    for (const id of keptIds) {
      keep.add(id)
    }
  }

  const relationships = snapshot.relationships.filter((rel) => {
    if (filters.confirmedOnly && !CONFIRMED_STATUSES.includes(rel.status)) {
      return false
    }
    return keep.has(rel.source) && keep.has(rel.target)
  })

  return {
    nodes: snapshot.nodes.filter((n) => keep.has(n.id)),
    relationships
  }
}

export interface GraphPreset {
  id: string
  label: string
  filters: GraphFilters
}

export const GRAPH_PRESETS: GraphPreset[] = [
  { id: 'all', label: 'Everything', filters: {} },
  { id: 'current-goal', label: 'Current goal', filters: {} },
  { id: 'blocked', label: 'Blocked work', filters: { statusCategories: ['blocked', 'waiting'] } },
  { id: 'recent', label: 'Recent changes', filters: { dateFrom: Date.now() - 24 * 60 * 60 * 1000 } },
  { id: 'collaboration', label: 'Agent collaboration', filters: { nodeTypes: ['coworker', 'message', 'task', 'question'] } },
  { id: 'architecture', label: 'Architecture', filters: { nodeTypes: ['project', 'file', 'test', 'external', 'decision'] } },
  { id: 'decisions', label: 'Decisions', filters: { nodeTypes: ['decision', 'memory', 'goal', 'question'] } },
  { id: 'memory-sources', label: 'Memory sources', filters: { nodeTypes: ['memory', 'decision', 'task', 'goal', 'coworker'] } }
]

/** Expand the "current-goal" preset with the selected goal. */
export function presetFilters(presetId: string, selectedGoalId: string | null): GraphFilters {
  if (presetId === 'current-goal') {
    return selectedGoalId ? { goalId: selectedGoalId } : {}
  }
  return GRAPH_PRESETS.find((p) => p.id === presetId)?.filters ?? {}
}

/** BFS over both edge directions. Returns the ordered node-id path or null. */
export function findPath(
  relationships: GraphRelationship[],
  fromId: string,
  toId: string,
  maxDepth = 6
): string[] | null {
  if (fromId === toId) {
    return [fromId]
  }
  const adjacency = new Map<string, string[]>()
  for (const rel of relationships) {
    const a = adjacency.get(rel.source) ?? []
    a.push(rel.target)
    adjacency.set(rel.source, a)
    const b = adjacency.get(rel.target) ?? []
    b.push(rel.source)
    adjacency.set(rel.target, b)
  }
  const queue: Array<{ id: string; path: string[] }> = [{ id: fromId, path: [fromId] }]
  const visited = new Set([fromId])
  while (queue.length > 0) {
    const { id, path } = queue.shift()!
    if (path.length > maxDepth) {
      continue
    }
    for (const next of adjacency.get(id) ?? []) {
      if (visited.has(next)) {
        continue
      }
      if (next === toId) {
        return [...path, next]
      }
      visited.add(next)
      queue.push({ id: next, path: [...path, next] })
    }
  }
  return null
}

/** Keep the given center plus neighbours within `depth` hops. */
export function focusSubgraph(snapshot: GraphSnapshot, centerId: string, depth = 1): GraphSnapshot {
  const keep = new Set([centerId])
  let frontier = new Set([centerId])
  for (let hop = 0; hop < depth; hop += 1) {
    const next = new Set<string>()
    for (const rel of snapshot.relationships) {
      if (frontier.has(rel.source)) {
        next.add(rel.target)
      }
      if (frontier.has(rel.target)) {
        next.add(rel.source)
      }
    }
    for (const id of next) {
      keep.add(id)
    }
    frontier = next
  }
  return {
    nodes: snapshot.nodes.filter((n) => keep.has(n.id)),
    relationships: snapshot.relationships.filter((r) => keep.has(r.source) && keep.has(r.target))
  }
}

/** Highlight potential impact: the node plus everything within 2 hops. */
export function impactSubgraph(snapshot: GraphSnapshot, centerId: string, depth = 2): GraphSnapshot {
  return focusSubgraph(snapshot, centerId, depth)
}

/** Human label for a node, truncated for compact display. */
export function nodeLabel(node: GraphNode, maxLen = 34): string {
  if (node.label.length <= maxLen) {
    return node.label
  }
  return `${node.label.slice(0, maxLen - 1)}…`
}

export function nodeGlyph(node: GraphNode): string {
  return NODE_TYPE_GLYPHS[node.type]
}

export function graphRelationshipLabel(rel: GraphRelationship): string {
  return RELATIONSHIP_LABELS[rel.type]
}