import { randomUUID } from 'node:crypto'
import type { MemoryRecord, NewMemoryInput } from '../../shared/types'
import { open } from './connection'

function toMemory(row: { json: string }): MemoryRecord {
  return JSON.parse(row.json) as MemoryRecord
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