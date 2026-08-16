import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useOfficeStore } from '../office/store'
import { useTaskStore } from '../office/taskStore'
import { agentIsBusy } from '@shared/rules/task'
import type { NewTaskInput, TaskAttachment, TaskPriority } from '@shared/types'

interface NewTaskModalProps {
  onClose: () => void
}

const PRIORITIES: { id: TaskPriority; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'urgent', label: 'Urgent' }
]

export function NewTaskModal({ onClose }: NewTaskModalProps): React.JSX.Element {
  const agents = useOfficeStore(useShallow((s) => Object.values(s.agents)))
  const managerId = useOfficeStore((s) => s.managerId)
  const projects = useOfficeStore((s) => s.projects)
  const tasks = useTaskStore(useShallow((s) => Object.values(s.tasks)))
  const createTask = useTaskStore((s) => s.createTask)

  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [projectPath, setProjectPath] = useState('')
  const [assignedAgentId, setAssignedAgentId] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [deadline, setDeadline] = useState('')
  const [attachments, setAttachments] = useState<TaskAttachment[]>([])
  const [dependencies, setDependencies] = useState<string[]>([])
  const [requirements, setRequirements] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const assignable = useMemo(
    () => agents.filter((a) => a.id !== managerId),
    [agents, managerId]
  )
  const candidateDeps = useMemo(
    () => tasks.filter((t) => t.status !== 'done' && t.id !== undefined).slice(0, 60),
    [tasks]
  )

  const assigneeBusy = assignedAgentId !== '' && agentIsBusy(
    Object.fromEntries(tasks.map((t) => [t.id, t])),
    assignedAgentId
  )

  const addAttachments = async (): Promise<void> => {
    const files = await window.workspace.selectFiles()
    if (!files) {
      return
    }
    setAttachments((prev) => [
      ...prev,
      ...files.map((path) => {
        const parts = path.split(/[/\\]/)
        return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: parts[parts.length - 1] ?? path, path, ts: Date.now() }
      })
    ])
  }

  const submit = async (): Promise<void> => {
    if (!title.trim()) {
      setError('Give the task a title.')
      return
    }
    if (!instructions.trim()) {
      setError('Write detailed instructions first.')
      return
    }
    setBusy(true)
    setError(null)
    const input: NewTaskInput = {
      title: title.trim(),
      instructions: instructions.trim(),
      projectPath: projectPath || undefined,
      assignedAgentId: assignedAgentId || undefined,
      priority,
      deadline: deadline ? new Date(deadline).getTime() : undefined,
      attachments,
      dependencies,
      requirements: requirements.trim() || undefined
    }
    const created = await createTask(input)
    setBusy(false)
    if (!created) {
      setError('Could not create the task.')
      return
    }
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card task-modal">
        <div className="modal-header">
          <h2>NEW TASK</h2>
          <button className="btn-icon" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <div className="setup-section task-modal-scroll">
          <label className="field-label" htmlFor="nt-title">
            Task title
          </label>
          <input
            id="nt-title"
            className="text-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Add password-reset page"
            autoFocus
          />

          <label className="field-label" htmlFor="nt-instructions">
            Detailed instructions
          </label>
          <textarea
            id="nt-instructions"
            className="text-input textarea"
            rows={5}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Explain what needs to be built and the expected outcome…"
          />

          <label className="field-label" htmlFor="nt-project">
            Project
          </label>
          <div className="field-row">
            <select
              id="nt-project"
              className="text-input select"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
            >
              <option value="">— none —</option>
              {projects.map((path) => (
                <option key={path} value={path}>
                  {path.split(/[/\\]/).filter(Boolean).pop() ?? path}
                </option>
              ))}
            </select>
            <button
              className="btn btn-small"
              onClick={async () => {
                const path = await window.workspace.selectProject()
                if (path) {
                  useOfficeStore.getState().addProject(path)
                  setProjectPath(path)
                }
              }}
            >
              Browse…
            </button>
          </div>

          <label className="field-label" htmlFor="nt-assignee">
            Assigned coworker
          </label>
          <select
            id="nt-assignee"
            className="text-input select"
            value={assignedAgentId}
            onChange={(e) => setAssignedAgentId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {assignable.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.role})
              </option>
            ))}
          </select>
          {assigneeBusy && (
            <span className="task-warn">
              This coworker already has an active task. The new task will be queued until they are
              free, or you can reassign it when starting.
            </span>
          )}

          <div className="field-row">
            <div className="task-field-half">
              <label className="field-label" htmlFor="nt-priority">
                Priority
              </label>
              <select
                id="nt-priority"
                className="text-input select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="task-field-half">
              <label className="field-label" htmlFor="nt-deadline">
                Deadline
              </label>
              <input
                id="nt-deadline"
                type="date"
                className="text-input"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>

          <div className="field-row">
            <label className="field-label" htmlFor="nt-attachments">
              Attachments ({attachments.length})
            </label>
            <button className="btn btn-small" onClick={addAttachments}>
              Add files…
            </button>
          </div>
          {attachments.length > 0 && (
            <div className="task-chip-list">
              {attachments.map((file) => (
                <span key={file.id} className="task-chip">
                  {file.name}
                  <button
                    className="btn-icon btn-icon-small"
                    onClick={() => setAttachments((prev) => prev.filter((f) => f.id !== file.id))}
                    title="Remove attachment"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {candidateDeps.length > 0 && (
            <>
              <span className="field-label">Dependencies</span>
              <div className="task-dep-list">
                {candidateDeps.map((task) => (
                  <label key={task.id} className="task-dep-item">
                    <input
                      type="checkbox"
                      checked={dependencies.includes(task.id)}
                      onChange={(e) => {
                        setDependencies((prev) =>
                          e.target.checked
                            ? [...prev, task.id]
                            : prev.filter((id) => id !== task.id)
                        )
                      }}
                    />
                    <span className={`task-dep-status task-dep-${task.status}`}>{task.status}</span>
                    <span className="task-dep-title">{task.title}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          <label className="field-label" htmlFor="nt-requirements">
            Completion requirements
          </label>
          <textarea
            id="nt-requirements"
            className="text-input textarea"
            rows={3}
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder="What counts as done? e.g. Page works, tests pass and changed files are reported."
          />

          {error && <span className="session-error">{error}</span>}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Creating…' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}