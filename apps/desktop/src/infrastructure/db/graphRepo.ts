import { randomUUID } from 'node:crypto'
import type { GraphNode, GraphRelationship } from '../../shared/types'
import { open } from './connection'

function toNode(row: { json: string }): GraphNode {
  return JSON.parse(row.json) as GraphNode
}

function toRelationship(row: { json: string }): GraphRelationship {
  return JSON.parse(row.json) as GraphRelationship
}

export function saveNode(node: GraphNode): GraphNode {
  const row = {
    id: node.id,
    json: JSON.stringify(node),
    type: node.type,
    created_at: node.createdAt ?? Date.now(),
    updated_at: node.updatedAt ?? Date.now()
  }
  open()
    .prepare(
      `INSERT INTO graph_nodes (id, json, type, created_at, updated_at)
       VALUES (:id, :json, :type, :created_at, :updated_at)
       ON CONFLICT(id) DO UPDATE SET
         json = excluded.json,
         type = excluded.type,
         updated_at = excluded.updated_at`
    )
    .run(row)
  return node
}

export function createNode(input: {
  id: string
  type: GraphNode['type']
  label: string
  projectPath?: string
  status?: string
  archived?: boolean
  confidence?: GraphNode['confidence']
  tags?: string[]
  meta?: Record<string, unknown>
}): GraphNode {
  const now = Date.now()
  const node: GraphNode = {
    id: input.id,
    type: input.type,
    label: input.label,
    projectPath: input.projectPath,
    status: input.status,
    archived: input.archived,
    confidence: input.confidence,
    tags: input.tags,
    createdAt: now,
    updatedAt: now,
    meta: input.meta
  }
  return saveNode(node)
}

export function listNodes(): GraphNode[] {
  const rows = open()
    .prepare('SELECT json FROM graph_nodes ORDER BY created_at ASC')
    .all() as { json: string }[]
  return rows.map(toNode)
}

export function removeNode(nodeId: string): void {
  open().prepare('DELETE FROM graph_nodes WHERE id = ?').run(nodeId)
}

export function saveRelationship(rel: GraphRelationship): GraphRelationship {
  const row = {
    id: rel.id,
    json: JSON.stringify(rel),
    source_id: rel.source,
    target_id: rel.target,
    type: rel.type,
    status: rel.status,
    created_at: rel.createdAt,
    updated_at: rel.updatedAt
  }
  open()
    .prepare(
      `INSERT INTO graph_relationships (id, json, source_id, target_id, type, status, created_at, updated_at)
       VALUES (:id, :json, :source_id, :target_id, :type, :status, :created_at, :updated_at)
       ON CONFLICT(id) DO UPDATE SET
         json = excluded.json,
         source_id = excluded.source_id,
         target_id = excluded.target_id,
         type = excluded.type,
         status = excluded.status,
         updated_at = excluded.updated_at`
    )
    .run(row)
  return rel
}

export function createRelationship(input: {
  source: string
  target: string
  type: GraphRelationship['type']
  status: GraphRelationship['status']
  confidence?: number
  evidence?: string
  evidenceId?: string
  createdBy?: string
}): GraphRelationship {
  const now = Date.now()
  const rel: GraphRelationship = {
    id: randomUUID(),
    source: input.source,
    target: input.target,
    type: input.type,
    status: input.status,
    confidence: input.confidence,
    evidence: input.evidence,
    evidenceId: input.evidenceId,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now
  }
  return saveRelationship(rel)
}

export function listRelationships(): GraphRelationship[] {
  const rows = open()
    .prepare('SELECT json FROM graph_relationships ORDER BY created_at ASC')
    .all() as { json: string }[]
  return rows.map(toRelationship)
}

export function removeRelationship(relId: string): void {
  open().prepare('DELETE FROM graph_relationships WHERE id = ?').run(relId)
}