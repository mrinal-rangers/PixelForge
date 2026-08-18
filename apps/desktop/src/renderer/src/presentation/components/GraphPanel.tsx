import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import cytoscape from 'cytoscape'
import type { Core, ElementDefinition, StylesheetStyle } from 'cytoscape'
import {
  applyFilters,
  findPath,
  focusSubgraph,
  impactSubgraph,
  NODE_TYPE_COLORS,
  NODE_TYPE_GLYPHS,
  NODE_TYPE_LABELS,
  nodeLabel,
  nodeStatusCategory,
  nodeStatusColor,
  relationshipArrow,
  relationshipLineColor,
  STATUS_CATEGORY_COLORS,
  STATUS_CATEGORY_LABELS,
  GRAPH_PRESETS,
  presetFilters
} from '@shared/rules/graph'
import type { GraphFilters } from '@shared/rules/graph'
import type { GraphNode, GraphNodeType, GraphRelationship, GraphSnapshot } from '@shared/types'
import { useGraphStore } from '../../application/state/graphStore'
import { useGoalStore } from '../../application/state/goalStore'
import { answerGraphQuestion, askMichaelAboutGraph, explainPath } from '../../application/services/graphExplain'

type GraphMode = 'work' | 'knowledge' | 'collaboration'

const MODE_LABELS: Record<GraphMode, string> = {
  work: 'Work',
  knowledge: 'Knowledge',
  collaboration: 'Collaboration'
}

const MODE_TYPES: Record<GraphMode, GraphNodeType[]> = {
  work: ['goal', 'task', 'subtask', 'coworker', 'question', 'project', 'commit'],
  knowledge: ['memory', 'decision', 'file', 'test', 'external', 'project', 'task', 'goal'],
  collaboration: ['coworker', 'message', 'task', 'question', 'goal']
}

const NODE_STYLE = [
  {
    selector: 'node',
    style: {
      color: '#141a2e',
      'font-size': '8px',
      'font-family': 'PressStart, monospace',
      'text-wrap': 'wrap',
      'text-max-width': '120px',
      'text-valign': 'center',
      'text-halign': 'center',
      'border-width': '3px',
      'border-color': 'data(statusColor)',
      'background-color': 'data(typeColor)',
      width: '120px',
      height: '34px',
      'overlay-opacity': 0
    }
  },
  { selector: 'node[type = "goal"]', style: { shape: 'star', width: '150px', height: '42px' } },
  { selector: 'node[type = "task"]', style: { shape: 'roundrectangle', width: '150px', height: '42px' } },
  { selector: 'node[type = "subtask"]', style: { shape: 'roundrectangle', width: '110px', height: '30px' } },
  { selector: 'node[type = "coworker"]', style: { shape: 'ellipse', width: '110px', height: '38px' } },
  { selector: 'node[type = "project"]', style: { shape: 'hexagon', width: '150px', height: '40px' } },
  { selector: 'node[type = "file"]', style: { shape: 'rectangle', width: '130px', height: '30px' } },
  { selector: 'node[type = "memory"]', style: { shape: 'round-diamond', width: '140px', height: '40px' } },
  { selector: 'node[type = "decision"]', style: { shape: 'diamond', width: '140px', height: '40px' } },
  { selector: 'node[type = "question"]', style: { shape: 'ellipse', width: '120px', height: '32px' } },
  { selector: 'node[type = "message"]', style: { shape: 'roundrectangle', width: '140px', height: '30px' } },
  { selector: 'node[type = "test"]', style: { shape: 'vee', width: '110px', height: '30px' } },
  { selector: 'node[type = "commit"]', style: { shape: 'octagon', width: '110px', height: '28px' } },
  { selector: 'node[type = "external"]', style: { shape: 'barrel', width: '110px', height: '28px' } },
  {
    selector: 'edge',
    style: {
      'line-color': 'data(lineColor)',
      'line-style': 'solid',
      width: '2px',
      'target-arrow-color': 'data(lineColor)',
      'target-arrow-shape': 'none',
      'arrow-scale': 0.7,
      'curve-style': 'bezier',
      color: 'data(lineColor)',
      'font-size': '7px',
      'font-family': 'PressStart, monospace',
      'text-rotation': 'autorotate',
      label: 'data(label)'
    }
  },
  { selector: 'edge.inferred, edge.agent-reported, edge.outdated', style: { 'line-style': 'dashed', width: '1.5px' } },
  { selector: 'edge.conflicting, edge.blocked', style: { 'line-color': '#ff4d5e', width: '3px' } },
  { selector: 'edge.arrow-yes', style: { 'target-arrow-shape': 'triangle' } },
  {
    selector: '.path-highlight',
    style: {
      'border-color': '#ff4d5e',
      'border-width': '5px'
    }
  },
  {
    selector: '.path-edge-highlight',
    style: {
      'line-color': '#ff4d5e',
      width: '3px'
    }
  },
  {
    selector: '.impact-center',
    style: {
      'border-color': '#ffcc33',
      'border-width': '6px'
    }
  }
] as unknown as StylesheetStyle[]

interface GraphPanelProps {
  onOpenTask?: (taskId: string) => void
}

export function GraphPanel({ onOpenTask }: GraphPanelProps): React.JSX.Element {
  const snapshot = useGraphStore((s) => s.snapshot)
  const persistedRelationships = useGraphStore(useShallow((s) => s.persistedRelationships))
  const selectedGoalId = useGoalStore((s) => s.selectedGoalId)

  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const snapshotRef = useRef(snapshot)
  const traceFromRef = useRef<string | null>(null)

  const [mode, setMode] = useState<GraphMode>('work')
  const [preset, setPreset] = useState('all')
  const [showArchived, setShowArchived] = useState(false)
  const [confirmedOnly, setConfirmedOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [showLegend, setShowLegend] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<GraphRelationship | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [focusDepth, setFocusDepth] = useState(1)
  const [impactId, setImpactId] = useState<string | null>(null)
  const [traceFromId, setTraceFromId] = useState<string | null>(null)
  const [insight, setInsight] = useState<string | null>(null)
  const [askText, setAskText] = useState('')

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])
  useEffect(() => {
    traceFromRef.current = traceFromId
  }, [traceFromId])

  // ---- Cytoscape init ------------------------------------------------------

  useEffect(() => {
    if (!containerRef.current) {
      return
    }
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: NODE_STYLE,
      wheelSensitivity: 0.18,
      minZoom: 0.12,
      maxZoom: 2.5
    })
    cyRef.current = cy

    cy.on('tap', 'node', (event) => {
      const id = event.target.id()
      const current = snapshotRef.current
      const traceFrom = traceFromRef.current
      if (traceFrom && id !== traceFrom) {
        const path = findPath(current.relationships, traceFrom, id)
        if (path) {
          setInsight(explainPath(current, traceFrom, id))
          applyPathHighlight(path)
        } else {
          setInsight('No connection found between the selected nodes within 6 hops.')
        }
        setTraceFromId(null)
        setSelectedId(id)
        return
      }
      setSelectedId(id)
      setSelectedEdge(null)
      event.target.select()
    })
    cy.on('tap', 'edge', (event) => {
      const rel = snapshotRef.current.relationships.find((r) => r.id === event.target.id())
      setSelectedEdge(rel ?? null)
      setSelectedId(null)
    })
    cy.on('tap', (event) => {
      if (event.target === cy) {
        setSelectedId(null)
        setSelectedEdge(null)
      }
    })

    return () => {
      cy.destroy()
      cyRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyPathHighlight = (path: string[]): void => {
    const cy = cyRef.current
    if (!cy) {
      return
    }
    cy.elements().removeClass('path-highlight path-edge-highlight')
    cy.$id(path[0]).addClass('path-highlight')
    for (let i = 0; i < path.length - 1; i += 1) {
      const edge = cy.edges().filter((e) => e.source().id() === path[i] && e.target().id() === path[i + 1])
      if (edge.length > 0) {
        edge.first().addClass('path-edge-highlight')
      } else {
        cy.edges().filter((e) => e.source().id() === path[i + 1] && e.target().id() === path[i]).first().addClass('path-edge-highlight')
      }
      cy.$id(path[i + 1]).addClass('path-highlight')
    }
  }

  const clearHighlights = (): void => {
    cyRef.current?.elements().removeClass('path-highlight path-edge-highlight impact-center')
  }

  // ---- Visible snapshot ----------------------------------------------------

  const visible = useMemo<GraphSnapshot>(() => {
    let base = snapshot
    if (impactId) {
      base = impactSubgraph(base, impactId, 2)
    } else if (focusId) {
      base = focusSubgraph(base, focusId, focusDepth)
    }
    const presetFiltersForId = presetFilters(preset, selectedGoalId)
    const nodeTypes = preset === 'all' ? MODE_TYPES[mode] : presetFiltersForId.nodeTypes
    const filters: GraphFilters = {
      nodeTypes,
      statusCategories: presetFiltersForId.statusCategories,
      dateFrom: presetFiltersForId.dateFrom,
      goalId: presetFiltersForId.goalId,
      projectPath: presetFiltersForId.projectPath,
      showArchived,
      confirmedOnly,
      query: query.trim() ? query.trim() : undefined
    }
    return applyFilters(base, filters)
  }, [snapshot, mode, preset, selectedGoalId, focusId, focusDepth, impactId, showArchived, confirmedOnly, query])

  // ---- Render elements into cytoscape -------------------------------------

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) {
      return
    }
    const elements: ElementDefinition[] = []
    for (const node of visible.nodes) {
      const category = nodeStatusCategory(node)
      elements.push({
        data: {
          id: node.id,
          label: `${NODE_TYPE_GLYPHS[node.type]} ${nodeLabel(node)}`,
          type: node.type,
          typeColor: NODE_TYPE_COLORS[node.type],
          statusColor: nodeStatusColor(node),
          statusCategory: category
        }
      })
    }
    const nodeIds = new Set(visible.nodes.map((n) => n.id))
    for (const rel of visible.relationships) {
      if (!nodeIds.has(rel.source) || !nodeIds.has(rel.target)) {
        continue
      }
      const classes: string[] = []
      if (rel.status === 'inferred' || rel.status === 'agent-reported' || rel.status === 'outdated') {
        classes.push(rel.status)
      }
      if (rel.status === 'conflicting') {
        classes.push('conflicting')
      }
      if (rel.type === 'blocked-by') {
        classes.push('blocked')
      }
      if (relationshipArrow(rel)) {
        classes.push('arrow-yes')
      }
      elements.push({
        classes: classes.join(' '),
        data: {
          id: rel.id,
          source: rel.source,
          target: rel.target,
          label: rel.type,
          lineColor: relationshipLineColor(rel)
        }
      })
    }

    cy.elements().remove()
    cy.add(elements)
    cy.layout({ name: 'cose', animate: false, nodeRepulsion: 5000, idealEdgeLength: 120, padding: 30 }).run()

    if (impactId) {
      cy.$id(impactId).addClass('impact-center')
    }
    if (selectedId) {
      const node = cy.$id(selectedId)
      if (node.length > 0) {
        node.select()
        cy.animate({ center: { eles: node } })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const selectedNode = useMemo(
    () => (selectedId ? snapshot.nodes.find((n) => n.id === selectedId) ?? null : null),
    [selectedId, snapshot]
  )

  const searchMatches = useMemo(() => {
    if (!query.trim()) {
      return []
    }
    const q = query.toLowerCase()
    return snapshot.nodes
      .filter((n) => {
        const hay = `${n.label} ${n.meta?.content ?? ''} ${n.meta?.path ?? ''} ${n.meta?.description ?? ''} ${n.tags?.join(' ') ?? ''}`.toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 8)
  }, [query, snapshot])

  const neighbours = useMemo(() => {
    if (!selectedId) {
      return []
    }
    return snapshot.relationships
      .filter((r) => r.source === selectedId || r.target === selectedId)
      .slice(0, 24)
      .map((r) => {
        const otherId = r.source === selectedId ? r.target : r.source
        const other = snapshot.nodes.find((n) => n.id === otherId)
        return { otherId, label: other ? `${NODE_TYPE_LABELS[other.type]}: ${nodeLabel(other, 24)}` : otherId, rel: r }
      })
  }, [selectedId, snapshot])

  const selectNodeById = (id: string): void => {
    setSelectedId(id)
    setSelectedEdge(null)
    setFocusId(id)
    setFocusDepth(1)
    clearHighlights()
  }

  const runTrace = (): void => {
    if (!selectedNode) {
      return
    }
    setTraceFromId(selectedNode.id)
    setInsight(`Trace mode: "… → ${nodeLabel(selectedNode, 28)}". Now click the target node.`)
  }

  const runImpact = (): void => {
    if (!selectedNode) {
      return
    }
    clearHighlights()
    setImpactId(selectedNode.id)
    setInsight(
      `Potential impact of "${nodeLabel(selectedNode, 30)}" — everything within 2 hops (dashed = inferred, not guaranteed).`
    )
  }

  const clearFocus = (): void => {
    setFocusId(null)
    setFocusDepth(1)
    setImpactId(null)
    setInsight(null)
    clearHighlights()
  }

  const ask = async (): Promise<void> => {
    const question = askText.trim()
    if (!question) {
      return
    }
    setInsight('Asking Michael…')
    const message = await askMichaelAboutGraph(question, selectedNode?.id, snapshot)
    if (message) {
      setInsight('Question sent to Michael. The reply will appear in Ask Me / Messages.')
      setAskText('')
      return
    }
    setInsight(answerGraphQuestion(question, snapshot))
    setAskText('')
  }

  const confirmRelationship = async (rel: GraphRelationship): Promise<void> => {
    await useGraphStore.getState().markRelationshipConfirmed(rel.id)
  }

  const deleteRelationship = async (rel: GraphRelationship): Promise<void> => {
    await useGraphStore.getState().removePersistedRelationship(rel.id)
  }

  const isPersisted = (rel: GraphRelationship): boolean =>
    persistedRelationships.some((r) => r.id === rel.id)

  return (
    <div className="graph-panel">
      <div className="graph-toolbar">
        <div className="graph-mode-tabs">
          {(['work', 'knowledge', 'collaboration'] as GraphMode[]).map((m) => (
            <button
              key={m}
              className={`graph-mode-tab ${mode === m ? 'active' : ''}`}
              onClick={() => {
                setMode(m)
                clearFocus()
              }}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <div className="graph-controls">
          <select
            className="text-input select graph-select"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
          >
            {GRAPH_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <label className="graph-check">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Archived
          </label>
          <label className="graph-check">
            <input
              type="checkbox"
              checked={confirmedOnly}
              onChange={(e) => setConfirmedOnly(e.target.checked)}
            />
            Confirmed only
          </label>
          <button className="btn btn-ghost btn-small" onClick={() => setShowLegend((v) => !v)}>
            Legend
          </button>
        </div>
        <div className="graph-search">
          <input
            className="text-input graph-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search goals, tasks, files, memories…"
          />
          {searchMatches.length > 0 && (
            <div className="graph-search-results">
              {searchMatches.map((node) => (
                <button key={node.id} className="graph-search-result" onClick={() => selectNodeById(node.id)}>
                  <span className={`graph-node-dot graph-node-${node.type}`} />
                  {NODE_TYPE_LABELS[node.type]}: {node.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {insight && (
        <div className="graph-insight">
          <span className="graph-insight-label">ANALYSIS</span>
          <pre className="graph-insight-text">{insight}</pre>
          <button className="btn-icon" onClick={() => setInsight(null)} title="Dismiss">
            ×
          </button>
        </div>
      )}

      <div className="graph-canvas-wrap">
        <div ref={containerRef} className="graph-canvas" />
        <div className="graph-stats">
          {visible.nodes.length} nodes · {visible.relationships.length} connections
          {(focusId || impactId) && (
            <button className="btn btn-ghost btn-small" onClick={clearFocus}>
              Clear focus
            </button>
          )}
        </div>
      </div>

      {showLegend && <GraphLegend />}

      <div className="graph-detail">
        {selectedNode && (
          <NodeDetail
            node={selectedNode}
            neighbours={neighbours}
            onSelect={selectNodeById}
            onFocus={() => {
              setFocusId(selectedNode.id)
              setFocusDepth(1)
              setImpactId(null)
            }}
            onExpand={() => {
              setFocusId(selectedNode.id)
              setFocusDepth((d) => d + 1)
              setImpactId(null)
            }}
            onImpact={runImpact}
            onTrace={runTrace}
            onOpenTask={onOpenTask}
          />
        )}
        {selectedEdge && (
          <EdgeDetail
            rel={selectedEdge}
            nodes={snapshot.nodes}
            persisted={isPersisted(selectedEdge)}
            onConfirm={confirmRelationship}
            onDelete={deleteRelationship}
          />
        )}
        {!selectedNode && !selectedEdge && (
          <div className="graph-detail-empty">
            <span className="graph-detail-glyph">◈</span>
            <p>
              Select a node to inspect its evidence, or an edge to see why the connection exists.
            </p>
          </div>
        )}
        <div className="graph-ask">
          <input
            className="text-input graph-ask-input"
            value={askText}
            onChange={(e) => setAskText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void ask()
              }
            }}
            placeholder="Ask about this graph (e.g. why is this task blocked?)…"
          />
          <button className="btn btn-small" onClick={() => void ask()} disabled={!askText.trim()}>
            Ask Michael
          </button>
        </div>
      </div>
    </div>
  )
}

function GraphLegend(): React.JSX.Element {
  return (
    <div className="graph-legend">
      <div className="graph-legend-block">
        <span className="graph-legend-title">STATUS</span>
        <div className="graph-legend-row">
          {(Object.keys(STATUS_CATEGORY_LABELS) as (keyof typeof STATUS_CATEGORY_LABELS)[]).map(
            (cat) => (
              <span key={cat} className="graph-legend-item">
                <span className="graph-status-chip" style={{ background: STATUS_CATEGORY_COLORS[cat] }} />
                {STATUS_CATEGORY_LABELS[cat]}
              </span>
            )
          )}
        </div>
      </div>
      <div className="graph-legend-block">
        <span className="graph-legend-title">NODE TYPES</span>
        <div className="graph-legend-row">
          {(Object.keys(NODE_TYPE_LABELS) as GraphNodeType[]).map((type) => (
            <span key={type} className="graph-legend-item">
              <span className="graph-node-dot" style={{ background: NODE_TYPE_COLORS[type] }} />
              {NODE_TYPE_LABELS[type]}
            </span>
          ))}
        </div>
      </div>
      <div className="graph-legend-block">
        <span className="graph-legend-title">CONNECTIONS</span>
        <div className="graph-legend-row">
          <span className="graph-legend-item">
            <span className="graph-line-sample graph-line-solid" /> Confirmed
          </span>
          <span className="graph-legend-item">
            <span className="graph-line-sample graph-line-dashed" /> Inferred
          </span>
          <span className="graph-legend-item">
            <span className="graph-line-sample graph-line-red" /> Conflict / blocker
          </span>
        </div>
      </div>
    </div>
  )
}

function NodeDetail({
  node,
  neighbours,
  onSelect,
  onFocus,
  onExpand,
  onImpact,
  onTrace,
  onOpenTask
}: {
  node: GraphNode
  neighbours: Array<{ otherId: string; label: string; rel: GraphRelationship }>
  onSelect: (id: string) => void
  onFocus: () => void
  onExpand: () => void
  onImpact: () => void
  onTrace: () => void
  onOpenTask?: (taskId: string) => void
}): React.JSX.Element {
  const category = nodeStatusCategory(node)
  const meta = node.meta ?? {}
  const taskId = node.type === 'task' ? (meta.id as string | undefined) : undefined

  const sections: Array<{ label: string; value: string | undefined }> = []
  if (node.type === 'task') {
    sections.push({ label: 'DESCRIPTION', value: (meta.description as string | undefined) ?? undefined })
    sections.push({ label: 'STATUS', value: node.status })
    sections.push({ label: 'PRIORITY', value: (meta.priority as string | undefined) ?? undefined })
    sections.push({ label: 'CHANGED FILES', value: ((meta.files as string[] | undefined) ?? []).join('\n') || 'none' })
  } else if (node.type === 'goal') {
    sections.push({ label: 'REQUEST', value: (meta.request as string | undefined) ?? undefined })
    sections.push({ label: 'STATUS', value: node.status })
  } else if (node.type === 'memory' || node.type === 'decision') {
    sections.push({ label: 'CONTENT', value: (meta.content as string | undefined) ?? undefined })
    sections.push({ label: 'CONFIDENCE', value: node.confidence })
    sections.push({ label: 'TAGS', value: (node.tags ?? []).join(', ') || 'none' })
    sections.push({ label: 'APPROVAL', value: node.status })
  } else if (node.type === 'message') {
    sections.push({ label: 'KIND', value: meta.kind as string | undefined })
    sections.push({ label: 'TEXT', value: meta.text as string | undefined })
    sections.push({ label: 'PRIORITY', value: meta.priority as string | undefined })
  } else if (node.type === 'coworker') {
    sections.push({ label: 'ROLE', value: (meta.role as string | undefined) ?? undefined })
    sections.push({ label: 'STATE', value: node.status })
  } else if (node.type === 'file') {
    sections.push({ label: 'PATH', value: (meta.path as string | undefined) ?? undefined })
  } else if (node.type === 'question') {
    sections.push({ label: 'WHY', value: (meta.why as string | undefined) ?? undefined })
    sections.push({ label: 'STATE', value: node.status })
  } else if (node.type === 'commit') {
    sections.push({ label: 'COMMAND', value: meta.command as string | undefined })
  } else if (node.type === 'project') {
    sections.push({ label: 'PATH', value: (meta.path as string | undefined) ?? undefined })
  }

  return (
    <div className="graph-node-detail">
      <div className="graph-node-detail-head">
        <span className="graph-node-dot" style={{ background: NODE_TYPE_COLORS[node.type] }} />
        <span className="graph-node-detail-title">{node.label}</span>
        <span className="graph-status-chip" style={{ background: STATUS_CATEGORY_COLORS[category] }} title={STATUS_CATEGORY_LABELS[category]} />
      </div>
      <span className="graph-node-detail-type">
        {NODE_TYPE_LABELS[node.type]} · {STATUS_CATEGORY_LABELS[category]}
      </span>
      {sections.map(
        (section) =>
          section.value && (
            <div key={section.label} className="graph-detail-section">
              <span className="graph-detail-label">{section.label}</span>
              <pre className="graph-detail-value">{section.value}</pre>
            </div>
          )
      )}
      <div className="graph-node-actions">
        {onOpenTask && taskId && (
          <button className="btn btn-small" onClick={() => onOpenTask(taskId)}>
            Open task
          </button>
        )}
        <button className="btn btn-small" onClick={onFocus}>
          Focus
        </button>
        <button className="btn btn-small" onClick={onExpand}>
          Expand
        </button>
        <button className="btn btn-small" onClick={onImpact}>
          Impact
        </button>
        <button className="btn btn-small" onClick={onTrace}>
          Trace
        </button>
      </div>
      {neighbours.length > 0 && (
        <div className="graph-neighbours">
          <span className="graph-detail-label">CONNECTED TO ({neighbours.length})</span>
          <div className="graph-neighbour-list">
            {neighbours.map((n) => (
              <button key={n.rel.id} className="graph-neighbour" onClick={() => onSelect(n.otherId)}>
                <span className="graph-neighbour-label">{n.label}</span>
                <span className="graph-neighbour-rel">{n.rel.type}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EdgeDetail({
  rel,
  nodes,
  persisted,
  onConfirm,
  onDelete
}: {
  rel: GraphRelationship
  nodes: GraphNode[]
  persisted: boolean
  onConfirm: (rel: GraphRelationship) => void
  onDelete: (rel: GraphRelationship) => void
}): React.JSX.Element {
  const source = nodes.find((n) => n.id === rel.source)
  const target = nodes.find((n) => n.id === rel.target)
  return (
    <div className="graph-edge-detail">
      <div className="graph-node-detail-head">
        <span className="graph-node-dot" style={{ background: relationshipLineColor(rel) }} />
        <span className="graph-node-detail-title">
          {source ? nodeLabel(source, 22) : rel.source} {rel.type} {target ? nodeLabel(target, 22) : rel.target}
        </span>
      </div>
      <div className="graph-detail-section">
        <span className="graph-detail-label">AUTHORITY</span>
        <pre className="graph-detail-value">{rel.status}</pre>
      </div>
      <div className="graph-detail-section">
        <span className="graph-detail-label">EVIDENCE</span>
        <pre className="graph-detail-value">{rel.evidence ?? 'No recorded evidence.'}</pre>
      </div>
      <div className="graph-detail-section">
        <span className="graph-detail-label">WHEN</span>
        <pre className="graph-detail-value">{new Date(rel.createdAt).toLocaleString()}</pre>
      </div>
      {rel.confidence != null && (
        <div className="graph-detail-section">
          <span className="graph-detail-label">CONFIDENCE</span>
          <pre className="graph-detail-value">{Math.round(rel.confidence * 100)}%</pre>
        </div>
      )}
      <div className="graph-node-actions">
        {persisted && rel.status !== 'user-confirmed' && (
          <button className="btn btn-small" onClick={() => onConfirm(rel)}>
            Mark confirmed
          </button>
        )}
        {persisted && (
          <button className="btn btn-small btn-danger" onClick={() => onDelete(rel)}>
            Delete
          </button>
        )}
        {!persisted && <span className="graph-detail-note">Derived from application records.</span>}
      </div>
    </div>
  )
}