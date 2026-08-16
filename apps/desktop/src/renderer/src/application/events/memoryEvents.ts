import type { MemoryType } from '@shared/types'
import { proposeMemory } from '../services/memoryEngine'
import { useOfficeStore } from '../state/officeStore'

/**
 * Bridge between coworker terminal output and memory proposals.
 *
 * A coworker can propose a memory with a structured marker:
 *
 *   @pixelforge/memory {"title":"...","content":"...","type":"project","tags":["..."]}
 *
 * The proposal is classified as pending (Save with user approval) and shown
 * in the Memory section. The application decides whether it is saved.
 */

const MARKER_RE = /@pixelforge\/memory\s+(\{.*?\})/g

interface RawMemory {
  title?: unknown
  content?: unknown
  type?: unknown
  tags?: unknown
  relatedTaskId?: unknown
  projectPath?: unknown
}

function stripAnsi(data: string): string {
  // eslint-disable-next-line no-control-regex
  return data.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map(asString).filter(Boolean).slice(0, 8)
}

function asType(value: unknown): MemoryType {
  const text = asString(value).toLowerCase()
  if (
    text === 'user' ||
    text === 'project' ||
    text === 'decision' ||
    text === 'task' ||
    text === 'coworker' ||
    text === 'temporary'
  ) {
    return text
  }
  return 'project'
}

export function parseMemoryOutput(sessionId: string, data: string): void {
  const clean = stripAnsi(data)
  const marker = new RegExp(MARKER_RE.source, 'g')
  const agent = useOfficeStore.getState().agents[sessionId]
  let match: RegExpExecArray | null
  while ((match = marker.exec(clean)) !== null) {
    try {
      const parsed = JSON.parse(match[1] ?? '{}') as RawMemory
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        continue
      }
      const title = asString(parsed.title)
      const content = asString(parsed.content)
      if (!title || !content) {
        continue
      }
      void proposeMemory({
        title,
        content,
        type: asType(parsed.type),
        projectPath: asString(parsed.projectPath) || agent?.projectPath || undefined,
        relatedAgentId: sessionId,
        relatedTaskId: asString(parsed.relatedTaskId) || undefined,
        source: { kind: 'terminal', sessionId },
        createdBy: agent?.name ?? sessionId,
        confidence: 'medium',
        tags: asTags(parsed.tags),
        visibility: 'team',
        approval: 'pending'
      })
    } catch {
      // ignore malformed memory markers
    }
  }
}