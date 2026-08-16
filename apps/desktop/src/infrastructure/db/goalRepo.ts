import { randomUUID } from 'node:crypto'
import type { GoalRecord, NewGoalInput } from '../../shared/types'
import { open } from './connection'

function toGoal(row: { json: string }): GoalRecord {
  return JSON.parse(row.json) as GoalRecord
}

export function createGoal(input: NewGoalInput): GoalRecord {
  const now = Date.now()
  const goal: GoalRecord = {
    id: randomUUID(),
    title: input.title,
    request: input.request,
    projectPath: input.projectPath,
    expectedOutcome: input.expectedOutcome,
    constraints: input.constraints,
    priority: input.priority,
    deadline: input.deadline,
    budget: input.budget,
    attachments: input.attachments,
    preferredCoworkers: input.preferredCoworkers,
    completionRequirements: input.completionRequirements,
    approvalMode: input.approvalMode,
    status: 'planning',
    taskIds: [],
    questions: [],
    retries: [],
    createdAt: now,
    updatedAt: now
  }
  saveGoal(goal)
  return goal
}

export function saveGoal(goal: GoalRecord): GoalRecord {
  const row = {
    id: goal.id,
    json: JSON.stringify(goal),
    status: goal.status,
    created_at: goal.createdAt,
    updated_at: goal.updatedAt
  }
  open()
    .prepare(
      `INSERT INTO goals (id, json, status, created_at, updated_at)
       VALUES (:id, :json, :status, :created_at, :updated_at)
       ON CONFLICT(id) DO UPDATE SET
         json = excluded.json,
         status = excluded.status,
         updated_at = excluded.updated_at`
    )
    .run(row)
  return goal
}

export function listGoals(): GoalRecord[] {
  const rows = open()
    .prepare('SELECT json FROM goals ORDER BY created_at ASC')
    .all() as { json: string }[]
  return rows.map(toGoal)
}

export function removeGoal(goalId: string): void {
  open().prepare('DELETE FROM goals WHERE id = ?').run(goalId)
}