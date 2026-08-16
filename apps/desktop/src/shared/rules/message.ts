import type {
  ConversationRecord,
  MessageKind,
  MessagePriority,
  MessageRecord,
  MessageStatus,
  SessionStatus
} from '../types'

/**
 * Pure business rules for the messaging system.
 *
 * These helpers are shared by the application layer (routing, validation,
 * loop detection) and the presentation layer (labels, unread counts). They
 * never touch the DOM, IPC or the database.
 */

export const USER_ID = 'user'

export function conversationIdForTask(taskId: string): string {
  return `task:${taskId}`
}

export function conversationIdForGoal(goalId: string): string {
  return `goal:${goalId}`
}

export function conversationIdForDirect(a: string, b: string): string {
  return `direct:${[a, b].sort().join('+')}`
}

export function conversationIdForSystem(agentId: string): string {
  return `system:${agentId}`
}

export function messageKindLabel(kind: MessageKind): string {
  switch (kind) {
    case 'assignment':
      return 'Assignment'
    case 'information':
      return 'Information request'
    case 'progress':
      return 'Progress'
    case 'finding':
      return 'Finding'
    case 'review':
      return 'Review request'
    case 'handoff':
      return 'Handoff'
    case 'blocker':
      return 'Blocker'
    case 'answer':
      return 'Answer'
    case 'system':
      return 'System'
    case 'announcement':
      return 'Announcement'
  }
}

export function messageStatusLabel(status: MessageStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft'
    case 'queued':
      return 'Queued'
    case 'delivered':
      return 'Delivered'
    case 'read':
      return 'Read'
    case 'acknowledged':
      return 'Acknowledged'
    case 'replied':
      return 'Replied'
    case 'processed':
      return 'Processed'
    case 'failed':
      return 'Failed'
  }
}

export function messagePriorityLabel(priority: MessagePriority): string {
  switch (priority) {
    case 'low':
      return 'Low'
    case 'medium':
      return 'Medium'
    case 'high':
      return 'High'
    case 'urgent':
      return 'Urgent'
  }
}

/** The recipient is idle at a prompt, so a message can be typed safely now. */
export function canDeliverNow(status: SessionStatus, promptPending: boolean): boolean {
  return (status === 'running' || status === 'starting') && promptPending
}

/** The recipient is actively working; a message would interleave with its input. */
export function isBusy(status: SessionStatus, promptPending: boolean): boolean {
  return (status === 'running' || status === 'starting') && !promptPending
}

/** Stopped/idle/completed agents keep messages queued until they resume. */
export function isRetainedTarget(status: SessionStatus): boolean {
  return status === 'idle' || status === 'stopped' || status === 'completed'
}

export type DeliveryDecision = 'deliver' | 'queue' | 'failed'

export function deliveryDecision(
  status: SessionStatus,
  promptPending: boolean
): DeliveryDecision {
  if (canDeliverNow(status, promptPending)) {
    return 'deliver'
  }
  if (isBusy(status, promptPending)) {
    return 'queue'
  }
  if (status === 'error') {
    return 'failed'
  }
  return 'queue'
}

/** Whether a message is awaiting the given agent's attention. */
export function isUnreadFor(message: MessageRecord, agentId: string): boolean {
  if (message.readAt != null) {
    return false
  }
  if (message.senderId === agentId) {
    return false
  }
  if (message.recipientId === agentId) {
    return true
  }
  if (message.recipients?.includes(agentId)) {
    return true
  }
  return false
}

/** Permission check: who is allowed to see a message. */
export function visibleTo(message: MessageRecord, agentId: string): boolean {
  if (message.senderId === agentId || message.recipientId === agentId) {
    return true
  }
  if (message.recipients?.includes(agentId)) {
    return true
  }
  return false
}

/** True when the message is identical in body to a recent one in the thread. */
export function isDuplicate(
  existing: MessageRecord[],
  candidate: Pick<MessageRecord, 'conversationId' | 'senderId' | 'text'>,
  windowMs = 60_000
): boolean {
  const needle = candidate.text.trim().toLowerCase()
  if (!needle) {
    return false
  }
  const now = Date.now()
  return existing.some(
    (message) =>
      message.conversationId === candidate.conversationId &&
      message.senderId === candidate.senderId &&
      message.text.trim().toLowerCase() === needle &&
      now - message.createdAt < windowMs
  )
}

export interface LoopDetection {
  loop: boolean
  reason?: string
}

const LOOP_WINDOW_MS = 120_000
const MAX_AUTO_REPLIES = 8
const MAX_PER_TASK_MSGS = 12
const MAX_UNRESOLVED_EXCHANGES = 6

/**
 * Heuristic safeguards against agent-to-agent chatter that never resolves.
 * A conversation is paused when any of the guards trips.
 */
export function detectLoop(
  conversation: ConversationRecord,
  messages: MessageRecord[],
  now = Date.now()
): LoopDetection {
  const thread = messages
    .filter((m) => m.conversationId === conversation.id)
    .sort((a, b) => a.createdAt - b.createdAt)
  if (thread.length === 0) {
    return { loop: false }
  }

  const recent = thread.filter((m) => now - m.createdAt < LOOP_WINDOW_MS)
  const auto = recent.filter((m) => m.senderId !== USER_ID)
  if (auto.length >= MAX_AUTO_REPLIES) {
    return {
      loop: true,
      reason: `${MAX_AUTO_REPLIES} automatic replies in the last ${Math.round(LOOP_WINDOW_MS / 1000)}s without progress.`
    }
  }

  if (conversation.taskId) {
    const perTask = thread.filter((m) => now - m.createdAt < LOOP_WINDOW_MS).length
    if (perTask >= MAX_PER_TASK_MSGS) {
      return {
        loop: true,
        reason: `${MAX_PER_TASK_MSGS} messages on this task in the last ${Math.round(LOOP_WINDOW_MS / 1000)}s.`
      }
    }
  }

  const tail = thread.slice(-MAX_UNRESOLVED_EXCHANGES)
  const onlyAgents = tail.every((m) => m.senderId !== USER_ID)
  const alternates = tail.every((m, index) => index === 0 || m.senderId !== tail[index - 1].senderId)
  if (onlyAgents && alternates && tail.length >= MAX_UNRESOLVED_EXCHANGES) {
    const unanswered = !tail.some((m) => m.kind === 'answer' || m.kind === 'assignment')
    if (unanswered) {
      return {
        loop: true,
        reason: `${MAX_UNRESOLVED_EXCHANGES} unanswered exchanges between coworkers.`
      }
    }
  }

  return { loop: false }
}

/** Short single-line preview for a conversation list. */
export function messagePreview(text: string, maxLen = 120): string {
  const single = text.replace(/\s+/g, ' ').trim()
  return single.length <= maxLen ? single : `${single.slice(0, maxLen - 1)}…`
}

/** Sorted participant pair used to compare direct conversations. */
export function participantKey(a: string, b: string): string {
  return [a, b].sort().join('+')
}