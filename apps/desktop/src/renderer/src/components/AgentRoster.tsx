import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { MiniAvatar } from './MiniAvatar'
import { PlusIcon } from './ChromeIcon'
import { getAvatar } from '../office/characters'
import { DEFAULT_COWORKER } from '../office/characters'
import { useOfficeStore } from '../office/store'
import type { OfficeAgentRecord } from '../office/store'

interface AgentRosterProps {
  onAdd: () => void
}

function statusColor(agent: OfficeAgentRecord): string {
  if (agent.status === 'error') {
    return '#ff4d5e'
  }
  if (agent.promptPending && agent.status === 'running') {
    return '#ffcc33'
  }
  if (agent.status === 'running' || agent.status === 'starting') {
    return '#3ad95e'
  }
  return '#9aa6cf'
}

function projectName(projectPath?: string): string {
  if (!projectPath) {
    return 'no project'
  }
  return projectPath.split(/[/\\]/).filter(Boolean).pop() ?? projectPath
}

export function AgentRoster({ onAdd }: AgentRosterProps): React.JSX.Element {
  const agents = useOfficeStore(useShallow((s) => Object.values(s.agents)))
  const selectedId = useOfficeStore((s) => s.selectedId)
  const managerId = useOfficeStore((s) => s.managerId)
  const requestFocus = useOfficeStore((s) => s.requestFocus)
  const updateAgentMeta = useOfficeStore((s) => s.updateAgentMeta)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')

  const sorted = useMemo(() => {
    const list = [...agents].sort((a, b) => a.name.localeCompare(b.name))
    if (managerId) {
      const idx = list.findIndex((agent) => agent.id === managerId)
      if (idx > 0) {
        const [manager] = list.splice(idx, 1)
        list.unshift(manager)
      }
    }
    return list
  }, [agents, managerId])

  const developerCount = agents.length - (managerId ? 1 : 0)
  const canAdd = developerCount < 10

  const remove = (agent: OfficeAgentRecord): void => {
    if (agent.id === managerId) {
      return
    }
    if (agent.cliId) {
      window.workspace.stopSession(agent.id)
    }
    useOfficeStore.getState().removeAgent(agent.id)
  }

  const stop = (agent: OfficeAgentRecord): void => {
    window.workspace.stopSession(agent.id)
  }

  const beginEdit = (agent: OfficeAgentRecord): void => {
    setEditingId(agent.id)
    setEditName(agent.name)
    setEditRole(agent.role)
  }

  const saveEdit = (id: string): void => {
    updateAgentMeta(id, {
      name: editName.trim() || undefined,
      role: editRole.trim() || undefined
    })
    setEditingId(null)
  }

  return (
    <div className="agent-roster">
      <span className="roster-title">
        CREW <span className="roster-count">{developerCount}/10</span>
      </span>
      <div className="roster-scroll">
        {sorted.map((agent) => {
          const avatar = getAvatar(agent.avatarId ?? '') ?? DEFAULT_COWORKER
          const attention = agent.promptPending && agent.status === 'running'
          return (
            <div key={agent.id} className="roster-card-wrap">
              <div
                className={`roster-card ${agent.id === selectedId ? 'selected' : ''} ${agent.id === managerId ? 'manager' : ''}`}
                style={agent.id === selectedId ? { borderColor: agent.accent ?? undefined } : undefined}
                onClick={() => requestFocus(agent.id)}
              >
                <MiniAvatar spec={avatar} scale={1} className="roster-avatar" />
                <div className="roster-meta">
                  <span className="roster-name">{agent.name}</span>
                  <span className="roster-role">
                    {agent.role} · {projectName(agent.projectPath)}
                  </span>
                </div>
                {attention && (
                  <span className="roster-attention" title="Needs input">
                    ?
                  </span>
                )}
                <span
                  className="roster-dot"
                  style={{ backgroundColor: statusColor(agent) }}
                  title={agent.status}
                />
                {(agent.status === 'running' || agent.status === 'starting') && agent.id !== managerId && (
                  <button
                    className="roster-control"
                    onClick={(e) => {
                      e.stopPropagation()
                      stop(agent)
                    }}
                    title="Stop coworker"
                    aria-label={`Stop ${agent.name}`}
                  >
                    ■
                  </button>
                )}
                {agent.id !== managerId && (
                  <button
                    className="roster-control"
                    onClick={(e) => {
                      e.stopPropagation()
                      beginEdit(agent)
                    }}
                    title="Edit coworker"
                    aria-label={`Edit ${agent.name}`}
                  >
                    ✎
                  </button>
                )}
                {agent.id !== managerId && (
                  <button
                    className="roster-remove"
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(agent)
                    }}
                    title="Remove coworker"
                    aria-label={`Remove ${agent.name}`}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {editingId && (
        <div className="roster-edit">
          <span className="roster-edit-title">EDIT COWORKER</span>
          <input
            className="text-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Name"
          />
          <input
            className="text-input"
            value={editRole}
            onChange={(e) => setEditRole(e.target.value)}
            placeholder="Role"
          />
          <button className="btn btn-small" onClick={() => saveEdit(editingId)}>
            Save
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => setEditingId(null)}>
            Cancel
          </button>
        </div>
      )}
      <button
        className="roster-add"
        onClick={onAdd}
        disabled={!canAdd}
        title={canAdd ? 'Add agent' : 'Maximum of 10 developers reached'}
      >
        <PlusIcon className="icon-btn" />
        <span>{canAdd ? 'Add' : 'Full'}</span>
      </button>
    </div>
  )
}