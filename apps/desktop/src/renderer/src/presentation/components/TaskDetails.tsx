import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { MiniAvatar } from './MiniAvatar'
import { CloseIcon } from './ChromeIcon'
import { getAvatar, DEFAULT_COWORKER } from '../scene/characters'
import { useOfficeStore } from '../../application/state/officeStore'
import { useTaskStore } from '../../application/state/taskStore'
import { startTask, completeTask, sendInstructions, answerQuestion } from '../../application/services/taskRunner'
import { dependenciesMet, agentIsBusy } from '@shared/rules/task'
import type { CompletionReport, TaskPriority, TaskRecord, TaskStatus } from '@shared/types'

interface ReportFormState {
  summary: string
  files: string
  commands: string
  tests: string
  concerns: string
  next: string
}

function toReportForm(report?: CompletionReport): ReportFormState {
  return {
    summary: report?.summary ?? '',
    files: report?.files.join(', ') ?? '',
    commands: report?.commands.join(', ') ?? '',
    tests: report?.tests ?? '',
    concerns: report?.concerns ?? '',
    next: report?.next.join(', ') ?? ''
  }
}

interface TaskDetailsProps {
  taskId: string
  onBack: () => void
  onOpenTerminal: (agentId: string) => void
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Todo',
  ongoing: 'Ongoing',
  'needs-input': 'Needs Input',
  done: 'Done',
  failed: 'Failed'
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent'
}

function formatTime(ts?: number): string {
  if (!ts) {
    return '—'
  }
  return new Date(ts).toLocaleString()
}

export function TaskDetails({
  taskId,
  onBack,
  onOpenTerminal
}: TaskDetailsProps): React.JSX.Element {
  const task = useTaskStore((s) => s.tasks[taskId])
  const tasks = useTaskStore(useShallow((s) => Object.values(s.tasks)))
  const selectTask = useTaskStore((s) => s.selectTask)
  const pauseTask = useTaskStore((s) => s.pauseTask)
  const cancelTask = useTaskStore((s) => s.cancelTask)
  const returnToTodo = useTaskStore((s) => s.returnToTodo)
  const assignTask = useTaskStore((s) => s.assignTask)

  const agents = useOfficeStore(useShallow((s) => Object.values(s.agents)))
  const managerId = useOfficeStore((s) => s.managerId)

  const [showDecision, setShowDecision] = useState(false)
  const [instructionText, setInstructionText] = useState('')
  const [answerText, setAnswerText] = useState('')
  const [showReportForm, setShowReportForm] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [reportForm, setReportForm] = useState<ReportFormState>(() =>
    toReportForm(task?.report)
  )

  const assignable = useMemo(() => agents.filter((a) => a.id !== managerId), [agents, managerId])
  const agent = task ? (task.assignedAgentId ? agents.find((a) => a.id === task.assignedAgentId) : undefined) : undefined

  if (!task) {
    return (
      <div className="task-details">
        <div className="cc-empty">
          <span className="cc-empty-glyph">∅</span>
          <p>Task not found.</p>
          <button className="btn btn-small" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    )
  }

  const blocked = task.status === 'needs-input' || !dependenciesMet(task, Object.fromEntries(tasks.map((t) => [t.id, t])))
  const openQuestion = task.questions.find((q) => q.answeredAt == null)
  const assigneeBusy = task.assignedAgentId
    ? agentIsBusy(Object.fromEntries(tasks.map((t) => [t.id, t])), task.assignedAgentId, task.id)
    : false
  const avatar = agent ? getAvatar(agent.avatarId ?? '') ?? DEFAULT_COWORKER : null
  const waitingDeps = task.dependencies
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is TaskRecord => t !== undefined && t.status !== 'done')

  const interruptAndStart = (): void => {
    const busyTask = tasks.find(
      (t) =>
        t.id !== task.id &&
        t.assignedAgentId === task.assignedAgentId &&
        (t.status === 'ongoing' || t.status === 'needs-input')
    )
    if (busyTask) {
      pauseTask(busyTask.id)
    }
    setShowDecision(false)
    startTask(task.id)
  }

  const doStart = (): void => {
    if (assigneeBusy) {
      setShowDecision(true)
      return
    }
    startTask(task.id)
  }

  const saveReport = (): void => {
    const done: CompletionReport = {
      summary: reportForm.summary.trim() || 'No summary provided.',
      files: reportForm.files.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
      commands: reportForm.commands.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
      tests: reportForm.tests.trim(),
      concerns: reportForm.concerns.trim(),
      next: reportForm.next.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
    }
    completeTask(task.id, done)
    setShowReportForm(false)
  }

  const submitAnswer = (): void => {
    const answer = answerText.trim()
    if (!answer || !openQuestion) {
      return
    }
    answerQuestion(task.id, openQuestion.id, answer)
    setAnswerText('')
  }

  return (
    <div className="task-details">
      <div className="task-details-header">
        <button className="btn btn-small" onClick={onBack} title="Back to board">
          ← Board
        </button>
        <div className="task-details-title-wrap">
          <span className="task-details-title">{task.title}</span>
          <span className={`status-badge task-status-${task.status}`}>
            {STATUS_LABELS[task.status]}
          </span>
          <span className={`task-priority task-priority-${task.priority}`}>
            {PRIORITY_LABELS[task.priority]}
          </span>
        </div>
        <button
          className="btn-icon"
          onClick={() => {
            useTaskStore.getState().removeTask(task.id)
            onBack()
          }}
          title="Delete task"
        >
          <CloseIcon className="icon-btn" />
        </button>
      </div>

      <div className="task-details-scroll">
        <section className="task-block">
          <span className="task-block-label">BRIEF</span>
          <p className="task-brief-text">{task.instructions}</p>
          {task.requirements && (
            <>
              <span className="task-block-sub">Completion requirements</span>
              <p className="task-brief-text">{task.requirements}</p>
            </>
          )}
          <div className="task-meta-grid">
            <span>Project</span>
            <code className="task-mono">
              {task.projectPath ? task.projectPath.split(/[/\\]/).filter(Boolean).pop() : '—'}
            </code>
            <span>Created</span>
            <code className="task-mono">{formatTime(task.createdAt)}</code>
            <span>Last activity</span>
            <code className="task-mono">{formatTime(task.updatedAt)}</code>
            <span>Deadline</span>
            <code className="task-mono">{task.deadline ? formatTime(task.deadline) : '—'}</code>
            <span>Subtasks</span>
            <code className="task-mono">{task.subtasks.length}</code>
          </div>
          {task.attachments.length > 0 && (
            <div className="task-chip-list">
              {task.attachments.map((file) => (
                <span key={file.id} className="task-chip">
                  {file.name}
                </span>
              ))}
            </div>
          )}
        </section>

        {waitingDeps.length > 0 && (
          <section className="task-block task-block-warn">
            <span className="task-block-label">WAITING FOR DEPENDENCY</span>
            {waitingDeps.map((dep) => (
              <button
                key={dep.id}
                className="task-dep-link"
                onClick={() => selectTask(dep.id)}
              >
                → {dep.title}
              </button>
            ))}
          </section>
        )}

        <section className="task-block">
          <span className="task-block-label">COWORKER</span>
          {agent ? (
            <div className="task-coworker">
              {avatar && <MiniAvatar spec={avatar} scale={2} className="task-avatar" />}
              <div className="task-coworker-meta">
                <span className="task-coworker-name">{agent.name}</span>
                <span className="task-coworker-role">{agent.role}</span>
                <span className="task-coworker-engine">
                  {agent.provider ?? '—'}
                  {agent.model ? ` · ${agent.model}` : ''} · {agent.status}
                </span>
              </div>
              <button
                className="btn btn-small"
                onClick={() => agent.id && onOpenTerminal(agent.id)}
                disabled={agent.cliId === ''}
                title={agent.cliId === '' ? 'Coworker has not started a session' : 'Open terminal'}
              >
                Open Terminal
              </button>
            </div>
          ) : (
            <p className="cc-placeholder">
              Unassigned. Pick a coworker to work on this task.
            </p>
          )}
          <div className="field-row task-reassign">
            <select
              className="text-input select"
              value={task.assignedAgentId ?? ''}
              onChange={(e) => assignTask(task.id, e.target.value || undefined)}
            >
              <option value="">Unassigned</option>
              {assignable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role})
                </option>
              ))}
            </select>
            <span className="section-desc">Reassign</span>
          </div>
        </section>

        {task.status === 'needs-input' && openQuestion && (
          <section className="task-block task-block-question">
            <span className="task-block-label">NEEDS INPUT</span>
            <p className="task-question-need">{openQuestion.need}</p>
            {openQuestion.why && (
              <p className="task-question-sub">
                <strong>Why:</strong> {openQuestion.why}
              </p>
            )}
            {openQuestion.consequence && (
              <p className="task-question-sub">
                <strong>If nothing happens:</strong> {openQuestion.consequence}
              </p>
            )}
            {openQuestion.choices && openQuestion.choices.length > 0 && (
              <div className="task-question-choices">
                {openQuestion.choices.map((choice) => (
                  <span key={choice} className="task-choice">
                    {choice}
                    {openQuestion.recommended === choice ? ' (recommended)' : ''}
                  </span>
                ))}
              </div>
            )}
            <div className="field-row">
              <input
                className="text-input"
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    submitAnswer()
                  }
                }}
                placeholder="Type your answer and press Enter…"
              />
              <button className="btn btn-primary" onClick={submitAnswer} disabled={!answerText.trim()}>
                Send Answer
              </button>
            </div>
          </section>
        )}

        {task.status === 'ongoing' && (
          <section className="task-block">
            <span className="task-block-label">PROGRESS</span>
            {task.progress.length === 0 ? (
              <p className="cc-placeholder">No progress reported yet. Watch the terminal for updates.</p>
            ) : (
              <ul className="task-progress-list">
                {task.progress.map((line, index) => (
                  <li key={index} className="task-progress-line">
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="task-block">
          <span className="task-block-label">ACTIVITY TIMELINE</span>
          <div className="task-timeline">
            {task.events.length === 0 && <p className="cc-placeholder">No events yet.</p>}
            {task.events.map((event) => (
              <div key={event.id} className={`task-event task-event-${event.type}`}>
                <span className="task-event-ts">{new Date(event.ts).toLocaleTimeString()}</span>
                <span className="task-event-type">{event.type}</span>
                <span className="task-event-text">{event.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="task-block">
          <span className="task-block-label">FILES CHANGED ({task.filesChanged.length})</span>
          {task.filesChanged.length === 0 ? (
            <p className="cc-placeholder">No files reported yet.</p>
          ) : (
            <div className="task-file-list">
              {task.filesChanged.map((file) => (
                <code key={file} className="task-file">
                  {file}
                </code>
              ))}
            </div>
          )}
        </section>

        <section className="task-block">
          <span className="task-block-label">COMPLETION REPORT</span>
          {task.report ? (
            <div className="task-report">
              <p className="task-brief-text">{task.report.summary}</p>
              {task.report.files.length > 0 && (
                <>
                  <span className="task-block-sub">Files changed</span>
                  <div className="task-file-list">
                    {task.report.files.map((file) => (
                      <code key={file} className="task-file">
                        {file}
                      </code>
                    ))}
                  </div>
                </>
              )}
              {task.report.commands.length > 0 && (
                <>
                  <span className="task-block-sub">Commands executed</span>
                  <div className="task-file-list">
                    {task.report.commands.map((command) => (
                      <code key={command} className="task-file">
                        {command}
                      </code>
                    ))}
                  </div>
                </>
              )}
              {task.report.tests && (
                <>
                  <span className="task-block-sub">Test results</span>
                  <p className="task-brief-text">{task.report.tests}</p>
                </>
              )}
              {task.report.concerns && (
                <>
                  <span className="task-block-sub">Remaining concerns</span>
                  <p className="task-brief-text">{task.report.concerns}</p>
                </>
              )}
              {task.report.next.length > 0 && (
                <>
                  <span className="task-block-sub">Suggested next steps</span>
                  <ul className="task-progress-list">
                    {task.report.next.map((step) => (
                      <li key={step} className="task-progress-line">
                        {step}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : task.status === 'done' ? (
            <p className="cc-placeholder">Completed without a written report.</p>
          ) : (
            <p className="cc-placeholder">The completion report appears here when the coworker finishes.</p>
          )}
        </section>

        {showReportForm && (
          <section className="task-block task-block-form">
            <span className="task-block-label">REPORT COMPLETION</span>
            <label className="field-label">Summary</label>
            <textarea
              className="text-input textarea"
              rows={3}
              value={reportForm.summary}
              onChange={(e) => setReportForm({ ...reportForm, summary: e.target.value })}
            />
            <label className="field-label">Files changed (comma separated)</label>
            <input
              className="text-input"
              value={reportForm.files}
              onChange={(e) => setReportForm({ ...reportForm, files: e.target.value })}
            />
            <label className="field-label">Commands executed (comma separated)</label>
            <input
              className="text-input"
              value={reportForm.commands}
              onChange={(e) => setReportForm({ ...reportForm, commands: e.target.value })}
            />
            <label className="field-label">Test results</label>
            <textarea
              className="text-input textarea"
              rows={2}
              value={reportForm.tests}
              onChange={(e) => setReportForm({ ...reportForm, tests: e.target.value })}
            />
            <label className="field-label">Remaining concerns</label>
            <textarea
              className="text-input textarea"
              rows={2}
              value={reportForm.concerns}
              onChange={(e) => setReportForm({ ...reportForm, concerns: e.target.value })}
            />
            <label className="field-label">Suggested next steps (comma separated)</label>
            <input
              className="text-input"
              value={reportForm.next}
              onChange={(e) => setReportForm({ ...reportForm, next: e.target.value })}
            />
            <div className="cc-actions">
              <button className="btn btn-primary" onClick={saveReport}>
                Complete Task
              </button>
              <button className="btn" onClick={() => setShowReportForm(false)}>
                Cancel
              </button>
            </div>
          </section>
        )}

        {showDecision && (
          <section className="task-block task-block-form task-block-warn">
            <span className="task-block-label">COWORKER IS BUSY</span>
            <p className="section-desc">
              {agent?.name} is already working. How do you want to assign this task?
            </p>
            <div className="cc-actions">
              <button className="btn" onClick={() => setShowDecision(false)}>
                Queue it
              </button>
              <button className="btn" onClick={() => setShowDecision(false)}>
                Assign to another
              </button>
              <button className="btn btn-danger" onClick={interruptAndStart}>
                Interrupt current task
              </button>
            </div>
          </section>
        )}

        <section className="task-block">
          <span className="task-block-label">CONTROLS</span>
          <div className="task-controls">
            {(task.status === 'todo' || task.status === 'failed') && (
              <button className="btn btn-primary" onClick={doStart} disabled={blocked && task.status === 'todo'}>
                {task.status === 'failed' ? 'Retry Task' : 'Start Task'}
              </button>
            )}
            {task.status === 'ongoing' && (
              <>
                <button className="btn" onClick={() => pauseTask(task.id)}>
                  Pause
                </button>
                <button className="btn" onClick={() => setShowReportForm(true)}>
                  Mark Complete
                </button>
              </>
            )}
            {task.status === 'done' && (
              <button className="btn" onClick={() => returnToTodo(task.id)}>
                Return to Todo
              </button>
            )}
            {agent && (
              <button
                className="btn"
                onClick={() => agent.id && onOpenTerminal(agent.id)}
                disabled={agent.cliId === ''}
              >
                Open Terminal
              </button>
            )}
            {task.status !== 'done' && task.status !== 'failed' && (
              <button className="btn btn-danger" onClick={() => setConfirmCancel(true)}>
                Cancel Task
              </button>
            )}
          </div>
          {task.status === 'ongoing' && agent && (
            <div className="field-row task-instructions">
              <input
                className="text-input"
                value={instructionText}
                onChange={(e) => setInstructionText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    sendInstructions(task.id, instructionText)
                    setInstructionText('')
                  }
                }}
                placeholder="Send additional instructions…"
              />
              <button
                className="btn btn-small"
                onClick={() => {
                  sendInstructions(task.id, instructionText)
                  setInstructionText('')
                }}
                disabled={!instructionText.trim()}
              >
                Send
              </button>
            </div>
          )}
        </section>

        {confirmCancel && (
          <section className="task-block task-block-form task-block-warn">
            <span className="task-block-label">CANCEL TASK?</span>
            <p className="section-desc">
              {task.title} will move to Failed and keep its history so it can be retried later.
            </p>
            <div className="cc-actions">
              <button
                className="btn btn-danger"
                onClick={() => {
                  cancelTask(task.id)
                  setConfirmCancel(false)
                }}
              >
                Cancel Task
              </button>
              <button className="btn" onClick={() => setConfirmCancel(false)}>
                Keep it
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}