import { useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { TerminalView } from './TerminalView'
import { MiniAvatar } from './MiniAvatar'
import { CloseIcon } from './ChromeIcon'
import { getAvatar } from '../office/characters'
import { DEFAULT_COWORKER } from '../office/characters'
import { useOfficeStore } from '../office/store'
import type { CliInfo, SessionStatus } from '@shared/types'

type TabId =
  | 'monitor'
  | 'activity'
  | 'tasks'
  | 'memory'
  | 'ask-me'
  | 'triggers'
  | 'graph'
  | 'commands'
  | 'workers'
  | 'terminal'

const TABS: { id: TabId; label: string }[] = [
  { id: 'monitor', label: 'Monitor' },
  { id: 'activity', label: 'Activity' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'memory', label: 'Memory' },
  { id: 'ask-me', label: 'Ask Me' },
  { id: 'triggers', label: 'Triggers' },
  { id: 'graph', label: 'Graph' },
  { id: 'commands', label: 'Commands' },
  { id: 'workers', label: 'Workers' },
  { id: 'terminal', label: 'Terminal' }
]

const STATUS_LABELS: Record<SessionStatus, string> = {
  idle: 'Idle',
  starting: 'Starting',
  running: 'Running',
  stopped: 'Stopped',
  completed: 'Completed',
  error: 'Error'
}

interface Message {
  id: number
  from: 'me' | 'agent'
  text: string
  ts: number
}

let messageId = 0

interface CommandCenterProps {
  agentId: string
  clis: CliInfo[]
  terminalSizeRef: React.MutableRefObject<{ cols: number; rows: number }>
  onOpenMemory: () => void
}

function formatUptime(startedAt?: number): string {
  if (!startedAt) {
    return '—'
  }
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export function CommandCenter({
  agentId,
  clis,
  terminalSizeRef,
  onOpenMemory
}: CommandCenterProps): React.JSX.Element {
  const agent = useOfficeStore((s) => s.agents[agentId])
  const activity = useOfficeStore(useShallow((s) => s.activity[agentId] ?? []))
  const tasks = useOfficeStore(useShallow((s) => s.tasks[agentId] ?? []))
  const notes = useOfficeStore(useShallow((s) => s.memory.filter((n) => n.agentId === agentId)))
  const setAgentAutoMode = useOfficeStore((s) => s.setAgentAutoMode)
  const addTask = useOfficeStore((s) => s.addTask)
  const toggleTask = useOfficeStore((s) => s.toggleTask)
  const removeTask = useOfficeStore((s) => s.removeTask)
  const addMemory = useOfficeStore((s) => s.addMemory)
  const removeMemory = useOfficeStore((s) => s.removeMemory)
  const clearActivity = useOfficeStore((s) => s.clearActivity)
  const managerId = useOfficeStore((s) => s.managerId)

  const [tab, setTab] = useState<TabId>('terminal')
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [taskDraft, setTaskDraft] = useState('')
  const [memoryDraft, setMemoryDraft] = useState('')
  const [startError, setStartError] = useState<string | null>(null)
  const [engine, setEngine] = useState(agent?.cliId ?? '')
  const activityRef = useRef<HTMLDivElement>(null)

  const avatar = useMemo(() => getAvatar(agent?.avatarId ?? '') ?? DEFAULT_COWORKER, [agent])

  if (!agent) {
    return (
      <div className="command-center">
        <div className="cc-empty">
          <span className="cc-empty-glyph">∅</span>
          <p>Select a coworker to inspect.</p>
        </div>
      </div>
    )
  }

  const isDraft = agent.cliId === ''
  const cols = terminalSizeRef.current.cols
  const rows = terminalSizeRef.current.rows

  const close = (): void => {
    if (agent.id === managerId) {
      return
    }
    if (!isDraft) {
      window.workspace.stopSession(agent.id)
    }
    useOfficeStore.getState().removeAgent(agent.id)
  }

  const stop = (): void => {
    window.workspace.stopSession(agent.id)
  }

  const restart = (): void => {
    window.workspace.restartSession(agent.id, cols, rows)
  }

  const startDraft = async (): Promise<void> => {
    if (!agent.projectPath) {
      setStartError('This coworker has no project folder assigned.')
      return
    }
    if (!engine) {
      setStartError('Choose an engine (CLI) first.')
      return
    }
    setStartError(null)
    try {
      const { sessionId } = await window.workspace.createSession({
        projectPath: agent.projectPath,
        cliId: engine,
        name: agent.name,
        role: agent.role,
        description: agent.description,
        goal: agent.goal,
        avatarId: agent.avatarId,
        accent: agent.accent,
        autoMode: agent.autoMode,
        cols,
        rows
      })
      useOfficeStore.getState().removeAgent(agent.id)
      useOfficeStore.getState().requestFocus(sessionId)
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err))
    }
  }

  const sendMessage = (): void => {
    const text = draft.trim()
    if (!text) {
      return
    }
    setMessages((prev) => [...prev, { id: ++messageId, from: 'me', text, ts: Date.now() }])
    setDraft('')
  }

  const addTaskNow = (): void => {
    const text = taskDraft.trim()
    if (!text) {
      return
    }
    addTask(agent.id, text)
    setTaskDraft('')
  }

  const addMemoryNow = (): void => {
    const text = memoryDraft.trim()
    if (!text) {
      return
    }
    addMemory(agent.id, text)
    setMemoryDraft('')
  }

  const openEditor = (): void => {
    if (agent.projectPath) {
      window.workspace.openInEditor(agent.projectPath)
    }
  }

  const renderTab = (): React.JSX.Element => {
    switch (tab) {
      case 'terminal':
        if (isDraft) {
          return (
            <div className="cc-panel cc-panel-center">
              <div className="not-started">
                <span className="not-started-title">SESSION NOT STARTED</span>
                <p className="section-desc">
                  {agent.projectPath ?? 'No project folder assigned.'}
                </p>
                {agent.projectPath && (
                  <label className="field-label" htmlFor="cc-engine">
                    Engine
                  </label>
                )}
                {agent.projectPath && (
                  <select
                    id="cc-engine"
                    className="text-input select"
                    value={engine}
                    onChange={(e) => {
                      setEngine(e.target.value)
                      setStartError(null)
                    }}
                  >
                    <option value="">— choose —</option>
                    {clis.map((cli) => (
                      <option key={cli.id} value={cli.id} disabled={!cli.detected}>
                        {cli.name}
                        {cli.detected ? '' : ' (not installed)'}
                      </option>
                    ))}
                  </select>
                )}
                {startError && <span className="session-error">{startError}</span>}
                <div className="cc-actions">
                  <button className="btn btn-primary" onClick={startDraft} disabled={!agent.projectPath}>
                    Start Session
                  </button>
                </div>
              </div>
            </div>
          )
        }
        return (
          <div className="cc-panel cc-terminal-panel">
            <div className="terminal-screen cc-terminal-screen">
              <TerminalView
                sessionId={agent.id}
                onResize={(c, r) => {
                  terminalSizeRef.current = { cols: c, rows: r }
                }}
              />
            </div>
          </div>
        )
      case 'monitor':
        return (
          <div className="cc-panel">
            <div className="monitor-grid">
              <div className="monitor-card">
                <span className="monitor-label">STATUS</span>
                <span className={`monitor-value status-${agent.status}`}>
                  {STATUS_LABELS[agent.status]}
                </span>
              </div>
              <div className="monitor-card">
                <span className="monitor-label">UPTIME</span>
                <span className="monitor-value">{formatUptime(agent.startedAt)}</span>
              </div>
              <div className="monitor-card">
                <span className="monitor-label">PROVIDER</span>
                <span className="monitor-value">{agent.provider ?? '—'}</span>
              </div>
              <div className="monitor-card">
                <span className="monitor-label">MODEL</span>
                <span className="monitor-value">{agent.model ?? '—'}</span>
              </div>
              <div className="monitor-card">
                <span className="monitor-label">OUTPUT</span>
                <span className="monitor-value">{activity.length} lines</span>
              </div>
              <div className="monitor-card">
                <span className="monitor-label">TASKS</span>
                <span className="monitor-value">{tasks.filter((t) => !t.done).length} open</span>
              </div>
            </div>
            {agent.projectPath && (
              <div className="cc-actions">
                <button className="btn btn-ghost" onClick={openEditor}>
                  Open IDE
                </button>
                {!isDraft && (agent.status === 'running' || agent.status === 'starting') && (
                  <button className="btn" onClick={stop}>
                    Stop
                  </button>
                )}
                {!isDraft &&
                  (agent.status === 'stopped' ||
                    agent.status === 'completed' ||
                    agent.status === 'error') && (
                    <button className="btn" onClick={restart}>
                      Restart
                    </button>
                  )}
              </div>
            )}
          </div>
        )
      case 'activity':
        return (
          <div className="cc-panel">
            <div className="cc-panel-tools">
              <span className="section-desc">{activity.length} lines</span>
              <button
                className="btn btn-small"
                onClick={() => clearActivity(agent.id)}
                disabled={activity.length === 0}
              >
                Clear
              </button>
            </div>
            <div className="activity-log" ref={activityRef}>
              {activity.length === 0 && (
                <p className="cc-placeholder">No activity recorded yet.</p>
              )}
              {activity.map((line, index) => (
                <div key={index} className="activity-line">
                  {line}
                </div>
              ))}
            </div>
          </div>
        )
      case 'tasks':
        return (
          <div className="cc-panel">
            <div className="field-row">
              <input
                className="text-input"
                value={taskDraft}
                onChange={(e) => setTaskDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addTaskNow()
                  }
                }}
                placeholder="Add a task…"
              />
              <button className="btn btn-small" onClick={addTaskNow}>
                Add
              </button>
            </div>
            <div className="task-list">
              {tasks.length === 0 && <p className="cc-placeholder">No tasks yet.</p>}
              {tasks.map((task) => (
                <div key={task.id} className={`task-item ${task.done ? 'done' : ''}`}>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => toggleTask(agent.id, task.id)}
                    />
                    <span className="task-text">{task.text}</span>
                  </label>
                  <button
                    className="btn-icon btn-icon-small"
                    onClick={() => removeTask(agent.id, task.id)}
                    title="Remove task"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      case 'memory':
        return (
          <div className="cc-panel">
            <div className="cc-panel-tools">
              <span className="section-desc">{notes.length} notes</span>
              <button className="btn btn-small" onClick={onOpenMemory}>
                Shared Memory
              </button>
            </div>
            <div className="field-row">
              <input
                className="text-input"
                value={memoryDraft}
                onChange={(e) => setMemoryDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addMemoryNow()
                  }
                }}
                placeholder="Save a note…"
              />
              <button className="btn btn-small" onClick={addMemoryNow}>
                Save
              </button>
            </div>
            <div className="memory-list">
              {notes.length === 0 && (
                <p className="cc-placeholder">No notes for this coworker.</p>
              )}
              {notes.map((note) => (
                <div key={note.id} className="memory-item">
                  <span className="memory-text">{note.text}</span>
                  <span className="memory-ts">{new Date(note.ts).toLocaleTimeString()}</span>
                  <button
                    className="btn-icon btn-icon-small"
                    onClick={() => removeMemory(note.id)}
                    title="Remove note"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      case 'ask-me':
        return (
          <div className="cc-panel">
            <div className="queue-list">
              {messages.length === 0 && (
                <p className="cc-placeholder">
                  Message queue is empty. Your messages are queued here before being sent.
                </p>
              )}
              {messages.map((message) => (
                <div key={message.id} className={`queue-item ${message.from}`}>
                  <span className="queue-badge">{message.from === 'me' ? 'YOU' : 'AGENT'}</span>
                  <span className="queue-text">{message.text}</span>
                  <span className="queue-ts">{new Date(message.ts).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
            <div className="field-row">
              <input
                className="text-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    sendMessage()
                  }
                }}
                placeholder="Message this coworker…"
              />
              <button className="btn btn-small" onClick={sendMessage}>
                Send
              </button>
            </div>
            <p className="cc-scaffold-hint">Queue only — delivery to the engine is not wired yet.</p>
          </div>
        )
      case 'triggers':
        return (
          <div className="cc-panel cc-panel-center">
            <p className="cc-placeholder">No triggers configured yet.</p>
            <span className="cc-scaffold-hint">
              Automation rules will live here (e.g. run on file change).
            </span>
          </div>
        )
      case 'graph':
        return (
          <div className="cc-panel cc-panel-center">
            <div className="graph-placeholder">
              <span>⊞</span>
              <p>Dependency graph</p>
              <span className="cc-scaffold-hint">Coming soon.</span>
            </div>
          </div>
        )
      case 'commands':
        return (
          <div className="cc-panel cc-panel-center">
            <p className="cc-placeholder">No custom commands yet.</p>
            <span className="cc-scaffold-hint">Frequently used commands will be saved here.</span>
          </div>
        )
      case 'workers':
        return (
          <div className="cc-panel">
            <div className="worker-list">
              <div className="worker-item">
                <MiniAvatar spec={avatar} scale={1} />
                <div className="worker-meta">
                  <span className="worker-name">{agent.name}</span>
                  <span className="worker-status">
                    {isDraft ? 'Draft — not started' : STATUS_LABELS[agent.status]}
                  </span>
                </div>
              </div>
            </div>
            <span className="cc-scaffold-hint">Sub-agents and parallel workers will appear here.</span>
          </div>
        )
    }
  }

  return (
    <div className="command-center">
      <div className="cc-portrait">
        <MiniAvatar spec={avatar} scale={2} className="cc-avatar" />
        <span className="cc-name">{agent.name}</span>
        <span className="cc-role">{agent.role}</span>
        <span className="cc-engine">
          {agent.provider ?? '—'}
          {agent.model ? ` · ${agent.model}` : ''}
        </span>
        <label className="auto-toggle">
          <input
            type="checkbox"
            checked={agent.autoMode ?? false}
            onChange={(e) => setAgentAutoMode(agent.id, e.target.checked)}
          />
          AUTO MODE
        </label>
        {agent.id !== managerId && (
          <button className="btn btn-small btn-ghost" onClick={close}>
            <CloseIcon className="icon-btn" /> Close
          </button>
        )}
      </div>

      <div className="cc-main">
        <div className="cc-session-bar">
          <span className={`status-badge status-${agent.status}`}>
            {isDraft ? 'Draft' : STATUS_LABELS[agent.status]}
          </span>
          <span className="cc-session-meta" title={agent.projectPath}>
            {agent.projectPath ? basename(agent.projectPath) : 'no project'}
          </span>
          <span className="cc-session-meta">{agent.cliId ? cliLabel(agent.cliId, clis) : '—'}</span>
          {!isDraft && (
            <span className="cc-session-meta">uptime {formatUptime(agent.startedAt)}</span>
          )}
        </div>

        <div className="cc-tabs">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              className={`cc-tab ${tab === entry.id ? 'active' : ''}`}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
              {entry.id === 'ask-me' && messages.length > 0 && (
                <span className="cc-badge">{messages.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="cc-content">{renderTab()}</div>
      </div>

      {tab !== 'ask-me' && (
        <button className="ask-me-pill" onClick={() => setTab('ask-me')}>
          ASK ME
        </button>
      )}
    </div>
  )
}

function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path
}

function cliLabel(cliId: string, clis: CliInfo[]): string {
  return clis.find((c) => c.id === cliId)?.name ?? cliId
}