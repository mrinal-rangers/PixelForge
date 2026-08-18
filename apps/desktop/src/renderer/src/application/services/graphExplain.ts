import {
  findPath,
  nodeLabel,
  nodeStatusCategory,
  STATUS_CATEGORY_LABELS,
  NODE_TYPE_LABELS,
  graphRelationshipLabel
} from '@shared/rules/graph'
import type { GraphNode, GraphSnapshot, MessageRecord } from '@shared/types'
import { conversationIdForDirect, USER_ID } from '@shared/rules/message'
import { useOfficeStore } from '../state/officeStore'
import { sendMessage } from './messageEngine'
import { useGraphStore } from '../state/graphStore'

/**
 * Graph explanation.
 *
 * Michael can explain a selected part of the graph. Common questions are
 * answered locally from graph structure (blocked paths, file owners, decision
 * dependents, coworker expertise). Anything else is forwarded to the manager's
 * terminal as a message so Michael can answer with real context.
 */

function nodesMatching(snapshot: GraphSnapshot, query: string): GraphNode[] {
  const q = query.toLowerCase()
  return snapshot.nodes.filter((node) => {
    const hay = `${node.label} ${node.meta?.description ?? ''} ${node.meta?.path ?? ''} ${node.meta?.content ?? ''} ${node.tags?.join(' ') ?? ''}`.toLowerCase()
    return hay.includes(q)
  })
}

export function answerGraphQuestion(question: string, snapshot: GraphSnapshot): string {
  const q = question.toLowerCase().trim()
  const lines: string[] = []

  if (/why.*(blocked|blocking)|why.*waiting/.test(q)) {
    const blocked = snapshot.nodes.filter(
      (n) => nodeStatusCategory(n) === 'blocked' || nodeStatusCategory(n) === 'waiting'
    )
    if (blocked.length === 0) {
      return 'Nothing is currently blocked or waiting for input.'
    }
    lines.push(`Found ${blocked.length} blocked / waiting item(s):`)
    for (const node of blocked.slice(0, 10)) {
      const blockers = snapshot.relationships
        .filter((r) => r.target === node.id && r.type === 'blocked-by')
        .map((r) => {
          const source = snapshot.nodes.find((n) => n.id === r.source)
          return `${source ? nodeLabel(source, 28) : r.source} (${graphRelationshipLabel(r)})`
        })
      const depends = snapshot.relationships
        .filter((r) => r.source === node.id && r.type === 'depends-on')
        .map((r) => {
          const target = snapshot.nodes.find((n) => n.id === r.target)
          return nodeLabel(target ?? ({ label: r.target } as GraphNode), 28)
        })
      lines.push(
        `- ${nodeLabel(node, 40)} [${STATUS_CATEGORY_LABELS[nodeStatusCategory(node)]}]` +
          (blockers.length > 0 ? ` blocked by: ${blockers.join(', ')}` : '') +
          (depends.length > 0 ? `; blocking: ${depends.join(', ')}` : '')
      )
    }
    return lines.join('\n')
  }

  const whoChanged = q.match(/who.*changed.*(file\s+)?(.+)/)
  if (/who.*changed/.test(q) || /which task.*changed/.test(q)) {
    const needle = whoChanged ? whoChanged[2].replace(/[?.,]/g, '').trim() : ''
    const fileNodes = snapshot.nodes.filter((n) => n.type === 'file' && n.label.toLowerCase().includes(needle))
    if (fileNodes.length === 0) {
      return `I could not find a file matching "${needle}".`
    }
    for (const file of fileNodes.slice(0, 5)) {
      const changers = snapshot.relationships
        .filter((r) => r.target === file.id && r.type === 'changed')
        .map((r) => {
          const task = snapshot.nodes.find((n) => n.id === r.source)
          const assignee = snapshot.relationships
            .filter((x) => x.target === r.source && x.type === 'assigned-to')
            .map((x) => {
              const who = snapshot.nodes.find((n) => n.id === x.source)
              return who?.label ?? x.source
            })
          return `${task ? nodeLabel(task, 30) : r.source}${assignee.length ? ` (by ${assignee.join(', ')})` : ''}`
        })
      lines.push(`- ${file.label}: changed by ${changers.length ? changers.join(', ') : 'nobody yet'}`)
    }
    return lines.join('\n')
  }

  const dependsMatch = q.match(/what.*depend.*on (.+)/)
  if (/what.*depend/.test(q)) {
    const needle = dependsMatch ? dependsMatch[1].replace(/[?.,]/g, '').trim() : ''
    const centers = nodesMatching(snapshot, needle)
    if (centers.length === 0) {
      return `I could not find anything matching "${needle}".`
    }
    for (const center of centers.slice(0, 3)) {
      const dependents = snapshot.relationships
        .filter((r) => r.source === center.id && r.type === 'depends-on')
        .map((r) => nodeLabel(snapshot.nodes.find((n) => n.id === r.target) ?? ({ label: r.target } as GraphNode), 30))
      const impacted = snapshot.relationships
        .filter((r) => r.source === center.id || r.target === center.id)
        .map((r) => graphRelationshipLabel(r))
      lines.push(
        `- ${nodeLabel(center, 34)}: ${dependents.length ? `blocks ${dependents.join(', ')}` : 'nothing depends on it'} (${impacted.length} connection type(s))`
      )
    }
    return lines.join('\n')
  }

  const expertMatch = q.match(/who.*(knows|understand).*about (.+)/)
  if (/knows.*about|understand.*about/.test(q)) {
    const topic = expertMatch ? expertMatch[2].replace(/[?.,]/g, '').trim() : ''
    const relevant = snapshot.nodes.filter(
      (n) =>
        (n.type === 'memory' || n.type === 'decision') &&
        `${n.label} ${n.meta?.content ?? ''} ${n.tags?.join(' ') ?? ''}`.toLowerCase().includes(topic.toLowerCase())
    )
    const byCoworker = new Map<string, string[]>()
    for (const memory of relevant) {
      const owners = snapshot.relationships
        .filter((r) => r.target === memory.id && (r.type === 'references' || r.type === 'came-from'))
        .map((r) => r.source)
      for (const owner of owners) {
        const list = byCoworker.get(owner) ?? []
        list.push(memory.label)
        byCoworker.set(owner, list)
      }
      const users = snapshot.relationships
        .filter((r) => r.source === memory.id && r.type === 'uses')
        .map((r) => r.target)
      for (const user of users) {
        const list = byCoworker.get(user) ?? []
        list.push(memory.label)
        byCoworker.set(user, list)
      }
    }
    if (byCoworker.size === 0) {
      return `Nobody has recorded memories about "${topic}" yet.`
    }
    lines.push(`Coworkers with knowledge about "${topic}":`)
    const ranked = [...byCoworker.entries()].sort((a, b) => b[1].length - a[1].length)
    for (const [ownerId, memories] of ranked.slice(0, 5)) {
      const owner = snapshot.nodes.find((n) => n.id === ownerId)
      lines.push(`- ${owner ? owner.label : ownerId}: ${memories.length} memory(ies)`)
    }
    return lines.join('\n')
  }

  if (/how are .* and .* connected|path.*between|trace.*path/.test(q)) {
    return 'Select two nodes (pick source, then target) and I will trace the connecting path.'
  }

  if (snapshot.nodes.length === 0) {
    return 'The graph is empty. Create a goal or task first.'
  }

  lines.push(`The graph currently shows ${snapshot.nodes.length} node(s) and ${snapshot.relationships.length} connection(s).`)
  const counts = new Map<string, number>()
  for (const node of snapshot.nodes) {
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1)
  }
  lines.push([...counts.entries()].map(([type, n]) => `${NODE_TYPE_LABELS[type as keyof typeof NODE_TYPE_LABELS] ?? type}: ${n}`).join(' · '))
  return lines.join('\n')
}

/** Trace a path between two nodes and render it as text. */
export function explainPath(snapshot: GraphSnapshot, fromId: string, toId: string): string {
  const path = findPath(snapshot.relationships, fromId, toId)
  if (!path) {
    return 'No connection found between the selected nodes within 6 hops.'
  }
  const steps: string[] = []
  for (let i = 0; i < path.length; i += 1) {
    const node = snapshot.nodes.find((n) => n.id === path[i])
    steps.push(node ? nodeLabel(node, 30) : path[i])
  }
  return `Path (${path.length - 1} hop(s)): ${steps.join(' → ')}`
}

/**
 * Ask Michael to explain part of the graph. Returns the created message, or
 * null when there is no manager terminal to ask.
 */
export async function askMichaelAboutGraph(
  question: string,
  nodeId?: string,
  snapshot?: GraphSnapshot
): Promise<MessageRecord | null> {
  const managerId = useOfficeStore.getState().managerId
  if (!managerId) {
    return null
  }
  let context = ''
  const graph = snapshot ?? useGraphStore.getState().snapshot
  if (nodeId) {
    const node = graph.nodes.find((n) => n.id === nodeId)
    if (node) {
      const neighbours = graph.relationships
        .filter((r) => r.source === nodeId || r.target === nodeId)
        .slice(0, 12)
        .map((r) => {
          const other = nodeId === r.source ? r.target : r.source
          const otherNode = graph.nodes.find((n) => n.id === other)
          return `${otherNode ? nodeLabel(otherNode, 24) : other} (${graphRelationshipLabel(r)})`
        })
      context = `\nSelected node: ${NODE_TYPE_LABELS[node.type]} "${nodeLabel(node, 60)}".\nConnected to: ${neighbours.length ? neighbours.join(', ') : 'nothing'}.\n`
    }
  }
  const conversationId = conversationIdForDirect(USER_ID, managerId)
  return sendMessage({
    conversationId,
    senderId: USER_ID,
    recipientId: managerId,
    kind: 'information',
    text: `[Graph question] ${question}${context}\n\nAnswer with reference to the relevant goals, tasks, memories or decisions.`,
    projectPath: nodeId
      ? graph.nodes.find((n) => n.id === nodeId)?.projectPath
      : undefined
  })
}