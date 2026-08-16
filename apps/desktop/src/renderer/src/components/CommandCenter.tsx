import { useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { TerminalView } from './TerminalView'
import { MiniAvatar } from './MiniAvatar'
import { GoalManager } from './GoalManager'
import { MemoryPanel } from './MemoryPanel'
import { getAvatar, DEFAULT_COWORKER } from '../office/characters'
import { useOfficeStore } from '../office/store'
import { useTaskStore } from '../office/taskStore'
import { taskLoadFor } from '@shared/rules/task'
import type { OfficeAgentRecord } from '../office/store'
import type { CliInfo, SessionStatus } from '@shared/types'

type WorkerTabId = 'terminal' | 'tasks' | 'git' | 'messages' | 'traces'
type ManagerTabId = 'goal' | 'terminal' | 'monitor' | 'tasks' | 'ask-me' | 'commands' | 'memory'
type TabId = WorkerTabId | ManagerTabId

const WORKER_TABS: { id: WorkerTabId; label: string }[] = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'git', label: 'Git' },
  { id: 'messages', label: 'Messages' },
  { id: 'traces', label: 'Traces' }
]

const MANAGER_TABS: { id: ManagerTabId; label: string }[] = [
  { id: 'goal', label: 'Goal' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'monitor', label: 'Monitor' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'ask-me', label: 'Ask Me' },
  { id: 'commands', label: 'Commands' },
  { id: 'memory', label: 'Memory' }
]

const STATUS_LABELS: Record<SessionStatus, string> = {
  idle: 'Idle',
  starting: 'Starting',
  running: 'Running',
  stopped: 'Stopped',
  completed: 'Completed',
  error: 'Error'
}

const MANAGER_COMMANDS = [
  { id: 'compact', label: 'Compact', hint: 'Compact the session history' },
  { id: 'help', label: 'Help', hint: 'List every command available' },
  { id: 'debug', label: 'Debug', hint: 'Toggle verbose debug output' },
  { id: 'status', label: 'Status', hint: 'Show current session status' },
  { id: 'plan', label: 'Plan', hint: 'Ask the manager to draft a plan' },
  { id: 'memory', label: 'Memory', hint: 'Open the manager memory file' }
]

interface CommandCenterProps {
  agentId: string
  clis: CliInfo[]
  terminalSizeRef: React.MutableRefObject<{ cols: number; rows: number }>
  onOpenBoard: () => void
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
  onOpenBoard
}: CommandCenterProps): React.JSX.Element {
  const agent = useOfficeStore((s) => s.agents[agentId])
  const agents = useOfficeStore(useShallow((s) => Object.values(s.agents)))
  const activity = useOfficeStore(useShallow((s) => s.activity[agentId] ?? []))
  const notes = useOfficeStore(useShallow((s) => s.memory.filter((n) => n.agentId === agentId)))
  const conversation = useOfficeStore(useShallow((s) => s.conversations[agentId] ?? []))
  const managerId = useOfficeStore((s) => s.managerId)
  const updateAgentMeta = useOfficeStore((s) => s.updateAgentMeta)
  const pushConversation = useOfficeStore((s) => s.pushConversation)
  const clearConversation = useOfficeStore((s) => s.clearConversation)
  const removeMemory = useOfficeStore((s) => s.removeMemory)
  const requestFocus = useOfficeStore((s) => s.requestFocus)
  const teamTasks = useTaskStore(useShallow((s) => Object.values(s.tasks)))
  const selectTask = useTaskStore((s) => s.selectTask)
  const answerQuestionForAgent = useTaskStore((s) => s.answerQuestionForAgent)

  const isManager = agent?.id === managerId

  const [tab, setTab] = useState<TabId>('terminal')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
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

  const beginEdit = (): void => {
    setEditName(agent.name)
    setEditRole(agent.role)
    setEditDesc(agent.description ?? '')
    setEditing(true)
  }

  const saveEdit = (): void => {
    updateAgentMeta(agent.id, {
      name: editName.trim() || agent.name,
      role: editRole.trim() || agent.role,
      description: editDesc.trim()
    })
    setEditing(false)
  }

  const deleteAgent = (): void => {
    if (!isDraft) {
      window.workspace.stopSession(agent.id)
    }
    useOfficeStore.getState().removeAgent(agent.id)
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
        autoMode: agent.autoMode ?? true,
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
    pushConversation(agent.id, { id: 0, from: 'me', text, ts: Date.now() })
    if (!isDraft) {
      const open = Object.values(useTaskStore.getState().tasks).find(
        (t) =>
          t.assignedAgentId === agent.id &&
          t.status === 'needs-input' &&
          t.questions.some((q) => q.answeredAt == null)
      )
      if (open) {
        answerQuestionForAgent(agent.id, text)
        setDraft('')
        return
      }
      window.workspace.sendInput(agent.id, text + '\r')
      useOfficeStore.getState().recordInput(agent.id)
    }
    setDraft('')
  }

  const openEditor = (): void => {
    if (agent.projectPath) {
      window.workspace.openInEditor(agent.projectPath)
    }
  }

  const renderTerminal = (): React.JSX.Element => {
    if (isDraft) {
      return (
        <div className="cc-panel cc-panel-center">
          <div className="not-started">
            <span className="not-started-title">SESSION NOT STARTED</span>
            <p className="section-desc">{agent.projectPath ?? 'No project folder assigned.'}</p>
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
  }

  const renderMessages = (): React.JSX.Element => {
    return (
      <div className="cc-panel">
        <div className="cc-panel-tools">
          <span className="section-desc">{conversation.length} messages</span>
          <button
            className="btn btn-small"
            onClick={() => clearConversation(agent.id)}
            disabled={conversation.length === 0}
          >
            Clear
          </button>
        </div>
        <div className="queue-list" ref={activityRef}>
          {conversation.length === 0 && (
            <p className="cc-placeholder">
              No messages yet. Anything the agent needs from you lands here.
            </p>
          )}
          {conversation.map((message) => (
            <div key={message.id} className={`queue-item ${message.from}`}>
              <span className="queue-badge">{message.from === 'me' ? 'YOU' : 'AGENT'}</span>
              <span className="queue-text">{message.text}</span>
              <span className="queue-ts">{new Date(message.ts).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
        <p className="cc-scaffold-hint">
          Messages are typed straight into the coworker's live terminal.
        </p>
      </div>
    )
  }

  const renderTab = (): React.JSX.Element => {
    if (isManager) {
      switch (tab) {
        case 'goal':
          return <GoalManager onOpenBoard={onOpenBoard} />
        case 'terminal':
          return renderTerminal()
        case 'monitor':
          return renderMonitor()
        case 'tasks':
          return renderTasks()
        case 'ask-me':
          return renderAskMe()
        case 'commands':
          return renderCommands()
        case 'memory':
          return renderMemory()
        default:
          return renderTerminal()
      }
    }
    switch (tab) {
      case 'terminal':
        return renderTerminal()
      case 'tasks':
        return renderWorkerTasks()
      case 'git':
        return renderGit()
      case 'messages':
        return renderMessages()
      case 'traces':
        return renderTraces()
      default:
        return renderTerminal()
    }
  }

  const renderGit = (): React.JSX.Element => {
    return (
      <div className="cc-panel">
        <div className="cc-panel-tools">
          <span className="section-desc">GIT STATE</span>
          <span className={`status-badge status-${agent.status}`}>
            {isDraft ? 'Draft' : STATUS_LABELS[agent.status]}
          </span>
        </div>
        <div className="git-box">
          <div className="git-row">
            <span className="git-label">PROJECT</span>
            <code className="git-value" title={agent.projectPath}>
              {agent.projectPath ? basename(agent.projectPath) : '—'}
            </code>
          </div>
          <div className="git-row">
            <span className="git-label">BRANCH</span>
            <code className="git-value">—</code>
          </div>
          <div className="git-row">
            <span className="git-label">AHEAD</span>
            <code className="git-value">—</code>
          </div>
          <div className="git-row">
            <span className="git-label">BEHIND</span>
            <code className="git-value">—</code>
          </div>
          <div className="git-row">
            <span className="git-label">CHANGES</span>
            <code className="git-value">—</code>
          </div>
        </div>
        {agent.projectPath && (
          <div className="cc-actions">
            <button className="btn btn-ghost" onClick={openEditor}>
              Open IDE
            </button>
          </div>
        )}
        <p className="cc-scaffold-hint">Live git status for this folder will stream here.</p>
      </div>
    )
  }

  const renderTraces = (): React.JSX.Element => {
    return (
      <div className="cc-panel">
        <div className="trace-list">
          <div className="trace-block">
            <span className="trace-label">SESSION</span>
            <div className="trace-grid">
              <span>Engine</span>
              <code>{agent.cliId ? cliLabel(agent.cliId, clis) : '—'}</code>
              <span>Provider</span>
              <code>{agent.provider ?? '—'}</code>
              <span>Model</span>
              <code>{agent.model ?? '—'}</code>
              <span>Uptime</span>
              <code>{formatUptime(agent.startedAt)}</code>
            </div>
          </div>
          <div className="trace-block">
            <span className="trace-label">BRIEF</span>
            <pre className="trace-pre">{agent.description || 'No description set.'}</pre>
            {agent.goal && (
              <>
                <span className="trace-label">GOAL</span>
                <pre className="trace-pre">{agent.goal}</pre>
              </>
            )}
          </div>
          <div className="trace-block">
            <span className="trace-label">LAST OUTPUT ({activity.length} lines)</span>
            <div className="trace-log">
              {activity.length === 0 && <p className="cc-placeholder">No output recorded yet.</p>}
              {activity.map((line, index) => (
                <div key={index} className="activity-line">
                  {line}
                </div>
              ))}
            </div>
          </div>
          <div className="trace-block">
            <span className="trace-label">MEMORY ({notes.length})</span>
            <div className="memory-list">
              {notes.length === 0 && <p className="cc-placeholder">No notes yet.</p>}
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
        </div>
      </div>
    )
  }

  const renderMonitor = (): React.JSX.Element => {
    const workers = agents.filter((record) => record.id !== managerId)
    return (
      <div className="cc-panel">
        <div className="cc-panel-tools">
          <span className="section-desc">{workers.length} workers</span>
        </div>
        <div className="monitor-list">
          {workers.length === 0 && (
            <p className="cc-placeholder">No workers yet. Add one from the office.</p>
          )}
          {workers.map((worker) => (
            <button key={worker.id} className="monitor-item" onClick={() => requestFocus(worker.id)}>
              <WorkerAvatar record={worker} />
              <span className="monitor-name">{worker.name}</span>
              <span className="monitor-state">{workerStateLabel(worker)}</span>
              <span className={`status-badge status-${worker.status}`}>
                {STATUS_LABELS[worker.status]}
              </span>
            </button>
          ))}
        </div>
        <p className="cc-scaffold-hint">Click a worker to inspect them.</p>
      </div>
    )
  }

  const renderTasks = (): React.JSX.Element => {
    const counts = { todo: 0, ongoing: 0, 'needs-input': 0, done: 0, failed: 0 }
    for (const task of teamTasks) {
      counts[task.status] += 1
    }
    const recent = [...teamTasks]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8)
    return (
      <div className="cc-panel">
        <div className="cc-panel-tools">
          <span className="section-desc">SHARED TASK BOARD</span>
          <button className="btn btn-small" onClick={onOpenBoard}>
            Open Board
          </button>
        </div>
        <div className="task-subtabs">
          {(['todo', 'ongoing', 'needs-input', 'done', 'failed'] as const).map((status) => (
            <button
              key={status}
              className={`task-subtab ${status === 'needs-input' && counts[status] > 0 ? 'attention' : ''}`}
              onClick={() => {
                selectTask(null)
                onOpenBoard()
              }}
            >
              {status}
              <span className="task-subtab-count">{counts[status]}</span>
            </button>
          ))}
        </div>
        <div className="task-list">
          {recent.length === 0 && (
            <p className="cc-placeholder">No tasks yet. Create the first one from the board.</p>
          )}
          {recent.map((task) => (
            <button
              key={task.id}
              className={`task-item task-${task.status}`}
              onClick={() => {
                selectTask(task.id)
                onOpenBoard()
              }}
            >
              <span className="task-text">{task.title}</span>
              <span className={`status-badge task-status-${task.status}`}>{task.status}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const renderWorkerTasks = (): React.JSX.Element => {
    const load = taskLoadFor(Object.fromEntries(teamTasks.map((t) => [t.id, t])), agent.id)
    return (
      <div className="cc-panel">
        <div className="cc-panel-tools">
          <span className="section-desc">
            {load.active.length + load.needsInput.length > 0 ? 'WORKING' : 'AVAILABLE'}
          </span>
          <button className="btn btn-small" onClick={onOpenBoard}>
            Open Board
          </button>
        </div>
        <span className="task-block-label">ACTIVE TASK</span>
        <div className="task-list">
          {load.active.length === 0 && load.needsInput.length === 0 && (
            <p className="cc-placeholder">No active task. Assign one from the board.</p>
          )}
          {[...load.active, ...load.needsInput].map((task) => (
            <button
              key={task.id}
              className={`task-item task-${task.status}`}
              onClick={() => {
                selectTask(task.id)
                onOpenBoard()
              }}
            >
              <span className="task-text">{task.title}</span>
              <span className={`status-badge task-status-${task.status}`}>{task.status}</span>
            </button>
          ))}
        </div>
        <span className="task-block-label">QUEUE ({load.queue.length})</span>
        <div className="task-list">
          {load.queue.length === 0 && <p className="cc-placeholder">Queue is empty.</p>}
          {load.queue.map((task) => (
            <button
              key={task.id}
              className="task-item task-todo"
              onClick={() => {
                selectTask(task.id)
                onOpenBoard()
              }}
            >
              <span className="task-text">{task.title}</span>
            </button>
          ))}
        </div>
        {load.history.length > 0 && (
          <>
            <span className="task-block-label">HISTORY ({load.history.length})</span>
            <div className="task-list">
              {load.history.slice(0, 8).map((task) => (
                <button
                  key={task.id}
                  className={`task-item task-${task.status}`}
                  onClick={() => {
                    selectTask(task.id)
                    onOpenBoard()
                  }}
                >
                  <span className="task-text">{task.title}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  const renderAskMe = (): React.JSX.Element => {
    const blocked = agents.filter((record) => record.id !== managerId && record.promptPending)
    return (
      <div className="cc-panel">
        <div className="cc-panel-tools">
          <span className="section-desc">{blocked.length} blocked</span>
        </div>
        {blocked.length === 0 && (
          <p className="cc-placeholder">
            No worker is blocked right now. Blocked workers show up here.
          </p>
        )}
        {blocked.map((worker) => (
          <div key={worker.id} className="askme-item">
            <WorkerAvatar record={worker} />
            <span className="monitor-name">{worker.name}</span>
            <span className="status-badge status-running">needs input</span>
            <button className="btn btn-small" onClick={() => requestFocus(worker.id)}>
              Open
            </button>
          </div>
        ))}
        <p className="cc-scaffold-hint">
          Answer here or via that worker's Messages tab.
        </p>
      </div>
    )
  }

  const renderCommands = (): React.JSX.Element => {
    return (
      <div className="cc-panel">
        <div className="commands-grid">
          {MANAGER_COMMANDS.map((command) => (
            <div key={command.id} className="command-card">
              <span className="command-card-name">{command.label}</span>
              <span className="command-card-hint">{command.hint}</span>
            </div>
          ))}
        </div>
        <p className="cc-scaffold-hint">
          Popular commands for this CLI. Sending to the manager session is not wired yet.
        </p>
      </div>
    )
  }

  const renderMemory = (): React.JSX.Element => {
    return (
      <MemoryPanel
        onOpenTask={(taskId) => {
          selectTask(taskId)
          onOpenBoard()
        }}
      />
    )
  }

  return (
    <div className="command-center">
      <div className="cc-header">
        <div className="cc-header-main">
          <MiniAvatar spec={avatar} scale={2} className="cc-avatar" />
          <div className="cc-header-meta">
            <div className="cc-header-row">
              <span className="cc-name">{agent.name}</span>
              <span className={`cc-role-badge ${isManager ? 'manager' : ''}`}>{agent.role}</span>
              {isManager && <span className="boss-badge">BOSS</span>}
              <span className={`status-badge status-${agent.status}`}>
                {isDraft ? 'Draft' : STATUS_LABELS[agent.status]}
              </span>
            </div>
            <p className="cc-description">{agent.description || 'No description set.'}</p>
            <span className="cc-engine">
              {agent.cliId ? cliLabel(agent.cliId, clis) : agent.provider ?? '—'}
              {agent.model ? ` · ${agent.model}` : ''}
              <span className="cc-engine-sep">·</span>
              {agent.projectPath ? basename(agent.projectPath) : 'no project'}
              {!isDraft && (
                <>
                  <span className="cc-engine-sep">·</span>uptime {formatUptime(agent.startedAt)}
                </>
              )}
            </span>
          </div>
          <div className="cc-header-actions">
            <button className="btn btn-small" onClick={beginEdit} title="Edit profile">
              ✎
            </button>
            {!isManager && (
              <button
                className="btn btn-small btn-danger"
                onClick={() => setConfirmDelete(true)}
                title="Delete coworker"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {editing && (
          <div className="cc-edit">
            <div className="field-row">
              <label className="field-label" htmlFor="cc-edit-name">
                Name
              </label>
              <input
                id="cc-edit-name"
                className="text-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="field-row">
              <label className="field-label" htmlFor="cc-edit-role">
                Role
              </label>
              <input
                id="cc-edit-role"
                className="text-input"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
              />
            </div>
            <div className="field-row">
              <label className="field-label" htmlFor="cc-edit-desc">
                Description
              </label>
              <textarea
                id="cc-edit-desc"
                className="text-input textarea"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={3}
              />
            </div>
            <div className="cc-actions">
              <button className="btn btn-primary" onClick={saveEdit}>
                Save
              </button>
              <button className="btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {confirmDelete && (
          <div className="cc-confirm">
            <p className="cc-confirm-text">
              Delete <strong>{agent.name}</strong>? Their session will be stopped. This cannot be
              undone.
            </p>
            <div className="cc-actions">
              <button className="btn btn-danger" onClick={deleteAgent}>
                Delete
              </button>
              <button className="btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="cc-tabs">
        {(isManager ? MANAGER_TABS : WORKER_TABS).map((entry) => (
          <button
            key={entry.id}
            className={`cc-tab ${tab === entry.id ? 'active' : ''}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="cc-content">{renderTab()}</div>

      {!isManager && (
        <div className="cc-message-bar">
          <button className="cc-message-tool" disabled title="Attach files (coming soon)">
            ATTACH
          </button>
          <input
            className="text-input cc-message-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                sendMessage()
              }
            }}
            placeholder="Message this coworker…"
          />
          <button className="cc-message-tool" disabled title="Voice mode (coming soon)">
            VOICE
          </button>
          <button className="btn btn-small" onClick={sendMessage} disabled={!draft.trim()}>
            Send
          </button>
        </div>
      )}
    </div>
  )
}

function WorkerAvatar({ record }: { record: OfficeAgentRecord }): React.JSX.Element {
  const avatar = useMemo(() => getAvatar(record.avatarId ?? '') ?? DEFAULT_COWORKER, [record])
  return <MiniAvatar spec={avatar} scale={1} className="cc-avatar" />
}

function workerStateLabel(record: OfficeAgentRecord): string {
  if (record.status === 'running' || record.status === 'starting') {
    return record.promptPending ? 'needs input' : 'working'
  }
  if (record.status === 'idle' || record.status === 'stopped' || record.status === 'completed') {
    return 'idle'
  }
  if (record.status === 'error') {
    return 'error'
  }
  return record.status
}

function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path
}

function cliLabel(cliId: string, clis: CliInfo[]): string {
  return clis.find((c) => c.id === cliId)?.name ?? cliId
}