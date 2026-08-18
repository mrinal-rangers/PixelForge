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
import { useOfficeStore } from '../application/state/officeStore'
import { initApplication } from '../application/bootstrap'
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
    initApplication({ onSessionsLoaded: () => setSessionsLoaded(true) })
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

export default App