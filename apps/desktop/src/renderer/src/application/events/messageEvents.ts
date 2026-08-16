import { useMessageStore } from '../state/messageStore'
import { useOfficeStore } from '../state/officeStore'
import { sendMessage, acknowledgeMessage } from '../services/messageEngine'
import { conversationIdForDirect, USER_ID } from '@shared/rules/message'
import type { MessageKind, MessagePriority } from '@shared/types'

/**
 * Bridge between raw terminal output and the messaging system.
 *
 * A coworker can request information, hand off work, report a blocker or
 * answer a question by emitting a structured marker. The application is the
 * trusted router: every marker is validated against the sender's session and
 * turned into a persisted, routed message. No terminal content is ever
 * injected into another agent's terminal here.
 */

const MARKER_RE = /@pixelforge\/message\s+(\{.*?\})/g

interface StructuredMessage {
  replyTo?: string
  to?: string
  kind?: string
  priority?: string
  text?: string
  task?: string
  goal?: string
}

function stripAnsi(data: string): string {
  // eslint-disable-next-line no-control-regex
  return data.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
}

function resolveRecipient(needle: string): string | undefined {
  const target = needle.trim().toLowerCase()
  const agents = useOfficeStore.getState().agents
  const direct = Object.values(agents).find((agent) => agent.id === needle || agent.name === needle)
  if (direct) {
    return direct.id
  }
  return Object.values(agents).find(
    (agent) =>
      agent.name.toLowerCase() === target ||
      agent.role.toLowerCase() === target ||
      agent.name.toLowerCase().includes(target) ||
      target.includes(agent.name.toLowerCase())
  )?.id
}

function isValidKind(kind: string): kind is MessageKind {
  return ['assignment', 'information', 'progress', 'finding', 'review', 'handoff', 'blocker', 'answer', 'system', 'announcement'].includes(kind)
}

function isValidPriority(priority: string): priority is MessagePriority {
  return ['low', 'medium', 'high', 'urgent'].includes(priority)
}

/** Process terminal output for a session and turn message markers into records. */
export function parseMessageOutput(sessionId: string, data: string): void {
  const messageState = useMessageStore.getState()
  if (!messageState.hydrated) {
    return
  }
  const sender = useOfficeStore.getState().agents[sessionId]
  if (!sender || sender.cliId === '') {
    return
  }
  const clean = stripAnsi(data)
  const marker = new RegExp(MARKER_RE.source, 'g')
  let match: RegExpExecArray | null
  while ((match = marker.exec(clean)) !== null) {
    try {
      const parsed = JSON.parse(match[1] ?? '{}') as StructuredMessage
      if (parsed === null || typeof parsed !== 'object') {
        continue
      }

      if (parsed.replyTo) {
        const target = messageState.messages[parsed.replyTo]
        if (target) {
          if (target.senderId === sessionId) {
            // an agent replying to its own message is ignored
            continue
          }
          if (!parsed.text) {
            acknowledgeMessage(target.id)
            continue
          }
          void sendMessage({
            conversationId: target.conversationId,
            replyToId: target.id,
            senderId: sessionId,
            recipientId: target.senderId,
            kind: isValidKind(parsed.kind ?? '') ? (parsed.kind as MessageKind) : 'answer',
            priority: isValidPriority(parsed.priority ?? '') ? (parsed.priority as MessagePriority) : 'medium',
            text: parsed.text,
            taskId: target.taskId,
            goalId: target.goalId,
            projectPath: target.projectPath
          })
          continue
        }
      }

      if (!parsed.text) {
        continue
      }

      const recipient = parsed.to
        ? resolveRecipient(parsed.to)
        : useOfficeStore.getState().managerId ?? USER_ID
      if (!recipient) {
        continue
      }
      const taskId = parsed.task ?? undefined
      const conversationId = taskId
        ? `task:${taskId}`
        : conversationIdForDirect(sessionId, recipient)
      void sendMessage({
        conversationId,
        senderId: sessionId,
        recipientId: recipient,
        kind: isValidKind(parsed.kind ?? '') ? (parsed.kind as MessageKind) : 'information',
        priority: isValidPriority(parsed.priority ?? '') ? (parsed.priority as MessagePriority) : 'medium',
        text: parsed.text,
        taskId,
        goalId: parsed.goal || undefined
      })
    } catch {
      // ignore malformed message markers
    }
  }
}