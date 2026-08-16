import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { GoalPlan, GoalRecord, GoalTaskDraft, TaskPriority, TaskRecord } from '@shared/types'
import { useGoalStore } from '../office/goalStore'
import { useTaskStore, agentIsBusy } from '../office/taskStore'
import { useOfficeStore } from '../office/store'
import {
  applyPlanAndRun,
  replan,
  sendPlanningRequest,
  RETRY_LIMIT
} from '../office/goalEngine'
import { GoalInput } from './GoalInput'

interface GoalManagerProps {
  onOpenBoard: () => void
}

const STATUS_LABELS: Record<GoalRecord['status'], string> = {
  planning: 'Planning',
  'awaiting-approval': 'Awaiting approval',
  running: 'Running',
  'needs-input': 'Needs input',
  'partially-completed': 'Partially completed',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled'
}

function goalStatusKind(status: GoalRecord['status']): string {
  return status === 'completed'
    ? 'status-done'
    : status === 'failed' || status === 'cancelled'
      ? 'status-failed'
      : status === 'needs-input'
        ? 'status-needs-input'
        : status === 'awaiting-approval' || status === 'planning'
          ? 'status-todo'
          : 'status-ongoing'
}

function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path
}

function fmtDate(ts?: number): string {
  return ts ? new Date(ts).toLocaleString() : '—'
}

export function GoalManager({ onOpenBoard }: GoalManagerProps): React.JSX.Element {
  const [newGoalOpen, setNewGoalOpen] = useState(false)
  const [constraintDraft, setConstraintDraft] = useState('')
  const [confirmStop, setConfirmStop] = useState(false)

  const goals = useGoalStore(useShallow((s) => Object.values(s.goals)))
  const selectedId = useGoalStore((s) => s.selectedGoalId)
  const selectGoal = useGoalStore((s) => s.selectGoal)
  const updateGoal = useGoalStore((s) => s.updateGoal)
  const setStatus = useGoalStore((s) => s.setStatus)
  const answerGoalQuestion = useGoalStore((s) => s.answerQuestion)

  const tasks = useTaskStore(useShallow((s) => s.tasks))
  const answerTaskQuestion = useTaskStore((s) => s.answerQuestion)

  const workers = useOfficeStore(
    useShallow((s) => Object.values(s.agents).filter((a) => a.id !== s.managerId))
  )
  const manager = useOfficeStore((s) => (s.managerId ? s.agents[s.managerId] : undefined))
  const managerLive =
    !!manager && manager.cliId !== '' && (manager.status === 'running' || manager.status === 'starting')

  const sorted = [...goals].sort((a, b) => b.createdAt - a.createdAt)
  const goal = goals.find((g) => g.id === selectedId) ?? sorted[0]

  if (!goal) {
    return (
      <div className="cc-panel cc-panel-center">
        <div className="not-started">
          <span className="not-started-title">TEAM ORCHESTRATOR</span>
          <p className="section-desc">
            Give Michael one high-level goal. He plans the work, assigns suitable coworkers,
            monitors progress and reports back.
          </p>
          <div className="cc-actions">
            <button className="btn btn-primary" onClick={() => setNewGoalOpen(true)}>
              New Goal
            </button>
          </div>
        </div>
        {newGoalOpen && <GoalInput onClose={() => setNewGoalOpen(false)} />}
      </div>
    )
  }

  const child = goal.taskIds.map((id) => tasks[id]).filter((t): t is TaskRecord => Boolean(t))
  const doneCount = child.filter((t) => t.status === 'done').length
  const totalCount = child.length
  const progress = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100)
  const openQuestions = goal.questions.filter((q) => q.answeredAt == null)
  const needsInputTasks = child.filter((t) => t.status === 'needs-input')

  const patchPlan = (mutate: (plan: GoalPlan) => GoalPlan): void => {
    if (!goal.plan) {
      return
    }
    updateGoal(goal.id, { plan: mutate(goal.plan) })
  }

  const patchDraft = (draftId: string, changes: Partial<GoalTaskDraft>): void => {
    patchPlan((plan) => ({
      ...plan,
      tasks: plan.tasks.map((draft) => (draft.id === draftId ? { ...draft, ...changes } : draft))
    }))
  }

  const removeDraft = (draftId: string): void => {
    patchPlan((plan) => ({
      ...plan,
      tasks: plan.tasks
        .filter((draft) => draft.id !== draftId)
        .map((draft) => ({
          ...draft,
          dependencies: draft.dependencies.filter((dep) => dep !== draftId)
        }))
    }))
  }

  const addDraft = (): void => {
    patchPlan((plan) => {
      const id = `t${plan.tasks.length + 1}`
      return {
        ...plan,
        tasks: [
          ...plan.tasks,
          {
            id,
            title: '',
            instructions: '',
            dependencies: [],
            priority: 'medium'
          }
        ]
      }
    })
  }

  const stopGoal = (): void => {
    setStatus(goal.id, 'cancelled')
    for (const task of child) {
      if (task.status === 'todo' || task.status === 'ongoing' || task.status === 'needs-input') {
        useTaskStore.getState().cancelTask(task.id)
      }
    }
    setConfirmStop(false)
  }

  const submitConstraint = (): void => {
    const text = constraintDraft.trim()
    if (!text) {
      return
    }
    updateGoal(goal.id, { constraints: [...goal.constraints, text] })
    setConstraintDraft('')
  }

  const answerGoal = (questionId: number, answer: string): void => {
    answerGoalQuestion(goal.id, questionId, answer)
    const question = goal.questions.find((q) => q.id === questionId)
    if (question?.taskId) {
      const task = tasks[question.taskId]
      if (task?.assignedAgentId) {
        useTaskStore.getState().answerQuestionForAgent(task.assignedAgentId, answer)
      }
    }
  }

  return (
    <div className="cc-panel">
      <div className="cc-panel-tools goal-toolbar">
        <select
          className="text-input select goal-picker"
          value={goal.id}
          onChange={(e) => selectGoal(e.target.value)}
        >
          {sorted.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title || g.request.slice(0, 40)}
            </option>
          ))}
        </select>
        <button className="btn btn-primary btn-small" onClick={() => setNewGoalOpen(true)}>
          New Goal
        </button>
      </div>

      <div className="goal-header">
        <div className="goal-header-top">
          <span className="goal-title">{goal.title || 'Untitled goal'}</span>
          <span className={`status-badge ${goalStatusKind(goal.status)}`}>
            {STATUS_LABELS[goal.status]}
          </span>
        </div>
        <div className="goal-meta">
          <span>priority {goal.priority}</span>
          <span>{goal.approvalMode} mode</span>
          {goal.projectPath && <span>{basename(goal.projectPath)}</span>}
          {goal.deadline && <span>due {fmtDate(goal.deadline)}</span>}
          <span>created {fmtDate(goal.createdAt)}</span>
        </div>
        <pre className="goal-request">{goal.request}</pre>
        {totalCount > 0 && (
          <div className="goal-progress">
            <div className="goal-progress-bar">
              <div className="goal-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="goal-progress-label">
              {doneCount} of {totalCount} tasks done · {progress}% (estimate)
            </span>
          </div>
        )}
      </div>

      {goal.status === 'planning' && (
        <div className="goal-state-card">
          <span className="goal-state-glyph">◌</span>
          <p>
            Michael is analysing the goal and preparing a plan. He will propose tasks, dependencies,
            assignments and risks before any work starts.
          </p>
          {!managerLive && (
            <p className="session-error">
              Michael's terminal is not running. Start him, then request the plan again.
            </p>
          )}
          <div className="cc-actions">
            <button className="btn btn-small" onClick={() => sendPlanningRequest(goal.id)}>
              Request Plan
            </button>
            <button
              className="btn btn-small btn-danger"
              onClick={() => {
                setStatus(goal.id, 'cancelled')
              }}
            >
              Cancel Goal
            </button>
          </div>
        </div>
      )}

      {goal.status === 'awaiting-approval' && goal.plan && (
        <PlanReview
          goal={goal}
          workers={workers.map((w) => ({ id: w.id, name: w.name, busy: agentIsBusy(tasks, w.id) }))}
          constraintDraft={constraintDraft}
          onConstraintChange={setConstraintDraft}
          onConstraintSubmit={submitConstraint}
          onPatchDraft={patchDraft}
          onRemoveDraft={removeDraft}
          onAddDraft={addDraft}
          onApprove={() => void applyPlanAndRun(goal.id)}
          onReplan={() => replan(goal.id)}
          onCancel={() => setStatus(goal.id, 'cancelled')}
        />
      )}

      {(goal.status === 'running' ||
        goal.status === 'needs-input' ||
        goal.status === 'partially-completed') && (
        <GoalDashboard
          goal={goal}
          child={child}
          workers={workers}
          onOpenBoard={onOpenBoard}
          onReplan={() => replan(goal.id)}
          onStop={() => setConfirmStop(true)}
        />
      )}

      {goal.status === 'completed' && goal.report && <ReportView goal={goal} />}

      {(goal.status === 'failed' || goal.status === 'cancelled') && (
        <div className="goal-state-card">
          <span className="goal-state-glyph">{goal.status === 'failed' ? '✕' : '■'}</span>
          <p>
            {goal.status === 'failed'
              ? 'The goal failed. Review the failed tasks below or replan.'
              : 'The goal was cancelled. Completed tasks stay on the board.'}
          </p>
          <div className="cc-actions">
            <button className="btn btn-small" onClick={() => replan(goal.id)}>
              Replan
            </button>
            <button className="btn btn-small" onClick={() => setNewGoalOpen(true)}>
              New Goal
            </button>
          </div>
        </div>
      )}

      {(openQuestions.length > 0 || needsInputTasks.length > 0) && (
        <AskMeSection
          goal={goal}
          child={child}
          onAnswerTask={(taskId, questionId, answer) =>
            answerTaskQuestion(taskId, questionId, answer)
          }
          onAnswerGoal={(questionId, answer) => answerGoal(questionId, answer)}
        />
      )}

      {confirmStop && (
        <div className="goal-confirm">
          <p>
            Cancel goal <strong>{goal.title}</strong>? Unfinished tasks will be cancelled; completed
            work is kept.
          </p>
          <div className="cc-actions">
            <button className="btn btn-danger btn-small" onClick={stopGoal}>
              Cancel Goal
            </button>
            <button className="btn btn-small" onClick={() => setConfirmStop(false)}>
              Keep Running
            </button>
          </div>
        </div>
      )}

      {newGoalOpen && <GoalInput onClose={() => setNewGoalOpen(false)} />}
    </div>
  )
}

function PlanReview({
  goal,
  workers,
  constraintDraft,
  onConstraintChange,
  onConstraintSubmit,
  onPatchDraft,
  onRemoveDraft,
  onAddDraft,
  onApprove,
  onReplan,
  onCancel
}: {
  goal: GoalRecord
  workers: { id: string; name: string; busy: boolean }[]
  constraintDraft: string
  onConstraintChange: (value: string) => void
  onConstraintSubmit: () => void
  onPatchDraft: (draftId: string, changes: Partial<GoalTaskDraft>) => void
  onRemoveDraft: (draftId: string) => void
  onAddDraft: () => void
  onApprove: () => void
  onReplan: () => void
  onCancel: () => void
}): React.JSX.Element {
  const plan = goal.plan as GoalPlan
  return (
    <div className="goal-section">
      <div className="goal-section-title">MICHAEL'S PLAN</div>
      {plan.note && <p className="goal-note">{plan.note}</p>}

      <div className="goal-section-title small">UNDERSTANDING</div>
      <p className="goal-understanding">{plan.understanding}</p>

      <div className="goal-section-title small">
        PROPOSED TASKS ({plan.tasks.length}) — edit before approving
      </div>
      <div className="plan-task-list">
        {plan.tasks.length === 0 && (
          <p className="cc-placeholder">
            No tasks yet. Michael did not respond with a structured plan, or the plan was empty. Add
            tasks manually below.
          </p>
        )}
        {plan.tasks.map((draft, index) => (
          <div key={draft.id} className="plan-task">
            <div className="plan-task-head">
              <span className="plan-task-index">{index + 1}</span>
              <input
                className="text-input"
                value={draft.title}
                onChange={(e) => onPatchDraft(draft.id, { title: e.target.value })}
                placeholder="Task title"
              />
              <button
                className="btn-icon btn-icon-small"
                onClick={() => onRemoveDraft(draft.id)}
                title="Remove task"
              >
                ×
              </button>
            </div>
            <textarea
              className="text-input textarea plan-task-instructions"
              rows={2}
              value={draft.instructions}
              onChange={(e) => onPatchDraft(draft.id, { instructions: e.target.value })}
              placeholder="Brief for the coworker"
            />
            <div className="plan-task-foot">
              <select
                className="text-input select"
                value={draft.assignee ?? ''}
                onChange={(e) => onPatchDraft(draft.id, { assignee: e.target.value })}
              >
                <option value="">Michael picks</option>
                {workers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.name}
                    {worker.busy ? ' (busy)' : ''}
                  </option>
                ))}
              </select>
              <select
                className="text-input select"
                value={draft.priority}
                onChange={(e) => onPatchDraft(draft.id, { priority: e.target.value as TaskPriority })}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="urgent">urgent</option>
              </select>
            </div>
            {draft.assigneeReason && (
              <p className="plan-task-reason">{draft.assigneeReason}</p>
            )}
            {plan.tasks.length > 1 && (
              <div className="plan-task-deps">
                <span className="plan-task-deps-label">After:</span>
                {plan.tasks
                  .filter((other) => other.id !== draft.id)
                  .map((other) => (
                    <label key={other.id} className="goal-pref">
                      <input
                        type="checkbox"
                        checked={draft.dependencies.includes(other.id)}
                        onChange={() =>
                          onPatchDraft(draft.id, {
                            dependencies: draft.dependencies.includes(other.id)
                              ? draft.dependencies.filter((dep) => dep !== other.id)
                              : [...draft.dependencies, other.id]
                          })
                        }
                      />
                      {other.title || `Task ${other.id}`}
                    </label>
                  ))}
              </div>
            )}
          </div>
        ))}
        <button className="btn btn-small" onClick={onAddDraft}>
          + Add task
        </button>
      </div>

      {goal.questions.length > 0 && (
        <>
          <div className="goal-section-title small">QUESTIONS FOR YOU</div>
          <div className="askme-list">
            {goal.questions.map((q) => (
              <div key={q.id} className="askme-card">
                <span className="askme-question">{q.ask}</span>
                {q.why && <p className="askme-why">{q.why}</p>}
                {q.answer ? (
                  <p className="askme-answered">Answered: {q.answer}</p>
                ) : (
                  <p className="askme-waiting">
                    Unanswered — Michael waits for this before starting.
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="goal-section-title small">RISKS</div>
      <div className="plan-risk-list">
        {plan.risks.length === 0 && <p className="cc-placeholder">No risks identified.</p>}
        {plan.risks.map((risk, index) => (
          <div key={index} className="plan-risk-item">
            {risk}
          </div>
        ))}
      </div>

      <div className="goal-section-title small">COMPLETION CRITERIA</div>
      <p className="goal-criteria">{plan.completionCriteria}</p>

      <div className="goal-section-title small">CONSTRAINTS</div>
      <div className="goal-constraint-list">
        {goal.constraints.length === 0 && <p className="cc-placeholder">None added.</p>}
        {goal.constraints.map((constraint, index) => (
          <div key={index} className="plan-risk-item">
            {constraint}
          </div>
        ))}
      </div>
      <div className="field-row">
        <input
          className="text-input"
          value={constraintDraft}
          onChange={(e) => onConstraintChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onConstraintSubmit()
            }
          }}
          placeholder="Add a constraint…"
        />
        <button className="btn btn-small" onClick={onConstraintSubmit}>
          Add
        </button>
      </div>

      <div className="cc-actions goal-actions">
        <button className="btn btn-primary" onClick={onApprove} disabled={plan.tasks.length === 0}>
          Approve & Start
        </button>
        <button className="btn" onClick={onReplan}>
          Ask Michael to Replan
        </button>
        <button className="btn btn-danger" onClick={onCancel}>
          Cancel Goal
        </button>
      </div>
    </div>
  )
}

function GoalDashboard({
  goal,
  child,
  workers,
  onOpenBoard,
  onReplan,
  onStop
}: {
  goal: GoalRecord
  child: TaskRecord[]
  workers: { id: string; name: string; role: string; status: string }[]
  onOpenBoard: () => void
  onReplan: () => void
  onStop: () => void
}): React.JSX.Element {
  const tasks = useTaskStore.getState().tasks
  const running = child.filter((t) => t.status === 'ongoing')
  const waiting = child.filter(
    (t) => t.status === 'todo' && !t.dependencies.every((id) => tasks[id]?.status === 'done')
  )
  const queued = child.filter((t) => t.status === 'todo' && waiting.includes(t) === false)
  const done = child
    .filter((t) => t.status === 'done')
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
  const busyIds = new Set(
    child.filter((t) => t.status === 'ongoing').map((t) => t.assignedAgentId)
  )
  const busyWorkers = workers.filter((w) => busyIds.has(w.id))

  return (
    <div className="goal-section">
      <div className="dash-grid">
        <div className="dash-stat">
          <span className="dash-stat-value">{running.length}</span>
          <span className="dash-stat-label">RUNNING</span>
        </div>
        <div className="dash-stat">
          <span className="dash-stat-value">{queued.length}</span>
          <span className="dash-stat-label">READY TO START</span>
        </div>
        <div className="dash-stat">
          <span className="dash-stat-value">{waiting.length}</span>
          <span className="dash-stat-label">WAITING FOR DEPS</span>
        </div>
        <div className="dash-stat">
          <span className="dash-stat-value">{workers.length}</span>
          <span className="dash-stat-label">COWORKERS</span>
        </div>
        <div className="dash-stat">
          <span className="dash-stat-value">{busyWorkers.length}</span>
          <span className="dash-stat-label">BUSY</span>
        </div>
        <div className="dash-stat">
          <span className="dash-stat-value">{child.length - done.length}</span>
          <span className="dash-stat-label">REMAINING</span>
        </div>
      </div>
      <p className="cc-scaffold-hint">
        Remaining is a count, not an exact percentage — tasks vary in size.
      </p>

      <div className="goal-section-title small">RUNNING TASKS</div>
      <div className="task-list">
        {running.length === 0 && <p className="cc-placeholder">Nothing is running right now.</p>}
        {running.map((task) => (
          <TaskRow key={task.id} task={task} onOpenBoard={onOpenBoard} />
        ))}
      </div>

      <div className="goal-section-title small">READY TO START</div>
      <div className="task-list">
        {queued.length === 0 && <p className="cc-placeholder">No queued work.</p>}
        {queued.map((task) => (
          <TaskRow key={task.id} task={task} onOpenBoard={onOpenBoard} />
        ))}
      </div>

      <div className="goal-section-title small">WAITING FOR DEPENDENCIES</div>
      <div className="task-list">
        {waiting.length === 0 && <p className="cc-placeholder">No blocked tasks.</p>}
        {waiting.map((task) => (
          <TaskRow key={task.id} task={task} onOpenBoard={onOpenBoard} />
        ))}
      </div>

      {goal.retries.length > 0 && (
        <>
          <div className="goal-section-title small">RETRY HISTORY ({goal.retries.length})</div>
          <div className="retry-list">
            {goal.retries.map((retry) => (
              <div key={retry.id} className="retry-item">
                <span className="retry-action">{retry.action}</span>
                <span className="retry-note">{retry.note}</span>
                <span className="retry-ts">{fmtDate(retry.ts)}</span>
              </div>
            ))}
            <p className="cc-scaffold-hint">Retries stop after {RETRY_LIMIT} per task.</p>
          </div>
        </>
      )}

      <div className="goal-section-title small">RECENT COMPLETIONS</div>
      <div className="task-list">
        {done.length === 0 && <p className="cc-placeholder">No completions yet.</p>}
        {done.slice(0, 5).map((task) => (
          <TaskRow key={task.id} task={task} onOpenBoard={onOpenBoard} />
        ))}
      </div>

      <div className="cc-actions goal-actions">
        <button className="btn btn-primary btn-small" onClick={onOpenBoard}>
          Open Task Board
        </button>
        <button className="btn btn-small" onClick={onReplan}>
          Replan
        </button>
        <button className="btn btn-small btn-danger" onClick={onStop}>
          Stop Goal
        </button>
      </div>
    </div>
  )
}

function TaskRow({ task, onOpenBoard }: { task: TaskRecord; onOpenBoard: () => void }): React.JSX.Element {
  const selectTask = useTaskStore((s) => s.selectTask)
  return (
    <button
      className={`task-item task-${task.status}`}
      onClick={() => {
        selectTask(task.id)
        onOpenBoard()
      }}
    >
      <span className="task-text">{task.title}</span>
      <span className={`status-badge task-status-${task.status}`}>{task.status}</span>
    </button>
  )
}

function AskMeSection({
  goal,
  child,
  onAnswerTask,
  onAnswerGoal
}: {
  goal: GoalRecord
  child: TaskRecord[]
  onAnswerTask: (taskId: string, questionId: number, answer: string) => void
  onAnswerGoal: (questionId: number, answer: string) => void
}): React.JSX.Element {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const setAnswer = (key: string, value: string): void =>
    setAnswers((prev) => ({ ...prev, [key]: value }))

  const taskQuestions = child
    .filter((t) => t.status === 'needs-input')
    .flatMap((t) =>
      t.questions
        .filter((q) => q.answeredAt == null)
        .map((q) => ({
          key: `task-${t.id}-${q.id}`,
          task: t,
          questionId: q.id,
          need: q.need,
          why: q.why,
          choices: q.choices,
          recommended: q.recommended,
          consequence: q.consequence
        }))
    )
  const goalQuestions = goal.questions
    .filter((q) => q.answeredAt == null)
    .map((q) => ({
      key: `goal-${q.id}`,
      goal: q,
      questionId: q.id,
      need: q.ask,
      why: q.why,
      choices: q.options,
      recommended: q.recommendation,
      consequence: q.consequences
    }))

  const cards = [...taskQuestions, ...goalQuestions]
  if (cards.length === 0) {
    return <></>
  }

  return (
    <div className="goal-section">
      <div className="goal-section-title">ASK ME ({cards.length})</div>
      <div className="askme-list">
        {cards.map((card) => (
          <div key={card.key} className="askme-card">
            <span className="askme-question">{card.need}</span>
            {card.why && <p className="askme-why">{card.why}</p>}
            {'task' in card && card.task && (
              <p className="askme-task">
                Task: <strong>{card.task.title}</strong>
              </p>
            )}
            {card.choices && card.choices.length > 0 && (
              <div className="askme-options">
                {card.choices.map((choice, index) => (
                  <button
                    key={index}
                    className="btn btn-small askme-option"
                    onClick={() => setAnswer(card.key, choice)}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            )}
            {card.recommended && (
              <p className="askme-recommended">Michael recommends: {card.recommended}</p>
            )}
            {card.consequence && <p className="askme-consequence">{card.consequence}</p>}
            <div className="field-row">
              <input
                className="text-input"
                value={answers[card.key] ?? ''}
                onChange={(e) => setAnswer(card.key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (answers[card.key] ?? '').trim()) {
                    if ('goal' in card) {
                      onAnswerGoal(card.questionId, answers[card.key].trim())
                    } else if ('task' in card) {
                      onAnswerTask(card.task.id, card.questionId, answers[card.key].trim())
                    }
                    setAnswer(card.key, '')
                  }
                }}
                placeholder="Your decision…"
              />
              <button
                className="btn btn-small btn-primary"
                disabled={!(answers[card.key] ?? '').trim()}
                onClick={() => {
                  if ('goal' in card) {
                    onAnswerGoal(card.questionId, answers[card.key].trim())
                  } else if ('task' in card) {
                    onAnswerTask(card.task.id, card.questionId, answers[card.key].trim())
                  }
                  setAnswer(card.key, '')
                }}
              >
                Answer
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReportView({ goal }: { goal: GoalRecord }): React.JSX.Element {
  const report = goal.report
  if (!report) {
    return (
      <div className="goal-state-card">
        <span className="goal-state-glyph">✓</span>
        <p>All tasks are done. A report will be generated.</p>
      </div>
    )
  }
  return (
    <div className="goal-section">
      <div className="goal-section-title">FINAL GOAL REPORT</div>
      <p className="goal-report-summary">{report.summary}</p>
      <ReportBlock label="WHAT THE TEAM ACCOMPLISHED">
        <pre className="report-pre">{report.summary}</pre>
      </ReportBlock>
      <ReportBlock label="COWORKERS INVOLVED">
        <pre className="report-pre">{report.workers.join(', ') || 'None'}</pre>
      </ReportBlock>
      <ReportBlock label="TASKS COMPLETED">
        <pre className="report-pre">{report.tasks.join('\n') || 'None'}</pre>
      </ReportBlock>
      <ReportBlock label="FILES CHANGED">
        <pre className="report-pre">{report.files.join('\n') || 'None recorded'}</pre>
      </ReportBlock>
      <ReportBlock label="TESTS & VERIFICATION">
        <pre className="report-pre">{report.verification || 'None recorded'}</pre>
      </ReportBlock>
      <ReportBlock label="DECISIONS">
        <pre className="report-pre">{report.decisions.join('\n') || 'None'}</pre>
      </ReportBlock>
      <ReportBlock label="USER APPROVALS">
        <pre className="report-pre">{report.approvals.join('\n') || 'None'}</pre>
      </ReportBlock>
      <ReportBlock label="KNOWN LIMITATIONS">
        <pre className="report-pre">{report.limitations || 'None'}</pre>
      </ReportBlock>
      <ReportBlock label="REMAINING RISKS">
        <pre className="report-pre">{report.risks.join('\n') || 'None'}</pre>
      </ReportBlock>
      <ReportBlock label="RECOMMENDED NEXT STEPS">
        <pre className="report-pre">{report.next.join('\n') || 'None'}</pre>
      </ReportBlock>
      <p className="cc-scaffold-hint">
        Evidence lives in the individual task cards and terminal sessions.
      </p>
    </div>
  )
}

function ReportBlock({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="goal-section-title small">
      {label}
      {children}
    </div>
  )
}