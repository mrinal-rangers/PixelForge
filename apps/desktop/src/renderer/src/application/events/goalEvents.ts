import type {
  GoalPlan,
  GoalTaskDraft,
  TaskPriority
} from '@shared/types'
import { planRequiresApproval } from '@shared/rules/goal'
import { useGoalStore } from '../state/goalStore'
import { applyPlanAndRun } from '../services/goalEngine'

/**
 * Bridge between the orchestrator session (Michael) and the goal record.
 *
 * Michael is a real CLI agent session. He receives a planning brief and is
 * asked to answer with a single structured payload on one line:
 *
 *   @pixelforge/plan {"goal":"<goalId>","understanding":"...","tasks":[...],"risks":[...],"completionCriteria":"..."}
 *
 * The renderer validates the payload and only then updates the goal record
 * (architectural rule: Michael proposes, the app validates and applies).
 */

const MARKER_RE = /@pixelforge\/plan\s+(\{.*?\})/g

interface RawDraft {
  title?: unknown
  instructions?: unknown
  assignee?: unknown
  reason?: unknown
  dependencies?: unknown
  priority?: unknown
}

interface RawPlan {
  goal?: unknown
  understanding?: unknown
  tasks?: unknown
  risks?: unknown
  completionCriteria?: unknown
  note?: unknown
}

function stripAnsi(data: string): string {
  // eslint-disable-next-line no-control-regex
  return data.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((item) => asString(item)).filter(Boolean)
}

function asPriority(value: unknown): TaskPriority {
  const text = asString(value).toLowerCase()
  if (text === 'urgent' || text === 'high' || text === 'medium' || text === 'low') {
    return text
  }
  return 'medium'
}

function validateDrafts(raw: unknown): GoalTaskDraft[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const drafts: GoalTaskDraft[] = []
  for (const item of raw as RawDraft[]) {
    const title = asString(item.title)
    if (!title) {
      continue
    }
    const id = `t${drafts.length + 1}`
    drafts.push({
      id,
      title,
      instructions: asString(item.instructions, title),
      assignee: asString(item.assignee) || undefined,
      assigneeReason: asString(item.reason) || undefined,
      dependencies: asStringArray(item.dependencies),
      priority: asPriority(item.priority)
    })
  }
  // Normalize dependencies so they reference draft ids by matching titles or
  // plain indices. Unknown references are kept as-is and ignored at apply time.
  const byTitle = new Map<string, string>()
  for (const draft of drafts) {
    byTitle.set(draft.title.toLowerCase(), draft.id)
  }
  for (const draft of drafts) {
    draft.dependencies = draft.dependencies
      .map((dep) => {
        const direct = drafts.find((d) => d.id === dep)
        if (direct) {
          return direct.id
        }
        const index = Number.parseInt(dep, 10)
        if (Number.isFinite(index) && drafts[index - 1]) {
          return drafts[index - 1].id
        }
        return byTitle.get(dep.toLowerCase()) ?? dep
      })
      .filter((dep) => dep !== draft.id)
  }
  return drafts
}

/** Auto mode must still stop for consequential decisions. */
function parseAndValidate(data: string): RawPlan | null {
  const clean = stripAnsi(data)
  const marker = new RegExp(MARKER_RE.source, 'g')
  let match: RegExpExecArray | null
  while ((match = marker.exec(clean)) !== null) {
    try {
      const parsed = JSON.parse(match[1] ?? '{}') as RawPlan
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        continue
      }
      if (typeof parsed.goal !== 'string' || !Array.isArray(parsed.tasks)) {
        continue
      }
      return parsed
    } catch {
      // ignore malformed plan markers
    }
  }
  return null
}

/** Process terminal output from the orchestrator for structured plans. */
export function parseGoalOutput(_sessionId: string, data: string): void {
  const goalStore = useGoalStore.getState()
  if (!goalStore.hydrated) {
    return
  }
  const raw = parseAndValidate(data)
  if (!raw) {
    return
  }
  const goalId = asString(raw.goal)
  const goal = goalStore.goals[goalId]
  if (!goal || goal.status !== 'planning') {
    return
  }
  const plan: GoalPlan = {
    understanding: asString(raw.understanding, 'Michael is breaking the goal into work for the team.'),
    tasks: validateDrafts(raw.tasks),
    risks: asStringArray(raw.risks),
    completionCriteria: asString(raw.completionCriteria, 'All proposed tasks complete and verified.'),
    note: asString(raw.note) || undefined
  }
  if (plan.tasks.length === 0) {
    goalStore.updateGoal(goalId, {
      plan,
      status: 'awaiting-approval'
    })
    return
  }
  goalStore.updateGoal(goalId, { plan, status: 'awaiting-approval' })
  if (goal.approvalMode === 'auto' && !planRequiresApproval(plan)) {
    void applyPlanAndRun(goalId)
  }
}