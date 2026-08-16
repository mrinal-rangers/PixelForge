import { randomUUID } from 'node:crypto'
import type {
  ConversationRecord,
  MessageRecord,
  NewMessageInput
} from '../../shared/types'
import { open } from './connection'

function toMessage(row: { json: string }): MessageRecord {
  return JSON.parse(row.json) as MessageRecord
}

function toConversation(row: { json: string }): ConversationRecord {
  return JSON.parse(row.json) as ConversationRecord
}

export function createMessage(input: NewMessageInput): MessageRecord {
  const now = Date.now()
  const message: MessageRecord = {
    id: randomUUID(),
    conversationId: input.conversationId,
    replyToId: input.replyToId,
    senderId: input.senderId,
    recipientId: input.recipientId,
    recipients: input.recipients,
    kind: input.kind,
    priority: input.priority ?? 'medium',
    text: input.text,
    taskId: input.taskId,
    goalId: input.goalId,
    projectPath: input.projectPath,
    references: input.references ?? [],
    status: 'draft',
    urgent: input.urgent ?? input.priority === 'urgent',
    retries: 0,
    createdAt: now,
    updatedAt: now
  }
  saveMessage(message)
  return message
}

export function saveMessage(message: MessageRecord): MessageRecord {
  const row = {
    id: message.id,
    json: JSON.stringify(message),
    conversation_id: message.conversationId,
    sender_id: message.senderId,
    recipient_id: message.recipientId ?? null,
    status: message.status,
    kind: message.kind,
    task_id: message.taskId ?? null,
    created_at: message.createdAt,
    updated_at: message.updatedAt
  }
  open()
    .prepare(
      `INSERT INTO messages (id, json, conversation_id, sender_id, recipient_id, status, kind, task_id, created_at, updated_at)
       VALUES (:id, :json, :conversation_id, :sender_id, :recipient_id, :status, :kind, :task_id, :created_at, :updated_at)
       ON CONFLICT(id) DO UPDATE SET
         json = excluded.json,
         conversation_id = excluded.conversation_id,
         sender_id = excluded.sender_id,
         recipient_id = excluded.recipient_id,
         status = excluded.status,
         kind = excluded.kind,
         task_id = excluded.task_id,
         updated_at = excluded.updated_at`
    )
    .run(row)
  return message
}

export function listMessages(): MessageRecord[] {
  const rows = open()
    .prepare('SELECT json FROM messages ORDER BY created_at ASC')
    .all() as { json: string }[]
  return rows.map(toMessage)
}

export function removeMessage(messageId: string): void {
  open().prepare('DELETE FROM messages WHERE id = ?').run(messageId)
}

export function createConversation(input: ConversationRecord): ConversationRecord {
  saveConversation(input)
  return input
}

export function saveConversation(conversation: ConversationRecord): ConversationRecord {
  const row = {
    id: conversation.id,
    json: JSON.stringify(conversation),
    kind: conversation.kind,
    created_at: conversation.createdAt,
    updated_at: conversation.updatedAt
  }
  open()
    .prepare(
      `INSERT INTO conversations (id, json, kind, created_at, updated_at)
       VALUES (:id, :json, :kind, :created_at, :updated_at)
       ON CONFLICT(id) DO UPDATE SET
         json = excluded.json,
         kind = excluded.kind,
         updated_at = excluded.updated_at`
    )
    .run(row)
  return conversation
}

export function listConversations(): ConversationRecord[] {
  const rows = open()
    .prepare('SELECT json FROM conversations ORDER BY updated_at DESC')
    .all() as { json: string }[]
  return rows.map(toConversation)
}