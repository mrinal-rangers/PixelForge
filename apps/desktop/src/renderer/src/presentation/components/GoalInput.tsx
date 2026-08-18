import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { GoalApprovalMode, TaskAttachment, TaskPriority } from '@shared/types'
import { useGoalStore } from '../../application/state/goalStore'
import { useOfficeStore } from '../../application/state/officeStore'
import { sendPlanningRequest } from '../../application/services/goalEngine'
import { CloseIcon } from './ChromeIcon'

interface GoalInputProps {
  onClose: () => void
}

function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path
}

export function GoalInput({ onClose }: GoalInputProps): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [request, setRequest] = useState('')
  const [expectedOutcome, setExpectedOutcome] = useState('')
  const [projectPath, setProjectPath] = useState<string | undefined>(undefined)
  const [constraints, setConstraints] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [deadline, setDeadline] = useState('')
  const [budget, setBudget] = useState('')
  const [attachments, setAttachments] = useState<TaskAttachment[]>([])
  const [preferred, setPreferred] = useState<string[]>([])
  const [completionRequirements, setCompletionRequirements] = useState('')
  const [approvalMode, setApprovalMode] = useState<GoalApprovalMode>('supervised')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const workers = useOfficeStore(
    useShallow((s) => Object.values(s.agents).filter((a) => a.id !== s.managerId))
  )
  const createGoal = useGoalStore((s) => s.createGoal)

  const addAttachments = async (): Promise<void> => {
    const files = await window.workspace.selectFiles()
    if (!files) {
      return
    }
    const now = Date.now()
    setAttachments((prev) => [
      ...prev,
      ...files.map((path, index) => ({ id: `a${now}-${index}`, name: basename(path), path, ts: now }))
    ])
  }

  const submit = async (): Promise<void> => {
    const trimmedTitle = title.trim()
    const trimmedRequest = request.trim()
    if (!trimmedTitle && !trimmedRequest) {
      setError('Describe what the team should accomplish.')
      return
    }
    if (!trimmedTitle) {
      setTitle(trimmedRequest.slice(0, 60))
    }
    setBusy(true)
    setError(null)
    const created = await createGoal({
      title: trimmedTitle || trimmedRequest.slice(0, 60),
      request: trimmedRequest,
      expectedOutcome: expectedOutcome.trim() || undefined,
      projectPath,
      constraints: constraints
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      priority,
      deadline: deadline ? new Date(deadline).getTime() : undefined,
      budget: budget.trim() ? Number(budget.trim()) : undefined,
      attachments,
      preferredCoworkers: preferred.length > 0 ? preferred : undefined,
      completionRequirements: completionRequirements.trim() || undefined,
      approvalMode
    })
    setBusy(false)
    if (!created) {
      setError('Could not create the goal.')
      return
    }
    sendPlanningRequest(created.id)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card goal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>NEW GOAL</h2>
          <button className="btn-icon" onClick={onClose} title="Close">
            <CloseIcon className="icon-btn" />
          </button>
        </div>
        <div className="task-modal-scroll goal-modal-scroll">
          <div className="field-row">
            <label className="field-label" htmlFor="goal-title">
              What should the team accomplish?
            </label>
            <input
              id="goal-title"
              className="text-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Review our authentication system, fix the password-reset flow…"
            />
          </div>

          <div className="field-row">
            <label className="field-label" htmlFor="goal-request">
              Goal detail
            </label>
            <textarea
              id="goal-request"
              className="text-input textarea"
              rows={4}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="Describe the outcome you want. Michael decides how many tasks and coworkers are needed."
            />
          </div>

          <div className="field-row">
            <span className="field-label">Project</span>
            <div className="field-inline">
              <code className="field-value" title={projectPath}>
                {projectPath ? basename(projectPath) : 'No project selected'}
              </code>
              <button
                className="btn btn-small"
                onClick={async () => {
                  const path = await window.workspace.selectProject()
                  if (path) {
                    setProjectPath(path)
                    useOfficeStore.getState().addProject(path)
                  }
                }}
              >
                Choose
              </button>
            </div>
          </div>

          <div className="field-row">
            <label className="field-label" htmlFor="goal-outcome">
              Expected outcome
            </label>
            <input
              id="goal-outcome"
              className="text-input"
              value={expectedOutcome}
              onChange={(e) => setExpectedOutcome(e.target.value)}
              placeholder="e.g. Password reset works end-to-end, covered by tests and docs"
            />
          </div>

          <div className="field-row">
            <label className="field-label" htmlFor="goal-constraints">
              Constraints (one per line)
            </label>
            <textarea
              id="goal-constraints"
              className="text-input textarea"
              rows={2}
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              placeholder={'Do not touch the database schema\nKeep changes backward compatible'}
            />
          </div>

          <div className="field-row field-grid-3">
            <div className="field-sub">
              <label className="field-label" htmlFor="goal-priority">
                Priority
              </label>
              <select
                id="goal-priority"
                className="text-input select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="field-sub">
              <label className="field-label" htmlFor="goal-deadline">
                Deadline
              </label>
              <input
                id="goal-deadline"
                className="text-input"
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
            <div className="field-sub">
              <label className="field-label" htmlFor="goal-budget">
                Budget ($)
              </label>
              <input
                id="goal-budget"
                className="text-input"
                type="number"
                min="0"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="optional"
              />
            </div>
          </div>

          <div className="field-row">
            <span className="field-label">Attachments</span>
            <div className="field-inline">
              <button className="btn btn-small" onClick={addAttachments}>
                Attach Files
              </button>
            </div>
            {attachments.length > 0 && (
              <div className="chip-list">
                {attachments.map((file) => (
                  <span key={file.id} className="chip">
                    {file.name}
                    <button
                      className="chip-x"
                      onClick={() =>
                        setAttachments((prev) => prev.filter((f) => f.id !== file.id))
                      }
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {workers.length > 0 && (
            <div className="field-row">
              <span className="field-label">Preferred coworkers</span>
              <div className="goal-pref-row">
                {workers.map((worker) => (
                  <label key={worker.id} className="goal-pref">
                    <input
                      type="checkbox"
                      checked={preferred.includes(worker.name)}
                      onChange={() =>
                        setPreferred((prev) =>
                          prev.includes(worker.name)
                            ? prev.filter((n) => n !== worker.name)
                            : [...prev, worker.name]
                        )
                      }
                    />
                    {worker.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="field-row">
            <label className="field-label" htmlFor="goal-completion">
              Completion requirements
            </label>
            <textarea
              id="goal-completion"
              className="text-input textarea"
              rows={2}
              value={completionRequirements}
              onChange={(e) => setCompletionRequirements(e.target.value)}
              placeholder="What must be true before the goal counts as finished"
            />
          </div>

          <div className="field-row">
            <span className="field-label">Operating mode</span>
            <div className="mode-toggle">
              <button
                className={`mode-toggle-btn ${approvalMode === 'supervised' ? 'active' : ''}`}
                onClick={() => setApprovalMode('supervised')}
                title="Michael presents the plan for approval before starting"
              >
                Supervised
              </button>
              <button
                className={`mode-toggle-btn ${approvalMode === 'auto' ? 'active' : ''}`}
                onClick={() => setApprovalMode('auto')}
                title="Ordinary plans start automatically. Consequential decisions still stop for you."
              >
                Auto
              </button>
            </div>
          </div>

          {error && <span className="session-error">{error}</span>}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void submit()}
            disabled={busy || (!title.trim() && !request.trim())}
          >
            {busy ? 'Creating…' : 'Send to Michael'}
          </button>
        </div>
      </div>
    </div>
  )
}