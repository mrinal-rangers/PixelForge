import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { OfficeCanvas } from './components/OfficeCanvas'
import { CommandCenter } from './components/CommandCenter'
import { AddAgentWizard } from './components/AddAgentWizard'
import { AgentRoster } from './components/AgentRoster'
import { SetupWizard } from './components/SetupWizard'
import { SettingsModal } from './components/SettingsModal'
import { GemLogo } from './components/GemLogo'
import { MoonIcon, SunIcon } from './components/ThemeIcon'
import { SettingsIcon } from './components/ChromeIcon'
import { useOfficeStore } from './office/store'
import { useTaskStore } from './office/taskStore'
import { useGoalStore } from './office/goalStore'
import { useMemoryStore } from './office/memoryStore'
import { parseTaskOutput } from './office/taskEvents'
import { parseGoalOutput } from './office/goalEvents'
import { parseMemoryOutput } from './office/memoryEvents'
import { startGoalEngine } from './office/goalEngine'
import { TaskBoard } from './components/TaskBoard'
import { NotificationHost } from './components/NotificationHost'
import type { CliInfo } from '@shared/types'

const VERSION = 'v0.4.3'
const SETUP_DISMISS_KEY = 'pixelforge-setup-dismissed'

type Theme = 'dark' | 'light'
const THEME_KEY = 'pixelforge-theme'

type PanelView = 'coworker' | 'board'

function App(): React.JSX.Element {
  const [clis, setClis] = useState<CliInfo[]>([])
  const [wizardOpen, setWizardOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [setupDismissed, setSetupDismissed] = useState<boolean>(
    () => localStorage.getItem(SETUP_DISMISS_KEY) === '1'
  )
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [panelView, setPanelView] = useState<PanelView>('coworker')
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(THEME_KEY)
    return stored === 'dark' ? 'dark' : 'light'
  })
  const terminalSizeRef = useRef<{ cols: number; rows: number }>({ cols: 80, rows: 24 })
  const [commandWidth, setCommandWidth] = useState<number>(() => {
    const stored = localStorage.getItem('pixelforge-command-width')
    const parsed = stored ? parseInt(stored, 10) : 460
    return Number.isFinite(parsed) && parsed >= 340 ? parsed : 460
  })
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const agents = useOfficeStore(useShallow((s) => Object.values(s.agents)))
  const selectedId = useOfficeStore((s) => s.selectedId)
  const taskCounts = useTaskStore(useShallow((s) => {
    const list = Object.values(s.tasks)
    return {
      total: list.length,
      needsInput: list.filter((t) => t.status === 'needs-input').length,
      ongoing: list.filter((t) => t.status === 'ongoing').length
    }
  }))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const refreshClis = useCallback(() => {
    window.workspace.listCliDefs().then(setClis)
  }, [])

  useEffect(() => {
    refreshClis()
  }, [refreshClis])

  useEffect(() => {
    const unsubscribe = window.workspace.onSessionStatus(({ session }) => {
      useOfficeStore.getState().upsertAgent(session)
      const tasks = Object.values(useTaskStore.getState().tasks).filter(
        (t) => t.assignedAgentId === session.id && t.status === 'ongoing'
      )
      if (session.status === 'error') {
        for (const task of tasks) {
          useTaskStore.getState().failTask(task.id, 'The terminal process failed.')
        }
      } else if (session.status === 'stopped' || session.status === 'completed') {
        for (const task of tasks) {
          useTaskStore.getState().setStatus(task.id, 'todo')
          useTaskStore.getState().addEvent(
            task.id,
            'note',
            session.status === 'completed'
              ? 'Session ended before the task reported completion'
              : 'Terminal stopped; task paused'
          )
        }
      }
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = window.workspace.onSessionOutput(({ sessionId, data }) => {
      useOfficeStore.getState().recordOutput(sessionId, data)
      parseTaskOutput(sessionId, data)
      parseGoalOutput(sessionId, data)
      parseMemoryOutput(sessionId, data)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    void useTaskStore.getState().hydrate()
    void useGoalStore.getState().hydrate()
    void useMemoryStore.getState().hydrate()
  }, [])

  useEffect(() => {
    startGoalEngine()
  }, [])

  useEffect(() => {
    window.workspace
      .listSessions()
      .then((sessions) => {
        for (const session of sessions) {
          useOfficeStore.getState().upsertAgent(session)
        }
      })
      .catch(() => {
        // sessions list is best-effort on startup
      })
      .finally(() => {
        setSessionsLoaded(true)
      })
  }, [])

  useEffect(() => {
    window.workspace
      .listCoworkers()
      .then((configs) => {
        useOfficeStore.getState().hydrateCoworkers(configs)
      })
      .catch(() => {
        // coworker configs are best-effort on startup
      })
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  useEffect(() => {
    localStorage.setItem('pixelforge-command-width', String(commandWidth))
  }, [commandWidth])

  const startResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      resizeRef.current = { startX: e.clientX, startWidth: commandWidth }
      const onMove = (ev: PointerEvent): void => {
        const drag = resizeRef.current
        if (!drag) {
          return
        }
        const delta = drag.startX - ev.clientX
        const max = Math.max(340, window.innerWidth - 420)
        setCommandWidth(Math.max(340, Math.min(drag.startWidth + delta, max)))
      }
      const onUp = (): void => {
        resizeRef.current = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [commandWidth]
  )

  const startManager = useCallback(
    async (path: string, cliId: string) => {
      setSetupError(null)
      try {
        await window.workspace.createSession({
          projectPath: path,
          cliId,
          name: 'Manager',
          role: 'Manager',
          autoMode: true,
          cols: terminalSizeRef.current.cols,
          rows: terminalSizeRef.current.rows
        })
      } catch (err) {
        setSetupError(err instanceof Error ? err.message : String(err))
      }
    },
    []
  )

  const skipSetup = useCallback(() => {
    localStorage.setItem(SETUP_DISMISS_KEY, '1')
    setSetupDismissed(true)
  }, [])

  const showSetup = sessionsLoaded && agents.length === 0 && !setupDismissed

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <GemLogo className="brand-logo" />
          <h1>PIXELFORGE</h1>
          <span className="header-version">{VERSION}</span>
        </div>
        <div className="header-right">
          <button
            className={`theme-toggle ${panelView === 'board' ? 'active-toggle' : ''}`}
            onClick={() => setPanelView((prev) => (prev === 'board' ? 'coworker' : 'board'))}
            title="Open the shared task board"
          >
            <span className="theme-icon" aria-hidden="true">
              <TasksIcon />
            </span>
            {taskCounts.needsInput > 0 && (
              <span className="task-badge header-task-badge">{taskCounts.needsInput}</span>
            )}
          </button>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span className="theme-icon" aria-hidden="true">
              {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
            </span>
          </button>
          <button
            className="theme-toggle"
            onClick={() => setSettingsOpen(true)}
            title="General settings"
          >
            <span className="theme-icon" aria-hidden="true">
              <SettingsIcon className="chrome-svg" />
            </span>
          </button>
        </div>
      </header>

      <main className="workspace-main">
        {showSetup ? (
          <SetupWizard
            clis={clis}
            error={setupError}
            onSelectProject={async () => window.workspace.selectProject()}
            onStart={startManager}
            onSkip={skipSetup}
          />
        ) : (
          <>
            <div className="main-left">
              <section className="office-panel">
                <OfficeCanvas />
              </section>
              <AgentRoster onAdd={() => setWizardOpen(true)} />
            </div>
            <div className="command-resizer" onPointerDown={startResize} title="Drag to resize" />
            <section className="command-panel" style={{ width: commandWidth }}>
              {panelView === 'board' ? (
                <TaskBoard
                  onOpenTerminal={(agentId) => {
                    useOfficeStore.getState().requestFocus(agentId)
                    setPanelView('coworker')
                  }}
                />
              ) : selectedId ? (
                <CommandCenter
                  key={selectedId}
                  agentId={selectedId}
                  clis={clis}
                  terminalSizeRef={terminalSizeRef}
                  onOpenBoard={() => setPanelView('board')}
                />
              ) : (
                <div className="command-center">
                  <div className="cc-empty">
                    <span className="cc-empty-glyph">+</span>
                    <p>No coworker selected.</p>
                    <div className="cc-actions">
                      <button className="btn btn-primary" onClick={() => setWizardOpen(true)}>
                        Add Agent
                      </button>
                      <button className="btn" onClick={() => setPanelView('board')}>
                        Open Task Board
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {wizardOpen && (
        <AddAgentWizard clis={clis} terminalSize={terminalSizeRef.current} onClose={() => setWizardOpen(false)} />
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      <NotificationHost />
    </div>
  )
}

function TasksIcon(): React.JSX.Element {
  return (
    <svg className="chrome-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" fill="currentColor" />
      <rect x="14" y="3" width="7" height="7" fill="currentColor" opacity="0.55" />
      <rect x="3" y="14" width="7" height="7" fill="currentColor" opacity="0.55" />
      <rect x="14" y="14" width="7" height="7" fill="currentColor" />
    </svg>
  )
}

export default App