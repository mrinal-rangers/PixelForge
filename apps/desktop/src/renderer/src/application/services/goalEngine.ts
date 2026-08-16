import type { GoalRecord, GoalReport, TaskRecord } from '@shared/types'
import { dependenciesMet, agentIsBusy } from '@shared/rules/task'
import { rankMemories, sourceLabel } from '@shared/rules/memory'
import { useGoalStore } from '../state/goalStore'
import { useTaskStore } from '../state/taskStore'
import { useOfficeStore } from '../state/officeStore'
import type { OfficeAgentRecord } from '../state/officeStore'
import { useMemoryStore } from '../state/memoryStore'
import { expireGoalMemory } from './memoryEngine'
import { startTask } from './taskRunner'

/**
 * Deterministic team orchestration for goals.
 *
 * Michael proposes structured actions (a plan) and the app validates and
 * applies them here. Once a goal is approved, this engine owns dispatch:
 * it creates the child tasks, assigns each ready task to a suitable
 * available coworker, starts work only when dependencies are met and the
 * terminal is live, retries failed work up to a limit, unlocks dependents
 * automatically, and produces the final goal report.
 */

export const RETRY_LIMIT = 2

let dispatchTimer: ReturnType<typeof setTimeout> | null = null

function agents(): Record<string, OfficeAgentRecord> {
  return useOfficeStore.getState().agents
}

function managerId(): string | null {
  return useOfficeStore.getState().managerId
}

function managerLive(): boolean {
  const id = managerId()
  if (!id) {
    return false
  }
  const agent = agents()[id]
  return !!agent && agent.cliId !== '' && (agent.status === 'running' || agent.status === 'starting')
}

function agentLive(agent: { cliId: string; status: string } | undefined): boolean {
  return !!agent && agent.cliId !== '' && (agent.status === 'running' || agent.status === 'starting')
}

export function planningBrief(goal: GoalRecord): string {
  const team = Object.values(agents())
    .filter((record) => record.id !== managerId() && record.cliId !== '')
    .map(
      (record) =>
        `- ${record.name} (${record.role}) · ${record.model ?? record.provider ?? 'unknown'} · ${record.projectPath ? basename(record.projectPath) : 'no project'} · ${agentLive(record) ? 'available' : record.status}`
    )
    .join('\n')
  const goalStatuses = Object.values(useGoalStore.getState().goals).map((g) => ({
    id: g.id,
    status: g.status
  }))
  const memories = rankMemories(
    Object.values(useMemoryStore.getState().memories),
    { title: goal.title, instructions: goal.request, projectPath: goal.projectPath },
    undefined,
    goalStatuses
  )
  const memoryBlock =
    memories.length > 0
      ? [
          '',
          '## Relevant project memory (from the shared archive)',
          ...memories.map((memory) => {
            const snippet = memory.content
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .slice(0, 2)
              .join(' ')
            return `- [${memory.title}] (${memory.type} · ${sourceLabel(memory.source)} · ${new Date(memory.createdAt).toLocaleDateString()})\n  ${snippet}`
          })
        ]
      : []
  return [
    'You are Michael, the team orchestrator for PixelForge.',
    'A user has given the team a goal. Produce a structured execution plan ONLY. Do not edit code or start work.',
    '',
    `Goal id: ${goal.id}`,
    `Goal: ${goal.title}`,
    `Request: ${goal.request}`,
    goal.expectedOutcome ? `Expected outcome: ${goal.expectedOutcome}` : '',
    goal.projectPath ? `Project: ${goal.projectPath}` : '',
    goal.constraints.length > 0 ? `Constraints:\n${goal.constraints.map((c) => `- ${c}`).join('\n')}` : '',
    goal.completionRequirements ? `Completion requirements:\n${goal.completionRequirements}` : '',
    goal.preferredCoworkers && goal.preferredCoworkers.length > 0
      ? `Preferred coworkers: ${goal.preferredCoworkers.join(', ')}`
      : '',
    goal.deadline ? `Deadline: ${new Date(goal.deadline).toLocaleString()}` : '',
    `Priority: ${goal.priority}`,
    goal.budget ? `Budget: $${goal.budget}` : '',
    '',
    team.length > 0 ? `Available coworkers (choose the cheapest suitable one for each task):\n${team}` : '',
    ...memoryBlock,
    '',
    'Reply with exactly one JSON payload on a single line, prefixed with the marker @pixelforge/plan. Schema:',
    '{"goal":"<goal id>","understanding":"<what the user wants in 1-2 sentences>","tasks":[{"title":"<task title>","instructions":"<clear, self-contained brief for the coworker>","assignee":"<coworker name or empty>","reason":"<why this coworker>","dependencies":["<titles of tasks that must finish first>"],"priority":"low|medium|high|urgent"}],"risks":["<missing info, destructive actions, external services, unclear requirements>"],"completionCriteria":"<what must be true for the goal to be finished>"}',
    '',
    'Rules:',
    '- Break the goal into small, independently executable tasks.',
    '- Set only real dependencies; keep unrelated tasks parallel.',
    '- Assign the cheapest suitable coworker, never the most powerful model by default.',
    '- Prefer empty assignee when the choice is obvious; Michael will pick at dispatch time.',
    '- Use the exact coworker names listed above.',
    '- No prose outside the JSON. Output only the marker line.'
  ]
    .filter((line) => line.length > 0)
    .join('\n')
}

export function sendPlanningRequest(goalId: string): boolean {
  const goal = useGoalStore.getState().goals[goalId]
  if (!goal || !managerLive()) {
    return false
  }
  const id = managerId()
  if (!id) {
    return false
  }
  window.workspace.sendInput(id, planningBrief(goal) + '\r')
  useOfficeStore.getState().recordInput(id)
  return true
}

function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path
}

function resolveAssignee(name: string, excludeId?: string): string | undefined {
  const team = Object.values(agents())
    .filter((record) => record.id !== managerId())
    .filter((record) => !excludeId || record.id !== excludeId)
  const needle = name.trim().toLowerCase()
  const direct = team.find((record) => record.id === name || record.name === name)
  if (direct) {
    return direct.id
  }
  return team.find((record) => record.name.toLowerCase().includes(needle) || needle.includes(record.name.toLowerCase()))?.id
}

function roleScore(agent: { role: string; name: string }, task: TaskRecord): number {
  const text = `${task.title} ${task.instructions}`.toLowerCase()
  const role = `${agent.role} ${agent.name}`.toLowerCase()
  let score = 0
  if (/doc|readme|documentation|write-?up|changelog/.test(text) && /doc|writer|write/.test(role)) {
    score += 3
  }
  if (/test|qa|coverage|spec/.test(text) && /test|qa/.test(role)) {
    score += 3
  }
  if (/review|audit|inspect|check/.test(text) && /review|audit|security|analyst/.test(role)) {
    score += 3
  }
  if (/research|investigate|compare|evaluate/.test(text) && /research|analyst/.test(role)) {
    score += 3
  }
  if (/develop|implement|fix|build|refactor|engineer/.test(role)) {
    score += 1
  }
  return score
}

/** Cheap models for simple, read-mostly work. */
function isExpensiveModel(model: string | undefined): boolean {
  if (!model) {
    return false
  }
  const lower = model.toLowerCase()
  return /opus|pro|sonnet|flash-?thinking|gpt-5|claude-3-7/.test(lower)
}

function pickCoworker(
  task: TaskRecord,
  excludeId?: string
): string | undefined {
  const team = Object.values(agents()).filter(
    (record) =>
      record.id !== managerId() &&
      (!excludeId || record.id !== excludeId) &&
      agentLive(record)
  )
  const tasks = useTaskStore.getState().tasks
  const candidates = team.filter((record) => !agentIsBusy(tasks, record.id))
  const pool = candidates.length > 0 ? candidates : team
  if (pool.length === 0) {
    return undefined
  }
  let best: string | undefined
  let bestScore = -Infinity
  for (const record of pool) {
    let score = roleScore(record, task)
    if (record.projectPath && task.projectPath && record.projectPath === task.projectPath) {
      score += 2
    }
    if (!record.projectPath && !task.projectPath) {
      score += 1
    }
    const simple = /doc|inspect|review|readme|lint|format|test/.test(
      `${task.title} ${task.instructions}`.toLowerCase()
    )
    if (simple && !isExpensiveModel(record.model)) {
      score += 2
    }
    if (best === undefined || score > bestScore) {
      best = record.id
      bestScore = score
    }
  }
  return best
}

function buildReport(goal: GoalRecord, child: TaskRecord[]): GoalReport {
  const done = child.filter((t) => t.status === 'done')
  const team = agents()
  return {
    summary:
      done.length > 0
        ? `The team completed the goal "${goal.title}" with ${done.length} task${done.length === 1 ? '' : 's'} verified.`
        : 'The goal could not be completed.',
    workers: [...new Set(done.map((t) => team[t.assignedAgentId ?? '']?.name ?? 'Unknown').filter(Boolean))],
    tasks: done.map((t) => `- ${t.title}`),
    files: [...new Set(done.flatMap((t) => t.filesChanged))],
    verification: done.map((t) => t.report?.tests ?? '').filter(Boolean).join('\n'),
    decisions: goal.questions
      .filter((q) => q.answer)
      .map((q) => `${q.ask} → ${q.answer}`),
    approvals: [
      `Plan approved (${goal.approvalMode} mode)`,
      ...goal.questions.filter((q) => q.answer).map(() => 'User answered a question')
    ],
    limitations:
      done.map((t) => t.report?.concerns ?? '').filter(Boolean).join('\n') || 'None reported.',
    risks: goal.plan?.risks ?? [],
    next: [...new Set(done.flatMap((t) => t.report?.next ?? []))]
  }
}

async function createChildTasks(goal: GoalRecord): Promise<string[]> {
  const store = useTaskStore.getState()
  const plan = goal.plan
  if (!plan) {
    return goal.taskIds
  }
  const existing = goal.taskIds.map((id) => store.tasks[id]).filter(Boolean)
  const doneByTitle = new Map<string, string>()
  for (const task of existing) {
    if (task.status === 'done') {
      doneByTitle.set(task.title.toLowerCase(), task.id)
    }
  }
  const cancelled: string[] = []
  for (const task of existing) {
    if (task.status !== 'done') {
      cancelled.push(task.id)
    }
  }

  const created = new Map<string, string>()
  const result: string[] = []

  for (const draft of plan.tasks) {
    const reuse = doneByTitle.get(draft.title.toLowerCase())
    if (reuse) {
      created.set(draft.id, reuse)
      if (!result.includes(reuse)) {
        result.push(reuse)
      }
      continue
    }
    const assignee = draft.assignee ? resolveAssignee(draft.assignee) : undefined
    const record = await store.createTask({
      title: draft.title,
      instructions: draft.instructions,
      projectPath: goal.projectPath,
      assignedAgentId: assignee,
      priority: draft.priority,
      attachments: goal.attachments,
      dependencies: draft.dependencies
        .map((dep) => created.get(dep))
        .filter((dep): dep is string => Boolean(dep)),
      requirements: goal.completionRequirements ?? goal.expectedOutcome
    })
    if (record) {
      created.set(draft.id, record.id)
      result.push(record.id)
    }
  }

  for (const taskId of cancelled) {
    store.cancelTask(taskId)
  }
  return result
}

/** Creates the board tasks for an approved plan and starts dispatch. */
export async function applyPlanAndRun(goalId: string): Promise<void> {
  const goal = useGoalStore.getState().goals[goalId]
  if (!goal?.plan) {
    return
  }
  const taskIds = await createChildTasks(goal)
  useGoalStore.getState().updateGoal(goalId, {
    taskIds,
    status: 'running'
  })
  scheduleDispatch(0)
  checkProgress(goalId)
}

/** Ask Michael for a fresh plan. Completed tasks are preserved. */
export function replan(goalId: string): void {
  const goal = useGoalStore.getState().goals[goalId]
  if (!goal) {
    return
  }
  useGoalStore.getState().updateGoal(goalId, {
    plan: undefined,
    status: 'planning',
    taskIds: goal.taskIds
  })
  sendPlanningRequest(goalId)
}

function handleRetry(goal: GoalRecord, task: TaskRecord): void {
  const retries = goal.retries.filter((r) => r.taskId === task.id).length
  if (retries >= RETRY_LIMIT) {
    return
  }
  const alt = pickCoworker(task, task.assignedAgentId)
  const action = alt && alt !== task.assignedAgentId ? 'reassign' : 'retry'
  useGoalStore.getState().addRetry(goal.id, {
    taskId: task.id,
    attempt: retries + 1,
    action,
    note:
      action === 'reassign'
        ? `Reassigning to ${agents()[alt!]?.name ?? 'another coworker'}`
        : `Retrying on ${agents()[task.assignedAgentId ?? '']?.name ?? 'the same coworker'}`,
    ts: Date.now()
  })
  if (action === 'reassign') {
    useTaskStore.getState().assignTask(task.id, alt)
  }
  useTaskStore.getState().returnToTodo(task.id)
}

function dispatch(goal: GoalRecord): void {
  const store = useTaskStore.getState()
  const tasks = store.tasks
  const starting: Set<string> = new Set()

  for (const taskId of goal.taskIds) {
    const task = tasks[taskId]
    if (!task) {
      continue
    }
    if (task.status === 'failed') {
      handleRetry(goal, task)
      continue
    }
    if (task.status !== 'todo') {
      continue
    }
    if (!dependenciesMet(task, tasks)) {
      continue
    }
    let assignee = task.assignedAgentId
    const live = (id: string | undefined): boolean => (id ? agentLive(agents()[id]) : false)

    if (assignee && live(assignee) && !agentIsBusy(tasks, assignee, task.id)) {
      // recommended coworker is available
    } else if (assignee && !live(assignee)) {
      const alt = pickCoworker(task, assignee)
      if (!alt || starting.has(alt)) {
        continue
      }
      store.assignTask(task.id, alt)
      assignee = alt
    } else if (assignee) {
      continue
    } else {
      const pick = pickCoworker(task)
      if (!pick || starting.has(pick)) {
        continue
      }
      store.assignTask(task.id, pick)
      assignee = pick
    }

    if (!assignee || !live(assignee) || starting.has(assignee)) {
      continue
    }
    starting.add(assignee)
    startTask(task.id)
  }
}

export function dispatchAll(): void {
  const goalStore = useGoalStore.getState()
  const { goals, hydrated } = goalStore
  if (!hydrated || !useTaskStore.getState().hydrated) {
    return
  }
  for (const goal of Object.values(goals)) {
    if (
      goal.status === 'running' ||
      goal.status === 'needs-input' ||
      goal.status === 'partially-completed'
    ) {
      dispatch(goal)
    }
  }
}

function checkProgress(goalId: string): void {
  const goal = useGoalStore.getState().goals[goalId]
  if (!goal) {
    return
  }
  if (
    goal.status !== 'running' &&
    goal.status !== 'needs-input' &&
    goal.status !== 'partially-completed'
  ) {
    return
  }
  const tasks = useTaskStore.getState().tasks
  const child = goal.taskIds.map((id) => tasks[id]).filter(Boolean)
  if (child.length === 0) {
    return
  }
  const done = child.filter((t) => t.status === 'done')
  const failed = child.filter((t) => t.status === 'failed')
  const needsInput = child.some((t) => t.status === 'needs-input')
  const openQuestion = goal.questions.some((q) => q.answeredAt == null)

  if (done.length === child.length) {
    useGoalStore.getState().setReport(goalId, buildReport(goal, child))
    useGoalStore.getState().setStatus(goalId, 'completed')
    expireGoalMemory(goalId)
    return
  }
  let next: GoalRecord['status'] = 'running'
  if (needsInput || openQuestion) {
    next = 'needs-input'
  } else if (failed.length > 0) {
    next = done.length > 0 ? 'partially-completed' : 'failed'
  }
  if (goal.status !== next) {
    useGoalStore.getState().setStatus(goalId, next)
  }
}

function scheduleDispatch(delay = 600): void {
  if (dispatchTimer) {
    clearTimeout(dispatchTimer)
  }
  dispatchTimer = setTimeout(() => {
    dispatchTimer = null
    dispatchAll()
    for (const goal of Object.values(useGoalStore.getState().goals)) {
      if (
        goal.status === 'running' ||
        goal.status === 'needs-input' ||
        goal.status === 'partially-completed'
      ) {
        checkProgress(goal.id)
      }
    }
  }, delay)
}

/** Called once from the app after stores hydrate. */
export function startGoalEngine(): void {
  useTaskStore.subscribe((state, previous) => {
    if (state.tasks !== previous.tasks) {
      scheduleDispatch()
    }
  })
  setInterval(() => {
    dispatchAll()
  }, 5000)
}