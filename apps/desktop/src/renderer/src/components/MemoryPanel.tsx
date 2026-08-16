import { useState } from 'react'
import { CloseIcon } from './ChromeIcon'
import { useOfficeStore } from '../office/store'

interface MemoryPanelProps {
  onClose: () => void
}

export function MemoryPanel({ onClose }: MemoryPanelProps): React.JSX.Element {
  const agents = useOfficeStore((s) => s.agents)
  const memory = useOfficeStore((s) => s.memory)
  const addMemory = useOfficeStore((s) => s.addMemory)
  const removeMemory = useOfficeStore((s) => s.removeMemory)
  const [filter, setFilter] = useState<string>('all')
  const [draft, setDraft] = useState('')

  const notes = filter === 'all' ? memory : memory.filter((n) => n.agentId === filter)

  const save = (): void => {
    const text = draft.trim()
    if (!text) {
      return
    }
    addMemory(filter === 'all' ? Object.values(agents)[0]?.id ?? '' : filter, text)
    setDraft('')
  }

  const agentName = (agentId: string): string => agents[agentId]?.name ?? '—'

  return (
    <div className="wizard-overlay" role="dialog" aria-modal="true" aria-label="Shared memory">
      <div className="memory-panel-card">
        <div className="wizard-header">
          <h2 className="wizard-title">SHARED MEMORY</h2>
          <button className="btn-icon" onClick={onClose} title="Close" aria-label="Close">
            <CloseIcon className="icon-btn" />
          </button>
        </div>
        <div className="cc-panel-tools">
          <label className="field-label" htmlFor="mem-filter">
            For
          </label>
          <select
            id="mem-filter"
            className="text-input select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Everyone</option>
            {Object.values(agents).map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <input
            className="text-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                save()
              }
            }}
            placeholder="Add to shared memory…"
          />
          <button className="btn btn-small" onClick={save} disabled={filter === 'all'}>
            Save
          </button>
        </div>
        <div className="memory-list memory-panel-list">
          {notes.length === 0 && <p className="cc-placeholder">No notes yet.</p>}
          {notes.map((note) => (
            <div key={note.id} className="memory-item">
              <span className="memory-agent">{agentName(note.agentId)}</span>
              <span className="memory-text">{note.text}</span>
              <span className="memory-ts">{new Date(note.ts).toLocaleTimeString()}</span>
              <button
                className="btn-icon btn-icon-small"
                onClick={() => removeMemory(note.id)}
                title="Remove note"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}