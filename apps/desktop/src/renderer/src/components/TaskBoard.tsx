import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { MiniAvatar } from './MiniAvatar'
import { NewTaskModal } from './NewTaskModal'
import { TaskDetails } from './TaskDetails'
import { getAvatar, DEFAULT_COWORKER } from '../office/characters'
import { useOfficeStore } from '../office/store'
import { useTaskStore, dependenciesMet } from '../office/taskStore'
import type { TaskPriority, TaskRecord, TaskStatus } from '@shared/types'

interface TaskBoardProps {
  onOpenTerminal: (agentId: string) => void
}

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'ongoing', label: 'Ongoing' },
  { id: 'needs-input', label: 'Needs Input' },
  { id: 'done', label: 'Done' }
]

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent'
}

export function TaskBoard({ onOpenTerminal }: TaskBoardProps): React.JSX.Element {
  const tasks = useTaskStore(useShallow((s) => Object.values(s.tasks)))
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId)
  const selectTask = useTaskStore((s) => s.selectTask)
  const agents = useOfficeStore(useShallow((s) => Object.values(s.agents)))
  const [showNew, setShowNew] = useState(false)
  const [showFailed, setShowFailed] = useState(false)

  const agentById = useMemo(() => {
    const map: Record<string, { name: string; avatarId?: string; accent?: string }> = {}
    for (const agent of agents) {
      map[agent.id] = { name: agent.name, avatarId: agent.avatarId, accent: agent.accent }
    }
    return map
  }, [agents])

  if (selectedTaskId) {
    return (
      <TaskDetails
        taskId={selectedTaskId}
        onBack={() => selectTask(null)}
        onOpenTerminal={onOpenTerminal}
      />
    )
  }

  const failedCount = tasks.filter((t) => t.status === 'failed').length
  const visible = tasks.filter((t) => (t.status === 'failed' ? showFailed : true))

  return (
    <div className="task-board">
      <div className="task-board-header">
        <span className="task-board-title">TASK BOARD</span>
        <span className="section-desc">{tasks.length} tasks</span>
        <div className="task-board-actions">
          <button
            className={`btn btn-small ${showFailed ? 'btn-ghost' : ''}`}
            onClick={() => setShowFailed((prev) => !prev)}
            title="Show failed tasks"
          >
            Failed {failedCount > 0 ? `(${failedCount})` : ''}
          </button>
          <button className="btn btn-small btn-primary" onClick={() => setShowNew(true)}>
            + New Task
          </button>
        </div>
      </div>

      <div className="task-board-columns">
        {COLUMNS.map((column) => {
          const columnTasks = visible.filter((t) => t.status === column.id)
          return (
            <div
              key={column.id}
              className={`task-column task-column-${column.id} ${column.id === 'needs-input' && columnTasks.length > 0 ? 'attention' : ''}`}
            >
              <div className="task-column-header">
                <span className="task-column-label">{column.label}</span>
                <span className="task-column-count">{columnTasks.length}</span>
              </div>
              <div className="task-column-body">
                {columnTasks.length === 0 && (
                  <p className="task-column-empty">Nothing here.</p>
                )}
                {columnTasks.map((task) => (
                  <TaskCard key={task.id} task={task} agentById={agentById} tasks={tasks} />
                ))}
              </div>
            </div>
          )
        })}
        {showFailed && (
          <div className="task-column task-column-failed">
            <div className="task-column-header">
              <span className="task-column-label">Failed</span>
              <span className="task-column-count">{failedCount}</span>
            </div>
            <div className="task-column-body">
              {failedCount === 0 && <p className="task-column-empty">Nothing failed.</p>}
              {visible
                .filter((t) => t.status === 'failed')
                .map((task) => (
                  <TaskCard key={task.id} task={task} agentById={agentById} tasks={tasks} />
                ))}
            </div>
          </div>
        )}
      </div>

      {showNew && <NewTaskModal onClose={() => setShowNew(false)} />}
    </div>
  )
}

interface TaskCardProps {
  task: TaskRecord
  agentById: Record<string, { name: string; avatarId?: string; accent?: string }>
  tasks: TaskRecord[]
}

function TaskCard({ task, agentById, tasks }: TaskCardProps): React.JSX.Element {
  const selectTask = useTaskStore((s) => s.selectTask)
  const assignee = task.assignedAgentId ? agentById[task.assignedAgentId] : undefined
  const avatar = assignee ? getAvatar(assignee.avatarId ?? '') ?? DEFAULT_COWORKER : null
  const waitingDep = !dependenciesMet(task, Object.fromEntries(tasks.map((t) => [t.id, t])))
  const lastProgress = task.progress[task.progress.length - 1]

  return (
    <button
      className={`task-card task-card-${task.status}`}
      style={assignee?.accent ? { borderLeftColor: assignee.accent } : undefined}
      onClick={() => selectTask(task.id)}
      title={task.title}
    >
      <div className="task-card-title-row">
        <span className="task-card-title">{task.title}</span>
        <span className={`task-priority task-priority-${task.priority}`}>
          {PRIORITY_LABELS[task.priority]}
        </span>
      </div>

      <div className="task-card-meta">
        {avatar ? (
          <MiniAvatar spec={avatar} scale={1} className="task-card-avatar" />
        ) : (
          <span className="task-card-unassigned">Unassigned</span>
        )}
        <span className="task-card-project">
          {task.projectPath ? task.projectPath.split(/[/\\]/).filter(Boolean).pop() : 'no project'}
        </span>
      </div>

      {lastProgress && (
        <span className="task-card-progress">{lastProgress}</span>
      )}

      <div className="task-card-badges">
        {waitingDep && task.dependencies.length > 0 && (
          <span className="task-badge task-badge-dep" title="Waiting for dependencies">
            dep
          </span>
        )}
        {task.status === 'needs-input' && (
          <span className="task-badge task-badge-question" title="Needs input">
            ?
          </span>
        )}
        {task.subtasks.length > 0 && (
          <span className="task-badge" title={`${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length} subtasks`}>
            {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
          </span>
        )}
        <span className="task-badge" title="Created">
          {new Date(task.createdAt).toLocaleDateString()}
        </span>
        <span className="task-badge" title="Last activity">
          {new Date(task.updatedAt).toLocaleTimeString()}
        </span>
      </div>
    </button>
  )
}