import { useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { MiniAvatar } from './MiniAvatar'
import { getAvatar, DEFAULT_COWORKER } from '../scene/characters'
import { useMessageStore, conversationSummaries, threadFor } from '../../application/state/messageStore'
import { useOfficeStore } from '../../application/state/officeStore'
import { useTaskStore } from '../../application/state/taskStore'
import {
  sendMessage,
  replyInConversation,
  acknowledgeMessage,
  rerouteMessage,
  sendAnnouncement,
  proposeConversationMemory,
  askMichaelToSummarize,
  convertMessageToTask,
  agentName
} from '../../application/services/messageEngine'
import {
  conversationIdForDirect,
  messageKindLabel,
  messagePriorityLabel,
  messagePreview,
  USER_ID
} from '@shared/rules/message'
import type { ConversationRecord, MessageKind, MessagePriority, MessageRecord, MessageReference } from '@shared/types'

interface MessagesPanelProps {
  viewerId: string
  isManager: boolean
  onOpenTask: (taskId: string) => void
}

const KIND_OPTIONS: MessageKind[] = [
  'information',
  'progress',
  'finding',
  'review',
  'handoff',
  'blocker'
]
const PRIORITY_OPTIONS: MessagePriority[] = ['low', 'medium', 'high', 'urgent']

const CONV_LABEL: Record<ConversationRecord['kind'], string> = {
  task: 'TASK',
  goal: 'GOAL',
  direct: 'DIRECT',
  announcement: 'ANNOUNCE',
  system: 'SYSTEM'
}

export function MessagesPanel({
  viewerId,
  isManager,
  onOpenTask
}: MessagesPanelProps): React.JSX.Element {
  const mailVersion = useMessageStore((s) => [s.messages, s.conversations])
  const conversations = useMemo(
    () => conversationSummaries(isManager ? undefined : viewerId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mailVersion, viewerId, isManager]
  )
  const markConversationRead = useMessageStore((s) => s.markConversationRead)
  const setConversationStatus = useMessageStore((s) => s.setConversationStatus)
  const agents = useOfficeStore(useShallow((s) => Object.values(s.agents)))
  const tasks = useTaskStore(useShallow((s) => s.tasks))

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [composer, setComposer] = useState('')
  const [composerKind, setComposerKind] = useState<MessageKind>('information')
  const [composerPriority, setComposerPriority] = useState<MessagePriority>('medium')
  const [composerRecipient, setComposerRecipient] = useState('')
  const [references, setReferences] = useState<MessageReference[]>([])
  const [announceOpen, setAnnounceOpen] = useState(false)
  const [announceText, setAnnounceText] = useState('')
  const [announceTargets, setAnnounceTargets] = useState<string[]>([])
  const [routeTargets, setRouteTargets] = useState<Record<string, string>>({})
  const composerRef = useRef<HTMLTextAreaElement>(null)

  const selected = selectedId ? useMessageStore((s) => s.conversations[selectedId]) : null
  const thread = useMemo(() => (selectedId ? threadFor(selectedId) : []), [selectedId, mailVersion])

  const selectConversation = (id: string): void => {
    setSelectedId(id)
    markConversationRead(id, isManager ? USER_ID : viewerId)
    setComposer('')
  }

  const managerId = (): string | null => useOfficeStore.getState().managerId

  const canMessage = (agentId: string): boolean =>
    agentId !== viewerId && (isManager || agentId !== managerId())

  const workers = agents.filter((agent) => agent.id !== managerId())
  const recipients = isManager ? workers : agents.filter((agent) => canMessage(agent.id))

  const sendNew = (): void => {
    const text = composer.trim()
    const recipient = composerRecipient
    if (!text || !recipient) {
      return
    }
    const conversationId = conversationIdForDirect(viewerId, recipient)
    void sendMessage({
      conversationId,
      senderId: viewerId,
      recipientId: recipient,
      kind: composerKind,
      priority: composerPriority,
      text,
      references
    })
    setComposer('')
    setReferences([])
    setSelectedId(conversationId)
  }

  const sendReply = (): void => {
    const text = composer.trim()
    if (!text || !selectedId) {
      return
    }
    void replyInConversation(selectedId, text, isManager ? viewerId : viewerId)
    setComposer('')
    setReferences([])
  }

  const pickFiles = async (): Promise<void> => {
    const paths = await window.workspace.selectFiles()
    if (!paths) {
      return
    }
    const next = paths.map((path) => ({
      kind: 'file' as const,
      label: path.split(/[/\\]/).filter(Boolean).pop() ?? path,
      path
    }))
    setReferences((current) => [...current, ...next])
  }

  const sendAnnounce = (): void => {
    if (!announceText.trim() || announceTargets.length === 0) {
      return
    }
    sendAnnouncement(announceTargets, announceText.trim())
    setAnnounceText('')
    setAnnounceTargets([])
    setAnnounceOpen(false)
  }

  const renderConversationList = (): React.JSX.Element => {
    if (conversations.length === 0) {
      return (
        <div className="msgs-empty">
          <span className="msgs-empty-glyph">✉</span>
          <p>
            {isManager
              ? 'No team conversations yet.'
              : 'No conversations yet. Anything the team sends you lands here.'}
          </p>
        </div>
      )
    }
    return (
      <div className="msgs-list">
        {conversations.map((summary) => {
          const conv = summary.conversation
          const last = summary.lastMessage
          const urgent = last?.urgent
          const paused = conv.status === 'paused'
          const closed = conv.status === 'closed'
          return (
            <button
              key={conv.id}
              className={`msgs-item ${selectedId === conv.id ? 'active' : ''} ${
                summary.unread > 0 ? 'unread' : ''
              }`}
              onClick={() => selectConversation(conv.id)}
            >
              <div className="msgs-item-top">
                <span className={`conv-tag conv-${conv.kind}`}>{CONV_LABEL[conv.kind]}</span>
                <span className="msgs-item-title">
                  {convTitle(conv, tasks)}
                </span>
                {paused && <span className="conv-paused">PAUSED</span>}
                {closed && <span className="conv-closed">CLOSED</span>}
              </div>
              {last && (
                <span className={`msgs-item-last ${urgent ? 'urgent' : ''}`}>
                  {messagePreview(`${agentName(last.senderId)}: ${last.text}`)}
                </span>
              )}
              <div className="msgs-item-bottom">
                <span className="msgs-item-participants">
                  {summary.participantIds.map((id) => agentName(id)).join(' · ')}
                </span>
                <span className="msgs-item-ts">{formatTime(summary.lastActivity)}</span>
                {summary.unread > 0 && <span className="msgs-item-unread">{summary.unread}</span>}
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  const renderThread = (): React.JSX.Element => {
    if (!selected || thread.length === 0) {
      return (
        <div className="msgs-thread-empty">
          <p>Select a conversation to read it, or send a new message below.</p>
        </div>
      )
    }
    return (
      <div className="msgs-thread">
        <div className="msgs-thread-head">
          <span className="msgs-thread-title">{convTitle(selected, tasks)}</span>
          <span className={`conv-tag conv-${selected.kind}`}>{CONV_LABEL[selected.kind]}</span>
          {selected.status === 'paused' && (
            <span className="conv-paused">Loop guard paused this conversation</span>
          )}
          <div className="msgs-thread-tools">
            {selected.status === 'open' && (
              <>
                <button
                  className="btn btn-small"
                  onClick={() => askMichaelToSummarize(selected.id)}
                  title="Ask Michael to summarize this conversation"
                >
                  Summarize
                </button>
                <button
                  className="btn btn-small"
                  onClick={() => void proposeConversationMemory(selected.id)}
                  title="Save a concise conclusion as a team memory"
                >
                  Save memory
                </button>
                {selected.status !== 'open' && (
                  <button
                    className="btn btn-small"
                    onClick={() => setConversationStatus(selected.id, 'closed')}
                    title="Close this conversation"
                  >
                    Close
                  </button>
                )}
              </>
            )}
            {selected.status !== 'open' && (
              <button
                className="btn btn-small"
                onClick={() => setConversationStatus(selected.id, 'open')}
              >
                Reopen
              </button>
            )}
          </div>
        </div>
        {thread.map((message) => renderMessage(message))}
      </div>
    )
  }

  const renderMessage = (message: MessageRecord): React.JSX.Element => {
    const sender = useOfficeStore.getState().agents[message.senderId]
    const avatar = getAvatar(sender?.avatarId ?? '') ?? DEFAULT_COWORKER
    const fromUser = message.senderId === USER_ID
    const toMe = message.recipientId === viewerId || message.recipients?.includes(viewerId)
    const task = message.taskId ? tasks[message.taskId] : undefined
    const routeTarget = routeTargets[message.id] ?? ''
    return (
      <div key={message.id} className={`msg ${fromUser ? 'from-user' : 'from-agent'} ${
        message.urgent ? 'urgent' : ''
      }`}>
        <div className="msg-portrait">
          {fromUser ? (
            <span className="msg-user-glyph">U</span>
          ) : (
            <MiniAvatar spec={avatar} scale={1} className="cc-avatar" />
          )}
        </div>
        <div className="msg-body">
          <div className="msg-meta">
            <span className="msg-sender">{agentName(message.senderId)}</span>
            <span className="msg-recipient">→ {message.recipients ? 'announcement' : agentName(message.recipientId ?? '')}</span>
            <span className={`msg-kind msg-kind-${message.kind}`}>{messageKindLabel(message.kind)}</span>
            {message.urgent && <span className="msg-urgent">URGENT</span>}
            <span className="msg-ts">{new Date(message.createdAt).toLocaleString()}</span>
          </div>
          {task && (
            <button className="msg-task-link" onClick={() => onOpenTask(task.id)}>
              #{task.title}
            </button>
          )}
          <pre className="msg-text">{message.text}</pre>
          {message.references.length > 0 && (
            <div className="msg-refs">
              {message.references.map((reference, index) => (
                <span key={index} className="msg-ref">
                  {reference.kind}: {reference.label}
                  {reference.path ? ` (${reference.path})` : ''}
                </span>
              ))}
            </div>
          )}
          <div className="msg-status">
            <span className={`msg-status-badge msg-status-${message.status}`}>
              {messageStatusLabelLocal(message.status)}
            </span>
            {message.status === 'queued' && <span className="msg-status-note">waiting for recipient to be ready</span>}
            {message.status === 'failed' && <span className="msg-status-note">delivery failed</span>}
          </div>
          <div className="msg-actions">
            <button
              className="btn btn-small"
              onClick={() => {
                setSelectedId(message.conversationId)
                composerRef.current?.focus()
              }}
            >
              Reply
            </button>
            {toMe && message.status === 'delivered' && (
              <button
                className="btn btn-small"
                onClick={() => acknowledgeMessage(message.id)}
              >
                Acknowledge
              </button>
            )}
            {isManager && !fromUser && message.senderId !== 'system' && (
              <>
                <button
                  className="btn btn-small"
                  onClick={() => void convertMessageToTask(message.id).then((task) => task && onOpenTask(task.id))}
                >
                  Convert to task
                </button>
                <select
                  className="text-input select msg-route-select"
                  value={routeTarget}
                  onChange={(e) => {
                    const next = e.target.value
                    setRouteTargets({ ...routeTargets, [message.id]: next })
                    if (next) {
                      rerouteMessage(message.id, next)
                    }
                  }}
                >
                  <option value="">Route to…</option>
                  {agents
                    .filter((agent) => agent.id !== message.senderId)
                    .map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                </select>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderComposer = (): React.JSX.Element => {
    const isReply = !!selectedId
    return (
      <div className="msgs-composer">
        {isReply && (
          <div className="msgs-composer-head">
            <span className="section-desc">REPLYING IN {convTitle(selected ?? ({} as ConversationRecord), tasks).toUpperCase()}</span>
            <button
              className="btn btn-small"
              onClick={() => {
                setSelectedId(null)
                setComposer('')
              }}
            >
              New message
            </button>
          </div>
        )}
        {!isReply && (
          <div className="composer-row">
            <label className="field-label" htmlFor="msgs-recipient">
              To
            </label>
            <select
              id="msgs-recipient"
              className="text-input select"
              value={composerRecipient}
              onChange={(e) => setComposerRecipient(e.target.value)}
            >
              <option value="">— choose a coworker —</option>
              {recipients.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} ({agent.role})
                </option>
              ))}
            </select>
            <label className="field-label" htmlFor="msgs-kind">
              Type
            </label>
            <select
              id="msgs-kind"
              className="text-input select"
              value={composerKind}
              onChange={(e) => setComposerKind(e.target.value as MessageKind)}
            >
              {KIND_OPTIONS.map((kind) => (
                <option key={kind} value={kind}>
                  {messageKindLabel(kind)}
                </option>
              ))}
            </select>
            <label className="field-label" htmlFor="msgs-priority">
              Priority
            </label>
            <select
              id="msgs-priority"
              className="text-input select"
              value={composerPriority}
              onChange={(e) => setComposerPriority(e.target.value as MessagePriority)}
            >
              {PRIORITY_OPTIONS.map((priority) => (
                <option key={priority} value={priority}>
                  {messagePriorityLabel(priority)}
                </option>
              ))}
            </select>
          </div>
        )}
        {references.length > 0 && (
          <div className="msg-refs composer-refs">
            {references.map((reference, index) => (
              <span key={index} className="msg-ref">
                {reference.kind}: {reference.label}
              </span>
            ))}
          </div>
        )}
        <div className="composer-row">
          <textarea
            ref={composerRef}
            className="text-input textarea msgs-composer-input"
            rows={3}
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            placeholder={
              isReply
                ? 'Reply in this conversation…'
                : 'Write a structured message to a coworker…'
            }
          />
          <button className="btn btn-ghost btn-small" onClick={pickFiles} title="Attach file references">
            ATTACH
          </button>
          <button
            className="btn btn-small btn-primary"
            onClick={isReply ? sendReply : sendNew}
            disabled={!composer.trim() || (!isReply && !composerRecipient)}
          >
            Send
          </button>
        </div>
        <p className="cc-scaffold-hint">
          Messages reach an idle coworker immediately; busy or stopped coworkers receive them when ready.
        </p>
      </div>
    )
  }

  return (
    <div className="msgs">
      <div className="msgs-side">
        <div className="msgs-side-tools">
          <span className="section-desc">
            {conversations.length} conversation{conversations.length === 1 ? '' : 's'}
          </span>
          {isManager && (
            <button className="btn btn-small" onClick={() => setAnnounceOpen(!announceOpen)}>
              Announce
            </button>
          )}
        </div>
        {announceOpen && (
          <div className="msgs-announce">
            <textarea
              className="text-input textarea"
              rows={2}
              value={announceText}
              onChange={(e) => setAnnounceText(e.target.value)}
              placeholder="Announcement to the team…"
            />
            <div className="announce-targets">
              {workers.map((agent) => (
                <label key={agent.id} className="announce-target">
                  <input
                    type="checkbox"
                    checked={announceTargets.includes(agent.id)}
                    onChange={(e) => {
                      setAnnounceTargets((current) =>
                        e.target.checked
                          ? [...current, agent.id]
                          : current.filter((id) => id !== agent.id)
                      )
                    }}
                  />
                  {agent.name}
                </label>
              ))}
            </div>
            <div className="cc-actions">
              <button
                className="btn btn-small btn-primary"
                onClick={sendAnnounce}
                disabled={!announceText.trim() || announceTargets.length === 0}
              >
                Send announcement
              </button>
            </div>
          </div>
        )}
        {renderConversationList()}
      </div>
      <div className="msgs-main">
        {renderThread()}
        {renderComposer()}
      </div>
    </div>
  )
}

function convTitle(
  conversation: ConversationRecord,
  tasks: ReturnType<typeof useTaskStore.getState>['tasks']
): string {
  if (conversation.title) {
    return conversation.title
  }
  if (conversation.taskId) {
    return tasks[conversation.taskId]?.title ?? `Task ${conversation.taskId}`
  }
  return conversation.participants
    .filter((id) => id !== USER_ID)
    .map((id) => agentName(id))
    .join(' ↔ ')
}

function formatTime(ts: number): string {
  const date = new Date(ts)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString()
}

function messageStatusLabelLocal(status: MessageRecord['status']): string {
  switch (status) {
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
    default:
      return 'Draft'
  }
}