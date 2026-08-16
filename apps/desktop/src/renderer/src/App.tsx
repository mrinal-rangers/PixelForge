import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { OfficeCanvas } from './components/OfficeCanvas'
import { CommandCenter } from './components/CommandCenter'
import { AddAgentWizard } from './components/AddAgentWizard'
import { GemLogo } from './components/GemLogo'
import { MoonIcon, SunIcon } from './components/ThemeIcon'
import { FullscreenIcon, SettingsIcon, PlusIcon } from './components/ChromeIcon'
import { useOfficeStore } from './office/store'
import type { CliInfo } from '@shared/types'

const VERSION = 'v0.4.3'

type Theme = 'dark' | 'light'
const THEME_KEY = 'pixelforge-theme'

function App(): React.JSX.Element {
  const [clis, setClis] = useState<CliInfo[]>([])
  const [wizardOpen, setWizardOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
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
    const unsubscribe = window.workspace.onSessionStatus(({ session }) => {
      useOfficeStore.getState().upsertAgent(session)
    })
    return unsubscribe
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

  const resetWorkspace = useCallback(() => {
    const { agents: current, removeAgent } = useOfficeStore.getState()
    for (const agent of Object.values(current)) {
      if (agent.cliId) {
        window.workspace.stopSession(agent.id)
      }
      removeAgent(agent.id)
    }
    setSettingsOpen(false)
  }, [])

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
            className="auto-pill"
            onClick={() => setWizardOpen(true)}
            title="Add a coworker"
          >
            <span className="theme-icon" aria-hidden="true">
              <PlusIcon className="chrome-svg" />
            </span>
            ADD
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
            onClick={() => window.workspace.toggleFullscreen()}
            title="Toggle fullscreen"
          >
            <span className="theme-icon" aria-hidden="true">
              <FullscreenIcon className="chrome-svg" />
            </span>
          </button>
          <div className="settings-wrap">
            <button
              className="theme-toggle"
              onClick={() => setSettingsOpen((open) => !open)}
              title="Settings"
            >
              <span className="theme-icon" aria-hidden="true">
                <SettingsIcon className="chrome-svg" />
              </span>
            </button>
            {settingsOpen && (
              <div className="settings-popover">
                <button
                  className="settings-item settings-danger"
                  onClick={resetWorkspace}
                  disabled={agents.length === 0}
                >
                  <span>Reset workspace</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="workspace-main">
        <div className="main-left">
          <section className="office-panel">
            <OfficeCanvas />
          </section>
        </div>
        <div className="command-resizer" onPointerDown={startResize} title="Drag to resize" />
        <section className="command-panel" style={{ width: commandWidth }}>
          {selectedId ? (
            <CommandCenter key={selectedId} agentId={selectedId} clis={clis} terminalSizeRef={terminalSizeRef} />
          ) : (
            <div className="command-center">
              <div className="cc-empty">
                <span className="cc-empty-glyph">+</span>
                <p>No coworker selected.</p>
                <button className="btn btn-primary" onClick={() => setWizardOpen(true)}>
                  Add Agent
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {wizardOpen && (
        <AddAgentWizard clis={clis} terminalSize={terminalSizeRef.current} onClose={() => setWizardOpen(false)} />
      )}
    </div>
  )
}

export default App