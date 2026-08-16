import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

import type { NewTaskInput, TaskRecord } from '../shared/types'

/**
 * SQLite-backed task persistence. Stores the full structured task record
 * (status, assignments, dependencies, questions, answers, reports, events)
 * as JSON on a single `tasks` table. Large terminal transcripts and project
 * files stay outside the database.
 */
let db: DatabaseSync | null = null

function open(): DatabaseSync {
  if (db) {
    return db
  }
  const dir = app.getPath('userData')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  db = new DatabaseSync(join(dir, 'pixelforge-tasks.db'))
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      status TEXT NOT NULL,
      assigned_agent_id TEXT,
      project_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
  return db
}

function toRecord(row: {
  json: string
}): TaskRecord {
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
  const database = open()
  database
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