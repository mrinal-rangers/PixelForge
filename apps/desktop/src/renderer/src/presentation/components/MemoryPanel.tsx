import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type {
  MemoryApproval,
  MemoryConfidence,
  MemoryRecord,
  MemorySource,
  MemoryType,
  MemoryVisibility
} from '@shared/types'
import { useMemoryStore } from '../../application/state/memoryStore'
import { filterMemories, sourceLabel, containsSecret } from '@shared/rules/memory'
import { proposeMemory } from '../../application/services/memoryEngine'
import { useOfficeStore } from '../../application/state/officeStore'

interface MemoryPanelProps {
  onOpenTask?: (taskId: string) => void
}

const TYPE_LABELS: Record<MemoryType, string> = {
  user: 'USER',
  project: 'PROJECT',
  decision: 'DECISION',
  task: 'TASK',
  coworker: 'COWORKER',
  temporary: 'TEMP'
}

const TYPE_ORDER: MemoryType[] = ['user', 'project', 'decision', 'task', 'coworker', 'temporary']

function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path
}

function shortDate(ts?: number): string {
  return ts ? new Date(ts).toLocaleDateString() : '—'
}

export function MemoryPanel({ onOpenTask }: MemoryPanelProps): React.JSX.Element {
  const memories = useMemoryStore(useShallow((s) => Object.values(s.memories)))
  const [search, setSearch] = useState('')
  const [types, setTypes] = useState<Set<string>>(new Set())
  const [projectPath, setProjectPath] = useState('')
  const [visibility, setVisibility] = useState('')
  const [confidence, setConfidence] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [pendingOnly, setPendingOnly] = useState(false)
  const [conflictsOnly, setConflictsOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<MemoryRecord | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)

  const projects = useMemo(
    () =>
      [...new Set(memories.map((m) => m.projectPath).filter((p): p is string => Boolean(p)))],
    [memories]
  )

  const filtered = useMemo(
    () =>
      filterMemories(memories, {
        search,
        types,
        projectPath: projectPath || undefined,
        visibility: visibility || undefined,
        confidence: confidence || undefined,
        showArchived,
        pendingOnly,
        conflictsOnly
      }).sort((a, b) => b.updatedAt - a.updatedAt),
    [memories, search, types, projectPath, visibility, confidence, showArchived, pendingOnly, conflictsOnly]
  )

  const pendingCount = memories.filter((m) => m.approval === 'pending').length
  const conflictCount = memories.filter((m) => m.conflictOf).length
  const selected = selectedId ? memories.find((m) => m.id === selectedId) ?? null : null
  const autoCreate = useMemoryStore(useShallow((s) => s.autoCreate))

  const toggleType = (type: string): void => {
    setTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const exportAll = async (): Promise<void> => {
    const path = await useMemoryStore.getState().exportAll()
    setExportMessage(path ? `Exported to ${path}` : memories.length === 0 ? 'No memories to export.' : 'Export cancelled.')
  }

  const deleteProject = (): void => {
    if (!projectPath) {
      return
    }
    for (const memory of memories) {
      if (memory.projectPath === projectPath) {
        useMemoryStore.getState().removeMemory(memory.id)
      }
    }
  }

  return (
    <div className="cc-panel">
      <div className="cc-panel-tools">
        <span className="section-desc">{memories.length} memories</span>
        <button
          className={`btn btn-small ${autoCreate ? 'btn-primary' : ''}`}
          onClick={() => useMemoryStore.getState().toggleAutoCreate()}
          title="When on, completed tasks and user decisions are remembered automatically."
        >
          Auto {autoCreate ? 'ON' : 'OFF'}
        </button>
        {pendingCount > 0 && (
          <button
            className={`btn btn-small ${pendingOnly ? 'btn-primary' : ''}`}
            onClick={() => setPendingOnly((prev) => !prev)}
          >
            Pending ({pendingCount})
          </button>
        )}
        {conflictCount > 0 && (
          <button
            className={`btn btn-small ${conflictsOnly ? 'btn-primary' : ''}`}
            onClick={() => setConflictsOnly((prev) => !prev)}
          >
            Conflicts ({conflictCount})
          </button>
        )}
        <button className="btn btn-small" onClick={() => void exportAll()}>
          Export
        </button>
        <button className="btn btn-small btn-danger" onClick={() => setConfirmClear(true)}>
          Clear All
        </button>
        <button
          className="btn btn-primary btn-small"
          onClick={() => {
            setEditing(null)
            setEditorOpen(true)
          }}
        >
          + Add Memory
        </button>
      </div>

      <div className="memory-search-row">
        <input
          className="text-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search memories, tags, projects, coworkers…"
        />
      </div>

      <div className="memory-filter-row">
        <button
          className={`memory-chip ${types.size === 0 ? 'active' : ''}`}
          onClick={() => setTypes(new Set())}
        >
          ALL
        </button>
        {TYPE_ORDER.map((type) => (
          <button
            key={type}
            className={`memory-chip ${types.has(type) ? 'active' : ''}`}
            onClick={() => toggleType(type)}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <div className="memory-filter-row second">
        <select
          className="text-input select"
          value={projectPath}
          onChange={(e) => setProjectPath(e.target.value)}
        >
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project} value={project}>
              {basename(project)}
            </option>
          ))}
        </select>
        <select
          className="text-input select"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
        >
          <option value="">All visibility</option>
          <option value="public">Public</option>
          <option value="team">Team</option>
          <option value="private">Private</option>
        </select>
        <select
          className="text-input select"
          value={confidence}
          onChange={(e) => setConfidence(e.target.value)}
        >
          <option value="">All confidence</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <label className="goal-pref">
          <input type="checkbox" checked={showArchived} onChange={() => setShowArchived((prev) => !prev)} />
          archived
        </label>
        {projectPath && (
          <button
            className="btn btn-small btn-danger"
            onClick={deleteProject}
            title={`Delete all memories for ${projectPath}`}
          >
            Delete project
          </button>
        )}
      </div>

      {exportMessage && <p className="memory-export-note">{exportMessage}</p>}

      {confirmClear && (
        <div className="goal-confirm">
          <p>Delete ALL memories? This cannot be undone.</p>
          <div className="cc-actions">
            <button
              className="btn btn-danger btn-small"
              onClick={() => {
                void useMemoryStore.getState().clearAll().then(() => setConfirmClear(false))
              }}
            >
              Delete All
            </button>
            <button className="btn btn-small" onClick={() => setConfirmClear(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {selected ? (
        <MemoryDetail
          memory={selected}
          all={memories}
          onClose={() => setSelectedId(null)}
          onEdit={(memory) => {
            setEditing(memory)
            setEditorOpen(true)
          }}
          onOpenTask={onOpenTask}
        />
      ) : (
        <div className="memory-list">
          {filtered.length === 0 && (
            <p className="cc-placeholder">No memories match. Add the first one.</p>
          )}
          {filtered.map((memory) => (
            <MemoryCard key={memory.id} memory={memory} onClick={() => setSelectedId(memory.id)} />
          ))}
        </div>
      )}

      {editorOpen && (
        <MemoryEditor
          memory={editing}
          onClose={() => {
            setEditorOpen(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function MemoryCard({ memory, onClick }: { memory: MemoryRecord; onClick: () => void }): React.JSX.Element {
  const snippet = memory.content.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 2).join(' ')
  return (
    <button className={`memory-card memory-${memory.type}`} onClick={onClick}>
      <div className="memory-card-head">
        <span className="memory-card-title">{memory.title}</span>
        {memory.pinned && <span className="memory-flag" title="Pinned">📌</span>}
        {memory.unreliable && <span className="memory-flag" title="Marked unreliable">⚠</span>}
        {memory.approval === 'pending' && <span className="memory-flag pending" title="Awaiting approval">?</span>}
        {memory.conflictOf && <span className="memory-flag conflict" title="Conflicting memory">!</span>}
      </div>
      {snippet && <span className="memory-card-snippet">{snippet}</span>}
      <div className="memory-card-meta">
        <span className={`memory-type-badge memory-type-${memory.type}`}>{TYPE_LABELS[memory.type]}</span>
        {memory.projectPath && <span className="memory-meta-item">{basename(memory.projectPath)}</span>}
        <span className="memory-meta-item">{sourceLabel(memory.source)}</span>
        <span className="memory-meta-item">{shortDate(memory.createdAt)}</span>
        <span className={`memory-meta-item confidence-${memory.confidence}`}>{memory.confidence}</span>
        {memory.lastUsedAt && <span className="memory-meta-item">used {shortDate(memory.lastUsedAt)}</span>}
      </div>
      {memory.tags.length > 0 && (
        <div className="memory-tags">
          {memory.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="memory-tag">{tag}</span>
          ))}
        </div>
      )}
    </button>
  )
}

function MemoryDetail({
  memory,
  all,
  onClose,
  onEdit,
  onOpenTask
}: {
  memory: MemoryRecord
  all: MemoryRecord[]
  onClose: () => void
  onEdit: (memory: MemoryRecord) => void
  onOpenTask?: (taskId: string) => void
}): React.JSX.Element {
  const updateMemory = useMemoryStore((s) => s.updateMemory)
  const approve = useMemoryStore((s) => s.approveMemory)
  const reject = useMemoryStore((s) => s.rejectMemory)
  const remove = useMemoryStore((s) => s.removeMemory)
  const merge = useMemoryStore((s) => s.mergeInto)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const duplicates = useMemo(
    () =>
      all.filter(
        (other) =>
          other.id !== memory.id &&
          !other.archived &&
          other.type === memory.type &&
          (!other.projectPath || other.projectPath === memory.projectPath)
      ),
    [all, memory]
  )

  const conflict = memory.conflictOf ? all.find((m) => m.id === memory.conflictOf) : undefined

  return (
    <div className="memory-detail">
      <div className="cc-panel-tools">
        <span className="section-desc">MEMORY DETAIL</span>
        <button className="btn btn-small" onClick={onClose}>
          Back
        </button>
      </div>

      <div className="memory-detail-head">
        <span className="memory-detail-title">{memory.title}</span>
        <span className={`memory-type-badge memory-type-${memory.type}`}>{TYPE_LABELS[memory.type]}</span>
        {memory.pinned && <span className="memory-flag">pinned</span>}
        {memory.archived && <span className="memory-flag">archived</span>}
        {memory.unreliable && <span className="memory-flag">unreliable</span>}
      </div>

      {conflict && (
        <div className="memory-conflict-banner">
          Conflicts with existing memory: <strong>{conflict.title}</strong> ({sourceLabel(conflict.source)},{' '}
          {shortDate(conflict.createdAt)}, {conflict.confidence} confidence). Approving this memory archives the
          existing one.
        </div>
      )}

      <pre className="memory-detail-content">{memory.content}</pre>

      <div className="memory-detail-grid">
        <div>
          <span className="memory-detail-label">SOURCE</span>
          <span className="memory-detail-value">{sourceLabel(memory.source)}</span>
        </div>
        <div>
          <span className="memory-detail-label">CREATED</span>
          <span className="memory-detail-value">{new Date(memory.createdAt).toLocaleString()}</span>
        </div>
        <div>
          <span className="memory-detail-label">UPDATED</span>
          <span className="memory-detail-value">{new Date(memory.updatedAt).toLocaleString()}</span>
        </div>
        <div>
          <span className="memory-detail-label">CREATED BY</span>
          <span className="memory-detail-value">{memory.createdBy}</span>
        </div>
        <div>
          <span className="memory-detail-label">PROJECT</span>
          <span className="memory-detail-value">{memory.projectPath ? basename(memory.projectPath) : '—'}</span>
        </div>
        <div>
          <span className="memory-detail-label">VISIBILITY</span>
          <select
            className="text-input select"
            value={memory.visibility}
            onChange={(e) =>
              updateMemory(memory.id, { visibility: e.target.value as MemoryVisibility }, 'visibility changed')
            }
          >
            <option value="public">public</option>
            <option value="team">team</option>
            <option value="private">private</option>
          </select>
        </div>
        <div>
          <span className="memory-detail-label">CONFIDENCE</span>
          <select
            className="text-input select"
            value={memory.confidence}
            onChange={(e) =>
              updateMemory(memory.id, { confidence: e.target.value as MemoryConfidence }, 'confidence changed')
            }
          >
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
          </select>
        </div>
        <div>
          <span className="memory-detail-label">APPROVAL</span>
          <span className="memory-detail-value">{memory.approval}</span>
        </div>
      </div>

      {memory.relatedTaskId && (
        <p className="memory-detail-link">
          Related task: <strong>{memory.relatedTaskId.slice(0, 8)}</strong>
          {onOpenTask && (
            <button className="btn btn-small" onClick={() => onOpenTask(memory.relatedTaskId as string)}>
              Open
            </button>
          )}
        </p>
      )}
      {memory.relatedGoalId && (
        <p className="memory-detail-link">Related goal: <strong>{memory.relatedGoalId.slice(0, 8)}</strong></p>
      )}
      {memory.relatedAgentId && (
        <p className="memory-detail-link">Related coworker: <strong>{memory.relatedAgentId}</strong></p>
      )}

      <div className="memory-detail-label">TAGS</div>
      <div className="memory-tags">
        {memory.tags.length === 0 && <span className="cc-placeholder">No tags.</span>}
        {memory.tags.map((tag) => (
          <span key={tag} className="memory-tag">{tag}</span>
        ))}
      </div>

      {memory.expiration && memory.expiration.rule !== 'none' && (
        <p className="memory-detail-link">
          Expiration: {memory.expiration.rule === 'goal' ? 'when the related goal finishes' : `date ${shortDate(memory.expiration.date)}`}
        </p>
      )}

      {memory.usage.length > 0 && (
        <>
          <div className="memory-detail-label">USED BY ({memory.usage.length})</div>
          <div className="memory-usage-list">
            {memory.usage.slice(-6).map((usage, index) => (
              <div key={index} className="memory-usage-item">
                <span>{usage.taskId.slice(0, 8)}</span>
                <span>{usage.agentId ?? 'orchestrator'}</span>
                <span>{shortDate(usage.ts)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {memory.revisions.length > 0 && (
        <>
          <div className="memory-detail-label">EDIT HISTORY ({memory.revisions.length})</div>
          <div className="memory-revision-list">
            {memory.revisions.slice(-5).reverse().map((revision) => (
              <div key={revision.id} className="memory-revision-item">
                <span className="memory-revision-reason">{revision.reason}</span>
                <span className="memory-revision-ts">{shortDate(revision.ts)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {duplicates.length > 0 && (
        <>
          <div className="memory-detail-label">POSSIBLE DUPLICATES</div>
          <div className="memory-dup-list">
            {duplicates.slice(0, 5).map((other) => (
              <div key={other.id} className="memory-dup-item">
                <span>{other.title}</span>
                <button className="btn btn-small" onClick={() => merge(memory.id, other.id)}>
                  Merge here
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="cc-actions memory-detail-actions">
        {memory.approval === 'pending' && (
          <>
            <button className="btn btn-primary btn-small" onClick={() => approve(memory.id)}>
              Approve
            </button>
            <button className="btn btn-small" onClick={() => reject(memory.id)}>
              Reject
            </button>
          </>
        )}
        <button className="btn btn-small" onClick={() => onEdit(memory)}>
          Edit
        </button>
        <button
          className="btn btn-small"
          onClick={() =>
            updateMemory(memory.id, { pinned: !memory.pinned }, memory.pinned ? 'unpinned' : 'pinned')
          }
        >
          {memory.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button
          className="btn btn-small"
          onClick={() =>
            updateMemory(memory.id, { archived: !memory.archived }, memory.archived ? 'restored' : 'archived')
          }
        >
          {memory.archived ? 'Restore' : 'Archive'}
        </button>
        <button
          className="btn btn-small"
          onClick={() => updateMemory(memory.id, { unreliable: !memory.unreliable }, 'marked unreliable status')}
        >
          {memory.unreliable ? 'Mark reliable' : 'Mark unreliable'}
        </button>
        {!confirmDelete ? (
          <button className="btn btn-small btn-danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        ) : (
          <>
            <button className="btn btn-danger btn-small" onClick={() => remove(memory.id)}>
              Confirm Delete
            </button>
            <button className="btn btn-small" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function MemoryEditor({ memory, onClose }: { memory: MemoryRecord | null; onClose: () => void }): React.JSX.Element {
  const updateMemory = useMemoryStore((s) => s.updateMemory)
  const workers = useOfficeStore(
    useShallow((s) => Object.values(s.agents).filter((a) => a.id !== s.managerId))
  )
  const [title, setTitle] = useState(memory?.title ?? '')
  const [content, setContent] = useState(memory?.content ?? '')
  const [type, setType] = useState<MemoryType>(memory?.type ?? 'project')
  const [tags, setTags] = useState((memory?.tags ?? []).join(', '))
  const [confidence, setConfidence] = useState<MemoryConfidence>(memory?.confidence ?? 'medium')
  const [visibility, setVisibility] = useState<MemoryVisibility>(memory?.visibility ?? 'team')
  const [relatedAgentId, setRelatedAgentId] = useState(memory?.relatedAgentId ?? '')
  const [approval, setApproval] = useState<MemoryApproval>(memory?.approval ?? 'approved')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const secretWarning = content && containsSecret(content)

  const save = async (): Promise<void> => {
    const trimmedTitle = title.trim()
    const trimmedContent = content.trim()
    if (!trimmedTitle || !trimmedContent) {
      setError('Title and content are required.')
      return
    }
    setBusy(true)
    const tagList = tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    if (memory) {
      updateMemory(memory.id, { title: trimmedTitle, content: trimmedContent }, 'edited by user')
      setBusy(false)
      onClose()
      return
    }
    const created = await proposeMemory({
      title: trimmedTitle,
      content: trimmedContent,
      type,
      projectPath: undefined,
      relatedAgentId: relatedAgentId || undefined,
      source: { kind: 'manual' } as MemorySource,
      createdBy: 'user',
      confidence,
      tags: tagList,
      visibility,
      approval
    })
    setBusy(false)
    if (!created) {
      setError('Could not save the memory.')
      return
    }
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card goal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{memory ? 'EDIT MEMORY' : 'ADD MEMORY'}</h2>
          <button className="btn-icon" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        <div className="task-modal-scroll goal-modal-scroll">
          <div className="field-row">
            <label className="field-label" htmlFor="mem-title">
              Title
            </label>
            <input
              id="mem-title"
              className="text-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Database is PostgreSQL"
            />
          </div>
          <div className="field-row">
            <label className="field-label" htmlFor="mem-content">
              Content (Markdown)
            </label>
            <textarea
              id="mem-content"
              className="text-input textarea"
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="The frontend is in /apps/web; integration tests run with npm run test:integration."
            />
          </div>
          {secretWarning && (
            <p className="memory-secret-warning">
              This content looks like it may contain credentials or tokens. Secrets are never stored in
              memory.
            </p>
          )}
          <div className="field-row field-grid-3">
            <div className="field-sub">
              <label className="field-label" htmlFor="mem-type">
                Type
              </label>
              <select
                id="mem-type"
                className="text-input select"
                value={type}
                onChange={(e) => setType(e.target.value as MemoryType)}
              >
                {TYPE_ORDER.map((entry) => (
                  <option key={entry} value={entry}>{TYPE_LABELS[entry]}</option>
                ))}
              </select>
            </div>
            <div className="field-sub">
              <label className="field-label" htmlFor="mem-conf">
                Confidence
              </label>
              <select
                id="mem-conf"
                className="text-input select"
                value={confidence}
                onChange={(e) => setConfidence(e.target.value as MemoryConfidence)}
              >
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
              </select>
            </div>
            <div className="field-sub">
              <label className="field-label" htmlFor="mem-vis">
                Visibility
              </label>
              <select
                id="mem-vis"
                className="text-input select"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as MemoryVisibility)}
              >
                <option value="public">public</option>
                <option value="team">team</option>
                <option value="private">private</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <label className="field-label" htmlFor="mem-tags">
              Tags (comma separated)
            </label>
            <input
              id="mem-tags"
              className="text-input"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="postgres, architecture, build"
            />
          </div>
          <div className="field-row">
            <label className="field-label" htmlFor="mem-agent">
              Related coworker
            </label>
            <select
              id="mem-agent"
              className="text-input select"
              value={relatedAgentId}
              onChange={(e) => setRelatedAgentId(e.target.value)}
            >
              <option value="">None</option>
              {workers.map((worker) => (
                <option key={worker.id} value={worker.id}>{worker.name}</option>
              ))}
            </select>
          </div>
          {!memory && (
            <div className="field-row">
              <label className="field-label" htmlFor="mem-approval">
                Classification
              </label>
              <select
                id="mem-approval"
                className="text-input select"
                value={approval}
                onChange={(e) => setApproval(e.target.value as MemoryApproval)}
              >
                <option value="approved">Save automatically</option>
                <option value="pending">Save with user approval</option>
                <option value="temporary">Keep temporarily</option>
              </select>
            </div>
          )}
          {error && <span className="session-error">{error}</span>}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy || !title.trim() || !content.trim()}>
            {busy ? 'Saving…' : memory ? 'Save Changes' : 'Save Memory'}
          </button>
        </div>
      </div>
    </div>
  )
}