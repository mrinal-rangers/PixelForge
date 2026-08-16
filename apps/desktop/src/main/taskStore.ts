import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

import type {
  GoalRecord,
  MemoryRecord,
  NewGoalInput,
  NewMemoryInput,
  NewTaskInput,
  TaskRecord
} from '../shared/types'

/**
 * SQLite-backed persistence for tasks and goals. Stores the full structured
 * records (status, assignments, dependencies, questions, answers, reports,
 * events) as JSON on dedicated tables. Large terminal transcripts and project
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
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      type TEXT NOT NULL,
      project_path TEXT,
      related_agent_id TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
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

function toGoal(row: { json: string }): GoalRecord {
  return JSON.parse(row.json) as GoalRecord
}

function toMemory(row: { json: string }): MemoryRecord {
  return JSON.parse(row.json) as MemoryRecord
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

export function createMemory(input: NewMemoryInput): MemoryRecord {
  const now = Date.now()
  const memory: MemoryRecord = {
    id: randomUUID(),
    title: input.title,
    content: input.content,
    type: input.type,
    projectPath: input.projectPath,
    relatedAgentId: input.relatedAgentId,
    relatedTaskId: input.relatedTaskId,
    relatedGoalId: input.relatedGoalId,
    source: input.source,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    confidence: input.confidence,
    tags: input.tags,
    visibility: input.visibility,
    expiration: input.expiration,
    archived: false,
    pinned: input.pinned ?? false,
    unreliable: false,
    approval: input.approval,
    usage: [],
    revisions: []
  }
  saveMemory(memory)
  return memory
}

export function saveMemory(memory: MemoryRecord): MemoryRecord {
  const row = {
    id: memory.id,
    json: JSON.stringify(memory),
    type: memory.type,
    project_path: memory.projectPath ?? null,
    related_agent_id: memory.relatedAgentId ?? null,
    archived: memory.archived ? 1 : 0,
    created_at: memory.createdAt,
    updated_at: memory.updatedAt
  }
  open()
    .prepare(
      `INSERT INTO memories (id, json, type, project_path, related_agent_id, archived, created_at, updated_at)
       VALUES (:id, :json, :type, :project_path, :related_agent_id, :archived, :created_at, :updated_at)
       ON CONFLICT(id) DO UPDATE SET
         json = excluded.json,
         type = excluded.type,
         project_path = excluded.project_path,
         related_agent_id = excluded.related_agent_id,
         archived = excluded.archived,
         updated_at = excluded.updated_at`
    )
    .run(row)
  return memory
}

export function listMemories(): MemoryRecord[] {
  const rows = open()
    .prepare('SELECT json FROM memories ORDER BY created_at ASC')
    .all() as { json: string }[]
  return rows.map(toMemory)
}

export function removeMemory(memoryId: string): void {
  open().prepare('DELETE FROM memories WHERE id = ?').run(memoryId)
}

export function clearMemories(): void {
  open().prepare('DELETE FROM memories').run()
}