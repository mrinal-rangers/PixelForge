import { useCallback, useEffect, useRef, useState } from 'react'

import { SetupWizard } from './components/SetupWizard'
import { TerminalView } from './components/TerminalView'
import { GemLogo } from './components/GemLogo'
import { MoonIcon, SunIcon } from './components/ThemeIcon'
import type { CliInfo, SessionInfo, SessionStatus } from '@shared/types'

const STATUS_LABELS: Record<SessionStatus, string> = {
  idle: 'Idle',
  starting: 'Starting',
  running: 'Running',
  stopped: 'Stopped',
  completed: 'Completed',
  error: 'Error'
}

type Theme = 'dark' | 'light'
const THEME_KEY = 'pixelforge-theme'

function App(): React.JSX.Element {
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [clis, setClis] = useState<CliInfo[]>([])
  const [selectedCliId, setSelectedCliId] = useState<string | null>(null)
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(THEME_KEY)
    return stored === 'dark' ? 'dark' : 'light'
  })
  const terminalSizeRef = useRef<{ cols: number; rows: number }>({ cols: 80, rows: 24 })

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
    const unsubscribe = window.workspace.onSessionStatus(({ session: info }) => {
      setSession(info)
    })
    return unsubscribe
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  const selectProject = useCallback(async () => {
    const path = await window.workspace.selectProject()
    if (path) {
      setProjectPath(path)
      setError(null)
    }
  }, [])

  const startSession = useCallback(
    async (path: string) => {
      if (!path || !selectedCliId) {
        return
      }
      setError(null)
      try {
        const { sessionId } = await window.workspace.createSession({
          projectPath: path,
          cliId: selectedCliId,
          cols: terminalSizeRef.current.cols,
          rows: terminalSizeRef.current.rows
        })
        setSession({
          id: sessionId,
          status: 'starting',
          projectPath: path,
          cli: clis.find((c) => c.id === selectedCliId)!
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [selectedCliId, clis]
  )

  const stopSession = useCallback(() => {
    if (session) {
      window.workspace.stopSession(session.id)
    }
  }, [session])

  const restartSession = useCallback(() => {
    if (session) {
      window.workspace.restartSession(
        session.id,
        terminalSizeRef.current.cols,
        terminalSizeRef.current.rows
      )
    }
  }, [session])

  const closeSession = useCallback(() => {
    if (session) {
      window.workspace.stopSession(session.id)
    }
    setSession(null)
    setError(null)
  }, [session])

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <GemLogo className="brand-logo" />
          <h1>PIXELFORGE</h1>
          <span className="header-version">v0.1.0</span>
        </div>
        <div className="header-right">
          {session && (
            <div className="session-meta">
              <span className={`status-badge status-${session.status}`}>
                {STATUS_LABELS[session.status]}
              </span>
              <span className="meta-item" title={session.projectPath}>
                {basename(session.projectPath)}
              </span>
              <span className="meta-item">{session.cli.name}</span>
            </div>
          )}
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span className="theme-icon" aria-hidden="true">
              {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
            </span>
          </button>
        </div>
      </header>

      <main className="app-main">
        {!session ? (
          <SetupWizard
            projectPath={projectPath}
            clis={clis}
            selectedCliId={selectedCliId ?? ''}
            error={error}
            onSelectProject={selectProject}
            onSelectCli={setSelectedCliId}
            onStart={startSession}
          />
        ) : (
          <div className="session-view">
            <div className="terminal-frame">
              <div className="terminal-screen">
                <TerminalView
                  sessionId={session.id}
                  onResize={(cols, rows) => {
                    terminalSizeRef.current = { cols, rows }
                  }}
                />
              </div>
            </div>
            <div className="session-bar">
              <div className="session-bar-info">
                <span>STATUS: {STATUS_LABELS[session.status]}</span>
                {session.exitCode !== null && session.exitCode !== undefined && (
                  <span>EXIT: {session.exitCode}</span>
                )}
                {session.error && <span className="session-error">{session.error}</span>}
              </div>
              <div className="session-bar-actions">
                {(session.status === 'running' || session.status === 'starting') && (
                  <button className="btn" onClick={stopSession}>
                    Stop
                  </button>
                )}
                {(session.status === 'stopped' ||
                  session.status === 'completed' ||
                  session.status === 'error') && (
                  <button className="btn" onClick={restartSession}>
                    Restart
                  </button>
                )}
                <button className="btn btn-ghost" onClick={closeSession}>
                  New Session
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path
}

export default App