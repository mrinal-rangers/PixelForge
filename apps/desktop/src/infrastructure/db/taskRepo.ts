import { randomUUID } from 'node:crypto'
import type { NewTaskInput, TaskRecord } from '../../shared/types'
import { open } from './connection'

function toRecord(row: { json: string }): TaskRecord {
  return JSON.parse(row.json) as TaskRecord
}

export function createTask(input: NewTaskInput): TaskRecord {
  const now = Date.now()
  const record: TaskRecord = {
    id: randomUUID(),
    title: input.title,
    instructions: input.instructions,
    projectPath: input.projectPath,
    assignedAgentId: input.assignedAgentId,
    priority: input.priority,
    deadline: input.deadline,
    attachments: input.attachments,
    dependencies: input.dependencies,
    dependents: [],
    requirements: input.requirements,
    status: 'todo',
    subtasks: [],
    progress: [],
    events: [{ id: 1, type: 'created', text: 'Task created', ts: now }],
    questions: [],
    filesChanged: [],
    createdAt: now,
    updatedAt: now
  }
  saveTask(record)
  return record
}

export function saveTask(record: TaskRecord): TaskRecord {
  const row = {
    id: record.id,
    json: JSON.stringify(record),
    status: record.status,
    assigned_agent_id: record.assignedAgentId ?? null,
    project_path: record.projectPath ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt
  }
  open()
    .prepare(
      `INSERT INTO tasks (id, json, status, assigned_agent_id, project_path, created_at, updated_at)
       VALUES (:id, :json, :status, :assigned_agent_id, :project_path, :created_at, :updated_at)
       ON CONFLICT(id) DO UPDATE SET
         json = excluded.json,
         status = excluded.status,
         assigned_agent_id = excluded.assigned_agent_id,
         project_path = excluded.project_path,
         updated_at = excluded.updated_at`
    )
    .run(row)
  return record
}

export function listTasks(): TaskRecord[] {
  const rows = open()
    .prepare('SELECT json FROM tasks ORDER BY created_at ASC')
    .all() as { json: string }[]
  return rows.map(toRecord)
}

export function removeTask(taskId: string): void {
  open().prepare('DELETE FROM tasks WHERE id = ?').run(taskId)
}