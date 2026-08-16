import type { ConversationRecord, MessageKind, MessagePriority, MessageRecord, NewMessageInput } from '@shared/types'
import {
  USER_ID,
  conversationIdForTask,
  deliveryDecision,
  detectLoop,
  isDuplicate,
  messageKindLabel,
  messagePreview
} from '@shared/rules/message'
import { threadFor, useMessageStore, useMessageStore as store } from '../state/messageStore'
import { useOfficeStore } from '../state/officeStore'
import { useTaskStore } from '../state/taskStore'
import { useGoalStore } from '../state/goalStore'
import { proposeMemory } from './memoryEngine'

/**
 * Trusted message router.
 *
 * The application is the only thing that writes into a coworker's terminal.
 * When a message is sent, this engine decides between immediate delivery,
 * queuing (busy / stopped workers) and failure (dead workers), flushes the
 * queue when a worker becomes idle, detects chatter loops and escalates
 * urgent traffic to Michael. All message records are persisted before any
 * routing decision is made so nothing is lost across restarts.
 */

function agentName(id: string): string {
  if (id === USER_ID) {
    return 'User'
  }
  return useOfficeStore.getState().agents[id]?.name ?? id
}

function managerId(): string | null {
  return useOfficeStore.getState().managerId
}

function alertMichael(text: string, taskId?: string): void {
  const id = managerId()
  useTaskStore.getState().notify('warning', 'Message needs attention', taskId, text)
  if (id) {
    useOfficeStore.getState().addMemory(id, text)
  }
}

/** Write a line into a live, idle-at-prompt terminal. Safe against interleaving. */
function writeToTerminal(agentId: string, text: string): boolean {
  const agent = useOfficeStore.getState().agents[agentId]
  if (!agent || agent.cliId === '') {
    return false
  }
  if (
    agent.status !== 'running' &&
    agent.status !== 'starting'
  ) {
    return false
  }
  if (!agent.promptPending) {
    return false
  }
  window.workspace.sendInput(agentId, text + '\r')
  useOfficeStore.getState().recordInput(agentId)
  return true
}

function injectionText(message: MessageRecord): string {
  const sender = agentName(message.senderId)
  const task = message.taskId
    ? useTaskStore.getState().tasks[message.taskId]
    : undefined
  const lines = [
    `[Message from ${sender} — ${messageKindLabel(message.kind)}${message.urgent ? ' · URGENT' : ''}]`,
    message.text,
    task ? `(Task: ${task.title})` : '',
    `@pixelforge/message ${JSON.stringify({
      id: message.id,
      from: sender,
      kind: message.kind,
      taskId: message.taskId ?? '',
      replyTo: message.replyToId ?? ''
    })}`
  ]
  return lines.filter((line) => line.length > 0).join('\n')
}

/** Route a freshly created message: deliver, queue or fail. */
function routeMessage(message: MessageRecord): void {
  const recipient = message.recipientId ?? message.recipients?.[0]
  if (!recipient) {
    store.getState().updateStatus(message.id, 'processed')
    return
  }
  if (recipient === USER_ID) {
    store.getState().updateStatus(message.id, 'delivered')
    store.getState().pushMail({
      fromId: message.senderId,
      toId: USER_ID,
      urgent: message.urgent,
      kind: message.kind,
      ts: Date.now()
    })
    if (message.urgent) {
      alertMichael(`An urgent message is waiting for you.`, message.taskId)
    }
    return
  }

  const agent = useOfficeStore.getState().agents[recipient]
  if (!agent) {
    store.getState().updateStatus(message.id, 'failed')
    alertMichael(`Delivery failed: recipient "${recipient}" is not a known coworker.`, message.taskId)
    return
  }

  const decision = deliveryDecision(agent.status, agent.promptPending)
  if (decision === 'deliver' && writeToTerminal(recipient, injectionText(message))) {
    store.getState().updateStatus(message.id, 'delivered')
  } else if (decision === 'failed') {
    store.getState().updateStatus(message.id, 'failed')
    alertMichael(`Message to ${agent.name} could not be delivered (worker is down).`, message.taskId)
  } else {
    store.getState().updateStatus(message.id, 'queued')
  }

  store.getState().pushMail({
    fromId: message.senderId,
    toId: recipient,
    urgent: message.urgent,
    kind: message.kind,
    ts: Date.now()
  })

  if (message.urgent) {
    alertMichael(`Urgent ${messageKindLabel(message.kind).toLowerCase()} sent to ${agent.name}.`, message.taskId)
  }
}

function guardLoop(conversation: ConversationRecord): void {
  const thread = threadFor(conversation.id)
  const detection = detectLoop(conversation, thread)
  if (!detection.loop) {
    return
  }
  store.getState().setConversationStatus(conversation.id, 'paused')
  alertMichael(`Conversation paused: ${detection.reason ?? 'possible loop'}`)
  void recordSystem(conversation.id, `Conversation paused by loop guard: ${detection.reason ?? ''}`)
}

/** Send a message through the router. Returns the persisted record. */
export async function sendMessage(input: NewMessageInput): Promise<MessageRecord | null> {
  if (!input.text.trim()) {
    return null
  }
  const conversation = store.getState().conversations[input.conversationId]
  if (conversation?.status === 'closed') {
    useTaskStore.getState().notify('info', 'Conversation closed', input.taskId, 'Reopen the conversation to send again.')
    return null
  }
  const duplicate = isDuplicate(Object.values(store.getState().messages), input)
  if (duplicate) {
    return null
  }
  let message: MessageRecord
  try {
    message = await store.getState().recordMessage(input)
  } catch {
    alertMichael('Message could not be persisted.', input.taskId)
    return null
  }
  routeMessage(message)
  const conv = store.getState().conversations[message.conversationId]
  if (conv && conv.status !== 'closed') {
    guardLoop(conv)
  }
  return message
}

/** Record a message without routing (assignments, answers, system events). */
export async function recordMessage(input: NewMessageInput): Promise<MessageRecord | null> {
  if (!input.text.trim()) {
    return null
  }
  try {
    return await store.getState().recordMessage(input, 'delivered')
  } catch {
    return null
  }
}

/** Deliver everything queued for an agent that is now ready. */
export function flushQueuedFor(agentId: string): void {
  const { messages } = store.getState()
  const queued = Object.values(messages)
    .filter(
      (message) =>
        (message.recipientId === agentId || message.recipients?.includes(agentId)) &&
        message.status === 'queued'
    )
    .sort((a, b) => a.createdAt - b.createdAt)
  for (const message of queued) {
    const agent = useOfficeStore.getState().agents[agentId]
    if (!agent || !agent.promptPending) {
      return
    }
    if (writeToTerminal(agentId, injectionText(message))) {
      store.getState().updateStatus(message.id, 'delivered')
    } else {
      return
    }
  }
}

/** Record a system event in an agent's system conversation. */
export function recordSystem(conversationId: string, text: string): void {
  if (!text.trim()) {
    return
  }
  void store
    .getState()
    .recordMessage(
      {
        conversationId,
        senderId: 'system',
        recipientId: USER_ID,
        kind: 'system',
        text: text.trim(),
        priority: 'low'
      },
      'delivered'
    )
    .catch(() => {
      // best-effort
    })
}

/** Post a progress/finding/blocker message from a coworker to its task thread. */
export function postTaskMessage(
  taskId: string,
  senderId: string,
  kind: MessageKind,
  text: string,
  priority: MessagePriority = 'medium'
): void {
  if (!text.trim()) {
    return
  }
  const task = useTaskStore.getState().tasks[taskId]
  if (!task) {
    return
  }
  const goal = Object.values(useGoalStore.getState().goals).find((goalRecord) =>
    goalRecord.taskIds.includes(taskId)
  )
  void sendMessage({
    conversationId: conversationIdForTask(taskId),
    senderId,
    recipientId: managerId() ?? USER_ID,
    kind,
    priority,
    text: text.trim(),
    taskId,
    goalId: goal?.id,
    projectPath: task.projectPath
  })
}

/** Reply inside a conversation (the user is the default sender). */
export async function replyInConversation(
  conversationId: string,
  text: string,
  senderId = USER_ID,
  kind: MessageKind = 'answer'
): Promise<MessageRecord | null> {
  const thread = threadFor(conversationId)
  const last = thread[thread.length - 1]
  const recipient =
    last && last.senderId !== senderId
      ? last.senderId
      : last?.recipientId ?? managerId() ?? USER_ID
  return sendMessage({
    conversationId,
    replyToId: last?.id,
    senderId,
    recipientId: recipient,
    kind,
    text,
    taskId: store.getState().conversations[conversationId]?.taskId,
    goalId: store.getState().conversations[conversationId]?.goalId,
    projectPath: store.getState().conversations[conversationId]?.projectPath
  })
}

/** Broadcast one message to several coworkers; they acknowledge individually. */
export function sendAnnouncement(
  recipientIds: string[],
  text: string,
  priority: MessagePriority = 'high'
): void {
  const sender = managerId() ?? USER_ID
  const targets = recipientIds.filter((id) => id !== sender)
  if (targets.length === 0 || !text.trim()) {
    return
  }
  const conversationId = `announce:${Date.now()}`
  useMessageStore.getState().ensureConversation({
    id: conversationId,
    kind: 'announcement',
    participants: [sender, ...targets, USER_ID],
    title: messagePreview(text, 60)
  })
  for (const recipientId of targets) {
    void sendMessage({
      conversationId,
      senderId: sender,
      recipientId,
      kind: 'announcement',
      priority,
      text: text.trim()
    })
  }
}

/** Route a misdirected message to a different recipient and re-try delivery. */
export function rerouteMessage(messageId: string, newRecipientId: string): void {
  const message = store.getState().messages[messageId]
  if (!message) {
    return
  }
  const updated: MessageRecord = {
    ...message,
    recipientId: newRecipientId,
    recipients: undefined,
    status: 'draft',
    retries: message.retries + 1,
    updatedAt: Date.now()
  }
  store.getState().updateMessage(updated)
  routeMessage(updated)
}

/** Acknowledge a delivered message (confirms responsibility). */
export function acknowledgeMessage(messageId: string): void {
  store.getState().acknowledge(messageId)
}

/** Propose a concise memory distilled from a finished conversation. */
export function proposeConversationMemory(conversationId: string): Promise<void> {
  const conversation = store.getState().conversations[conversationId]
  const thread = threadFor(conversationId)
  if (!conversation || thread.length === 0) {
    return Promise.resolve()
  }
  const exchanges = thread
    .filter((message) => message.kind !== 'system')
    .slice(-8)
    .map((message) => `- ${agentName(message.senderId)}: ${messagePreview(message.text, 160)}`)
  const conclusion = thread
    .filter((message) => message.kind === 'answer' || message.kind === 'progress' || message.kind === 'handoff')
    .slice(-2)
    .map((message) => `- ${agentName(message.senderId)}: ${messagePreview(message.text, 160)}`)
  const content = [
    `## ${conversation.title ?? 'Team discussion'}`,
    '',
    '### Key exchanges',
    ...exchanges,
    '',
    conclusion.length > 0 ? `### Conclusion\n${conclusion.join('\n')}` : ''
  ]
    .filter((line) => line.length > 0)
    .join('\n')

  void proposeMemory({
    title: `Conversation: ${conversation.title ?? conversationId}`,
    content,
    type: 'decision',
    projectPath: conversation.projectPath,
    relatedTaskId: conversation.taskId,
    relatedGoalId: conversation.goalId,
    source: { kind: 'message', conversationId },
    createdBy: 'system',
    confidence: 'medium',
    tags: ['conversation', 'team'],
    visibility: 'team',
    approval: 'pending'
  })
  return Promise.resolve()
}

/** Ask Michael to summarize a long conversation via its terminal. */
export function askMichaelToSummarize(conversationId: string): void {
  const conversation = store.getState().conversations[conversationId]
  const manager = managerId()
  if (!conversation || !manager) {
    return
  }
  const agent = useOfficeStore.getState().agents[manager]
  if (!agent || agent.status !== 'running' && agent.status !== 'starting') {
    alertMichael('Michael is not running, so the summary request was skipped.')
    return
  }
  const thread = threadFor(conversationId)
  const body = thread
    .slice(-12)
    .map((message) => `- ${agentName(message.senderId)} (${message.kind}): ${messagePreview(message.text, 200)}`)
    .join('\n')
  const prompt = [
    `Summarize the team conversation "${conversation.title ?? conversationId}" in a few bullet points: what was discussed, what was decided, and whether any question remains open.`,
    '',
    body,
    '',
    '@pixelforge/message {"kind":"answer","replyTo":"summary","text":"<your summary>"}'
  ].join('\n')
  if (agent.promptPending) {
    window.workspace.sendInput(manager, prompt + '\r')
    useOfficeStore.getState().recordInput(manager)
  } else {
    alertMichael('Michael is busy; retry the summary once it is idle.')
  }
}

/** Called once at startup to wire routing triggers. */
export function startMessageEngine(): void {
  useOfficeStore.subscribe((state, previous) => {
    for (const agentId of Object.keys(state.agents)) {
      const before = previous.agents[agentId]
      const after = state.agents[agentId]
      if (!before || !after) {
        continue
      }
      const becameReady =
        after.promptPending &&
        !before.promptPending &&
        (after.status === 'running' || after.status === 'starting')
      if (becameReady) {
        flushQueuedFor(agentId)
      }
    }
  })

  setInterval(() => {
    const agents = useOfficeStore.getState().agents
    for (const agentId of Object.keys(agents)) {
      const agent = agents[agentId]
      if (agent && agent.promptPending && (agent.status === 'running' || agent.status === 'starting')) {
        flushQueuedFor(agentId)
      }
    }
  }, 3000)
}

export { agentName }
