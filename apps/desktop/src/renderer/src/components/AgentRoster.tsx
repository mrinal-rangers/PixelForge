import { useMemo } from 'react'
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

export function AgentRoster({ onAdd }: AgentRosterProps): React.JSX.Element {
  const agents = useOfficeStore(useShallow((s) => Object.values(s.agents)))
  const selectedId = useOfficeStore((s) => s.selectedId)
  const managerId = useOfficeStore((s) => s.managerId)
  const requestFocus = useOfficeStore((s) => s.requestFocus)

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

  return (
    <div className="agent-roster">
      <span className="roster-title">
        CREW <span className="roster-count">{developerCount}/10</span>
      </span>
      <div className="roster-scroll">
        {sorted.map((agent) => {
          const avatar = getAvatar(agent.avatarId ?? '') ?? DEFAULT_COWORKER
          return (
            <div
              key={agent.id}
              className={`roster-card ${agent.id === selectedId ? 'selected' : ''} ${agent.id === managerId ? 'manager' : ''}`}
              style={agent.id === selectedId ? { borderColor: agent.accent ?? undefined } : undefined}
              onClick={() => requestFocus(agent.id)}
            >
              <MiniAvatar spec={avatar} scale={1} className="roster-avatar" />
              <div className="roster-meta">
                <span className="roster-name">{agent.name}</span>
                <span className="roster-role">{agent.role}</span>
              </div>
              <span className="roster-dot" style={{ backgroundColor: statusColor(agent) }} />
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
          )
        })}
      </div>
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