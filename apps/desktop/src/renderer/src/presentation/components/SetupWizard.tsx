import { useCallback, useEffect, useState } from 'react'

import type { CliInfo, CliInstallStatus } from '@shared/types'
import { GemLogo } from './GemLogo'
import { ProviderIcon } from './ProviderIcon'

interface SetupWizardProps {
  clis: CliInfo[]
  error: string | null
  onSelectProject: () => Promise<string | null>
  onStart: (path: string, cliId: string) => void
  onSkip: () => void
}

const STEPS = ['Mission', 'Quest', 'Allies'] as const
type StepIndex = 0 | 1 | 2

const FEATURES = [
  'Launch real AI coding agents in live terminals',
  'Bring your own ally: Codex, Claude Code, OpenCode, Gemini & more',
  'Watch what your team is doing in real time',
  'One-click install for missing agents',
  'Stop, restart and switch projects instantly'
]

interface TileState {
  checked: boolean
  detected: boolean
  version?: string
  installState?: CliInstallStatus
}

export function SetupWizard({
  clis,
  error,
  onSelectProject,
  onStart,
  onSkip
}: SetupWizardProps): React.JSX.Element {
  const [step, setStep] = useState<StepIndex>(0)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [manualPath, setManualPath] = useState('')
  const [selectedCliId, setSelectedCliId] = useState<string | null>(null)
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [tiles, setTiles] = useState<Record<string, TileState>>({})
  const [installLogs, setInstallLogs] = useState<Record<string, string>>({})

  const effectivePath = projectPath ?? manualPath.trim()

  const checkCli = useCallback(async (cliId: string) => {
    setCheckingId(cliId)
    try {
      const info = await window.workspace.detectCli(cliId)
      setTiles((prev) => ({
        ...prev,
        [cliId]: { ...prev[cliId], checked: true, detected: info.detected, version: info.version }
      }))
      if (info.detected) {
        setSelectedCliId(cliId)
      }
    } catch {
      setTiles((prev) => ({
        ...prev,
        [cliId]: { ...prev[cliId], checked: true, detected: false }
      }))
    } finally {
      setCheckingId(null)
    }
  }, [])

  useEffect(() => {
    const unsubscribeOutput = window.workspace.onCliInstallOutput(({ cliId, data }) => {
      setInstallLogs((prev) => ({
        ...prev,
        [cliId]: (prev[cliId] ?? '').slice(-4000) + data
      }))
    })
    const unsubscribeStatus = window.workspace.onCliInstallStatus(({ cliId, status }) => {
      setTiles((prev) => ({ ...prev, [cliId]: { ...prev[cliId], installState: status } }))
      if (status === 'done') {
        checkCli(cliId)
      }
    })
    return () => {
      unsubscribeOutput()
      unsubscribeStatus()
    }
  }, [checkCli])

  const selectedCli = clis.find((c) => c.id === selectedCliId)

  const canContinue = step === 0 ? true : step === 1 ? Boolean(effectivePath) : Boolean(selectedCliId)
  const canStart = Boolean(effectivePath) && Boolean(selectedCliId)

  const installCli = useCallback(async (cli: CliInfo) => {
    setTiles((prev) => ({
      ...prev,
      [cli.id]: { ...prev[cli.id], checked: true, detected: false, installState: 'installing' }
    }))
    setInstallLogs((prev) => ({ ...prev, [cli.id]: '' }))
    try {
      await window.workspace.installCli(cli.id)
    } catch {
      setTiles((prev) => ({
        ...prev,
        [cli.id]: { ...prev[cli.id], installState: 'error' }
      }))
    }
  }, [])

  const browse = useCallback(async () => {
    const path = await onSelectProject()
    if (path) {
      setProjectPath(path)
      setManualPath(path)
    }
  }, [onSelectProject])

  const goNext = (): void => {
    if (step < 2 && canContinue) {
      setStep((step + 1) as StepIndex)
    }
  }

  const goBack = (): void => {
    if (step > 0) {
      setStep((step - 1) as StepIndex)
    }
  }

  return (
    <div className="setup-panel">
      <div className="setup-card">
        <ol className="stepper">
          {STEPS.map((label, index) => (
            <li
              key={label}
              className={`stepper-step ${index === step ? 'active' : index < step ? 'done' : ''}`}
            >
              <span className="stepper-dot">{index < step ? '✓' : index + 1}</span>
              <span className="stepper-label">{label}</span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section className="about-section">
            <GemLogo className="about-logo" />
            <h2 className="about-title">PIXELFORGE</h2>
            <p className="about-tagline">Assemble your AI coding team like it's a game.</p>
            <p className="about-body">
              PixelForge runs real coding agents — Codex, Claude Code, OpenCode, Gemini and
              more — each inside its own live terminal. Give your team a goal, watch them
              work, and step in whenever they need you.
            </p>
            <ul className="feature-list">
              {FEATURES.map((feature) => (
                <li key={feature}>
                  <span className="feature-marker">►</span> {feature}
                </li>
              ))}
            </ul>
          </section>
        )}

        {step === 1 && (
          <section className="setup-section">
            <h2 className="section-title">Pick your quest</h2>
            <p className="section-desc">Which project folder should the agent work in?</p>
            <div className="field-row">
              <input
                className="text-input"
                type="text"
                placeholder="~/path/to/project"
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                spellCheck={false}
              />
              <button className="btn" onClick={browse}>
                Browse
              </button>
            </div>
            {projectPath && <div className="path-hint">Selected: {projectPath}</div>}
          </section>
        )}

        {step === 2 && (
          <section className="setup-section">
            <h2 className="section-title">Choose your ally</h2>
            <p className="section-desc">
              Tap an agent to scan your machine and see if it's ready. Install missing ones
              with a single click.
            </p>

            <div className="cli-grid">
              {clis.map((cli) => {
                const tile = tiles[cli.id]
                const checking = checkingId === cli.id
                const selected = selectedCliId === cli.id
                const showInstall =
                  tile?.checked && !tile.detected && tile.installState !== 'installing'
                return (
                  <div
                    key={cli.id}
                    className={`cli-tile ${selected ? 'selected' : ''} ${tile?.detected ? 'ready' : ''}`}
                    onClick={() => {
                      if (!checking && tile?.installState !== 'installing') {
                        checkCli(cli.id)
                      }
                    }}
                  >
                    <ProviderIcon cliId={cli.id} className="tile-icon" />
                    <span className="tile-name">{cli.name}</span>
                    <span className="tile-status">
                      {checking ? (
                        <span className="tile-checking">Scanning…</span>
                      ) : tile?.detected ? (
                        <span className="cli-badge detected">READY {tile.version ?? ''}</span>
                      ) : tile?.checked ? (
                        <span className="cli-badge missing">NOT FOUND</span>
                      ) : (
                        <span className="tile-hint">click to check</span>
                      )}
                    </span>
                    {tile?.installState === 'installing' && (
                      <button className="btn btn-install" disabled>
                        Installing…
                      </button>
                    )}
                    {showInstall && (
                      <button
                        className="btn btn-install"
                        onClick={(e) => {
                          e.stopPropagation()
                          installCli(cli)
                        }}
                      >
                        Install
                      </button>
                    )}
                    {tile?.installState === 'error' && (
                      <span className="cli-badge error">FAILED</span>
                    )}
                    {tile?.installState === 'installing' && installLogs[cli.id] && (
                      <pre className="install-log">
                        {installLogs[cli.id].split('\n').slice(-5).join('\n')}
                      </pre>
                    )}
                  </div>
                )
              })}
            </div>

            <details className="install-notes">
              <summary>Which install command is used?</summary>
              <ul>
                {clis.map((cli) => (
                  <li key={cli.id}>
                    <strong>{cli.name}</strong> — <code>{cli.installHint}</code>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        )}

        {error && <div className="error-banner">{error}</div>}

        <div className="wizard-actions">
          <button className="btn btn-ghost" onClick={onSkip}>
            Skip
          </button>
          {step > 0 ? (
            <button className="btn" onClick={goBack}>
              Back
            </button>
          ) : (
            <span />
          )}
          {step < 2 ? (
            <button className="btn btn-primary" disabled={!canContinue} onClick={goNext}>
              {step === 0 ? 'Start Setup' : 'Continue'}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              disabled={!canStart}
              onClick={() => onStart(effectivePath, selectedCliId ?? '')}
            >
              Start {selectedCli?.name ?? 'Agent'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}