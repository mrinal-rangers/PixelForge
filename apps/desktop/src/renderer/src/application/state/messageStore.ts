import { create } from 'zustand'
import type {
  ConversationKind,
  ConversationRecord,
  ConversationStatus,
  MessageKind,
  MessageRecord,
  MessageStatus,
  NewMessageInput
} from '@shared/types'
import { isUnreadFor } from '@shared/rules/message'

/**
 * Persistent messaging state.
 *
 * Holds messages and conversations, derives mailboxes and unread counts, and
 * emits short-lived mail events for the office envelopes. The router that
 * decides *when* a message is typed into a terminal lives in
 * application/services/messageEngine so this store stays dependency-free.
 */

export interface MailEvent {
  id: string
  fromId: string
  toId: string
  urgent: boolean
  kind: MessageKind
  ts: number
}

interface MessageState {
  messages: Record<string, MessageRecord>
  conversations: Record<string, ConversationRecord>
  hydrated: boolean
  /** Short-lived events driving the office envelope animation. */
  mailEvents: MailEvent[]
  lastInboxChange: { agentId: string; ts: number } | null
  hydrate: () => Promise<void>
  ensureConversation: (opts: {
    id: string
    kind: ConversationKind
    participants: string[]
    taskId?: string
    goalId?: string
    projectPath?: string
    title?: string
  }) => ConversationRecord
  /** Create + persist a message without routing it anywhere. */
  recordMessage: (input: NewMessageInput, status?: MessageStatus) => Promise<MessageRecord>
  updateMessage: (message: MessageRecord) => void
  removeMessage: (id: string) => void
  updateStatus: (id: string, status: MessageStatus) => void
  markRead: (id: string) => void
  acknowledge: (id: string) => void
  process: (id: string) => void
  markConversationRead: (conversationId: string, viewerId: string) => void
  setConversationStatus: (id: string, status: ConversationStatus) => void
  pushMail: (event: Omit<MailEvent, 'id'>) => void
  dismissMail: (id: string) => void
}

function touchConversation(
  conversations: Record<string, ConversationRecord>,
  conversationId: string,
  now: number
): Record<string, ConversationRecord> {
  const conversation = conversations[conversationId]
  if (!conversation) {
    return conversations
  }
  return {
    ...conversations,
    [conversationId]: { ...conversation, updatedAt: now }
  }
}

let mailCounter = 0

export const useMessageStore = create<MessageState>()((set, get) => {
  const commit = (message: MessageRecord): void => {
    window.workspace.messageSave(message).catch(() => {
      // persistence is best-effort
    })
    set({
      messages: { ...get().messages, [message.id]: message },
      conversations: touchConversation(get().conversations, message.conversationId, Date.now())
    })
  }

  return {
    messages: {},
    conversations: {},
    hydrated: false,
    mailEvents: [],
    lastInboxChange: null,

    hydrate: async () => {
      try {
        const [messages, conversations] = await Promise.all([
          window.workspace.messageList(),
          window.workspace.conversationList()
        ])
        const messageMap: Record<string, MessageRecord> = {}
        for (const message of messages) {
          messageMap[message.id] = message
        }
        const conversationMap: Record<string, ConversationRecord> = {}
        for (const conversation of conversations) {
          conversationMap[conversation.id] = conversation
        }
        set({ messages: messageMap, conversations: conversationMap, hydrated: true })
      } catch {
        set({ hydrated: true })
      }
    },

    ensureConversation: (opts) => {
      const existing = get().conversations[opts.id]
      if (existing) {
        return existing
      }
      const now = Date.now()
      const conversation: ConversationRecord = {
        id: opts.id,
        kind: opts.kind,
        participants: opts.participants,
        taskId: opts.taskId,
        goalId: opts.goalId,
        projectPath: opts.projectPath,
        title: opts.title,
        status: 'open',
        createdAt: now,
        updatedAt: now
      }
      window.workspace.conversationSave(conversation).catch(() => {
        // best-effort
      })
      set({ conversations: { ...get().conversations, [opts.id]: conversation } })
      return conversation
    },

    recordMessage: async (input, status = 'delivered') => {
      get().ensureConversation({
        id: input.conversationId,
        kind: input.conversationId.startsWith('task:')
          ? 'task'
          : input.conversationId.startsWith('goal:')
            ? 'goal'
            : input.conversationId.startsWith('direct:')
              ? 'direct'
              : input.conversationId.startsWith('announce:')
                ? 'announcement'
                : 'system',
        participants: [
          ...new Set([input.senderId, ...(input.recipients ?? []), ...(input.recipientId ? [input.recipientId] : [])])
        ],
        taskId: input.taskId,
        goalId: input.goalId,
        projectPath: input.projectPath
      })
      let created: MessageRecord
      try {
        created = await window.workspace.messageCreate(input)
      } catch {
        throw new Error('Failed to persist message')
      }
      const record: MessageRecord = { ...created, status: status ?? created.status }
      if (record.status !== 'draft') {
        window.workspace.messageSave(record).catch(() => {
          // best-effort
        })
      }
      set({
        messages: { ...get().messages, [record.id]: record },
        conversations: touchConversation(get().conversations, record.conversationId, Date.now())
      })
      return record
    },

    updateMessage: (message) => {
      commit(message)
    },

    removeMessage: (id) => {
      window.workspace.messageRemove(id).catch(() => {
        // best-effort
      })
      const messages = { ...get().messages }
      delete messages[id]
      set({ messages })
    },

    updateStatus: (id, status) => {
      const message = get().messages[id]
      if (!message) {
        return
      }
      const now = Date.now()
      const next: MessageRecord = { ...message, status, updatedAt: now }
      if (status === 'delivered' && !next.deliveredAt) {
        next.deliveredAt = now
      }
      if (status === 'read' && !next.readAt) {
        next.readAt = now
      }
      if (status === 'acknowledged' && !next.acknowledgedAt) {
        next.acknowledgedAt = now
      }
      if (status === 'replied' && !next.repliedAt) {
        next.repliedAt = now
      }
      if (status === 'processed' && !next.processedAt) {
        next.processedAt = now
      }
      commit(next)
    },

    markRead: (id) => {
      const message = get().messages[id]
      if (!message) {
        return
      }
      if (message.readAt != null) {
        return
      }
      const now = Date.now()
      const next: MessageRecord = { ...message, status: 'read', readAt: now, updatedAt: now }
      commit(next)
      const recipient = message.recipientId ?? message.recipients?.[0]
      if (recipient) {
        set({ lastInboxChange: { agentId: recipient, ts: now } })
      }
    },

    acknowledge: (id) => {
      const message = get().messages[id]
      if (!message) {
        return
      }
      const now = Date.now()
      const next: MessageRecord = {
        ...message,
        status: 'acknowledged',
        acknowledgedAt: now,
        readAt: message.readAt ?? now,
        updatedAt: now
      }
      commit(next)
    },

    process: (id) => {
      const message = get().messages[id]
      if (!message) {
        return
      }
      const now = Date.now()
      const next: MessageRecord = {
        ...message,
        status: 'processed',
        processedAt: now,
        updatedAt: now
      }
      commit(next)
    },

    markConversationRead: (conversationId, viewerId) => {
      let changed = false
      for (const message of Object.values(get().messages)) {
        if (message.conversationId !== conversationId || message.readAt != null) {
          continue
        }
        if (message.senderId === viewerId) {
          continue
        }
        if (message.recipientId !== viewerId && !message.recipients?.includes(viewerId)) {
          continue
        }
        if (message.status !== 'delivered' && message.status !== 'queued' && message.status !== 'read') {
          continue
        }
        get().markRead(message.id)
        changed = true
      }
      if (changed) {
        set({ lastInboxChange: { agentId: viewerId, ts: Date.now() } })
      }
    },

    setConversationStatus: (id, status) => {
      const conversation = get().conversations[id]
      if (!conversation) {
        return
      }
      const next: ConversationRecord = { ...conversation, status, updatedAt: Date.now() }
      window.workspace.conversationSave(next).catch(() => {
        // best-effort
      })
      set({ conversations: { ...get().conversations, [id]: next } })
    },

    pushMail: (event) => {
      const entry: MailEvent = { ...event, id: `mail${++mailCounter}` }
      set({
        mailEvents: [...get().mailEvents, entry].slice(-24),
        lastInboxChange: { agentId: event.toId, ts: Date.now() }
      })
      setTimeout(() => {
        get().dismissMail(entry.id)
      }, 6000)
    },

    dismissMail: (id) => {
      set({ mailEvents: get().mailEvents.filter((event) => event.id !== id) })
    }
  }
})

// ---- Derived selectors (operate on live store state) ------------------------

export interface ConversationSummary {
  conversation: ConversationRecord
  lastMessage?: MessageRecord
  unread: number
  participantIds: string[]
  messageCount: number
  lastActivity: number
}

/** Sorted, most-recently-active-first conversation list.
 *  With an agentId it only includes conversations that agent participates in;
 *  without one it includes every conversation (used by Michael). */
export function conversationSummaries(agentId?: string): ConversationSummary[] {
  const state = useMessageStore.getState()
  const now = Date.now()
  const summaries: ConversationSummary[] = []
  for (const conversation of Object.values(state.conversations)) {
    if (agentId && !conversation.participants.includes(agentId)) {
      continue
    }
    const thread = Object.values(state.messages)
      .filter((message) => message.conversationId === conversation.id)
      .sort((a, b) => a.createdAt - b.createdAt)
    if (thread.length === 0) {
      continue
    }
    const last = thread[thread.length - 1]
    summaries.push({
      conversation,
      lastMessage: last,
      unread: agentId ? thread.filter((message) => isUnreadFor(message, agentId)).length : 0,
      participantIds: conversation.participants.filter((id) => id !== agentId && id !== 'user'),
      messageCount: thread.length,
      lastActivity: last?.createdAt ?? conversation.updatedAt ?? now
    })
  }
  return summaries.sort((a, b) => b.lastActivity - a.lastActivity)
}

export function unreadCountFor(agentId: string): number {
  const { messages } = useMessageStore.getState()
  let count = 0
  for (const message of Object.values(messages)) {
    if (isUnreadFor(message, agentId)) {
      count += 1
    }
  }
  return count
}

/** Messages waiting for a human decision (directed at the user or escalated). */
export function userDecisionMessages(): MessageRecord[] {
  const { messages } = useMessageStore.getState()
  return Object.values(messages)
    .filter(
      (message) =>
        message.recipientId === 'user' &&
        message.readAt == null &&
        (message.status === 'delivered' ||
          message.status === 'queued' ||
          message.status === 'read')
    )
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** A recipient agent's mailbox. */
export function mailboxFor(
  agentId: string
): { inbox: MessageRecord[]; outbox: MessageRecord[]; sent: MessageRecord[]; failed: MessageRecord[] } {
  const { messages } = useMessageStore.getState()
  const list = Object.values(messages)
  const inbox = list
    .filter(
      (message) =>
        (message.recipientId === agentId || message.recipients?.includes(agentId)) &&
        (message.status === 'delivered' || message.status === 'queued' || message.status === 'read')
    )
    .sort((a, b) => b.createdAt - a.createdAt)
  const outbox = list
    .filter((message) => message.senderId === agentId && message.status === 'queued')
    .sort((a, b) => b.createdAt - a.createdAt)
  const sent = list
    .filter(
      (message) =>
        message.senderId === agentId &&
        message.status !== 'queued' &&
        message.status !== 'draft' &&
        message.status !== 'failed'
    )
    .sort((a, b) => b.createdAt - a.createdAt)
  const failed = list
    .filter((message) => message.status === 'failed')
    .sort((a, b) => b.createdAt - a.createdAt)
  return { inbox, outbox, sent, failed }
}

/** The full thread of a conversation, oldest first. */
export function threadFor(conversationId: string): MessageRecord[] {
  const { messages } = useMessageStore.getState()
  return Object.values(messages)
    .filter((message) => message.conversationId === conversationId)
    .sort((a, b) => a.createdAt - b.createdAt)
}