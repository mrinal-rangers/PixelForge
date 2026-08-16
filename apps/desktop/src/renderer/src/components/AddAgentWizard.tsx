import { useMemo, useState } from 'react'
import { ACCENT_COLORS, CHARACTERS } from '../office/characters'
import { useOfficeStore } from '../office/store'
import { MiniAvatar } from './MiniAvatar'
import { CloseIcon } from './ChromeIcon'
import type { AgentConfigFile, CliInfo, CreateSessionOptions } from '@shared/types'

interface AddAgentWizardProps {
  clis: CliInfo[]
  terminalSize: { cols: number; rows: number }
  onClose: () => void
}

const STEPS = ['Identity', 'Workspace', 'Engine', 'Briefing']

function randomName(): string {
  return CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].name
}

function buildCommand(
  cli: CliInfo | undefined,
  provider: string,
  model: string,
  custom: string
): string {
  if (custom.trim()) {
    return custom.trim()
  }
  if (!cli) {
    return ''
  }
  const base = cli.path ?? cli.command
  const parts = [base]
  if (provider.trim()) {
    parts.push(`--provider "${provider.trim()}"`)
  }
  if (model.trim()) {
    parts.push(`--model "${model.trim()}"`)
  }
  return parts.join(' ')
}

export function AddAgentWizard({ clis, terminalSize, onClose }: AddAgentWizardProps): React.JSX.Element {
  const agents = useOfficeStore((s) => s.agents)
  const managerId = useOfficeStore((s) => s.managerId)
  const isFirstAgent = Object.keys(agents).length === 0
  const developerCount = Object.keys(agents).length - (managerId ? 1 : 0)
  const atCapacity = developerCount >= 10

  const [step, setStep] = useState(0)
  const [name, setName] = useState(() => (isFirstAgent ? 'Manager' : randomName()))
  const [role, setRole] = useState(isFirstAgent ? 'Manager' : 'Developer')
  const [avatarId, setAvatarId] = useState<string>(() => {
    const pick = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)]
    return pick.id
  })
  const [accent, setAccent] = useState<string>(ACCENT_COLORS[0])
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [cliId, setCliId] = useState<string | null>(null)
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [customCommand, setCustomCommand] = useState('')
  const [importPath, setImportPath] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [goal, setGoal] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const projects = useOfficeStore((s) => s.projects)
  const cli = useMemo(
    () => (cliId ? (clis.find((c) => c.id === cliId) ?? undefined) : undefined),
    [cliId, clis]
  )
  const command = useMemo(
    () => buildCommand(cli, provider, model, customCommand),
    [cli, provider, model, customCommand]
  )

  const pickProject = async (): Promise<void> => {
    const path = await window.workspace.selectProject()
    if (path) {
      setProjectPath(path)
    }
  }

  const importConfig = async (): Promise<void> => {
    setImporting(true)
    setImportError(null)
    try {
      const files = await window.workspace.selectFiles()
      const path = files?.[0]
      if (!path) {
        return
      }
      const result = await window.workspace.readConfig(path)
      if (!result.ok || !result.config) {
        setImportError(result.error ?? 'Could not read config file')
        return
      }
      const config = result.config as Partial<AgentConfigFile>
      setImportPath(path)
      if (config.name) {
        setName(config.name)
      }
      if (config.role) {
        setRole(config.role)
      }
      if (config.avatarId) {
        setAvatarId(config.avatarId)
      }
      if (config.accent) {
        setAccent(config.accent)
      }
      if (config.description) {
        setDescription(config.description)
      }
      if (config.goal) {
        setGoal(config.goal)
      }
      if (config.provider) {
        setProvider(config.provider)
      }
      if (config.model) {
        setModel(config.model)
      }
      if (config.command) {
        setCustomCommand(config.command)
      }
    } finally {
      setImporting(false)
    }
  }

  const next = (): void => {
    if (step === 1 && !projectPath) {
      setError('Choose a project folder before continuing')
      return
    }
    setError(null)
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const spawn = async (): Promise<void> => {
    if (atCapacity) {
      setError('Maximum of 10 developers reached')
      return
    }
    if (!projectPath) {
      setError('Choose a project folder before spawning')
      return
    }
    if (!cliId) {
      setError('Choose an engine (CLI provider)')
      return
    }
    if (!cli) {
      setError('Unknown engine')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const options: CreateSessionOptions = {
        projectPath,
        cliId,
        name,
        role,
        description,
        goal,
        avatarId,
        accent,
        autoMode: true,
        cols: terminalSize.cols,
        rows: terminalSize.rows
      }
      if (command) {
        options.command = command
      }
      const { sessionId } = await window.workspace.createSession(options)
      useOfficeStore.getState().addProject(projectPath)
      useOfficeStore.getState().requestFocus(sessionId)
      onClose()
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const hire = (): void => {
    if (atCapacity) {
      setError('Maximum of 10 developers reached')
      return
    }
    if (!projectPath) {
      setError('Choose a project folder before hiring')
      return
    }
    useOfficeStore
      .getState()
      .hireAgent({ name, role, description, goal, avatarId, accent, autoMode: true })
    useOfficeStore.getState().addProject(projectPath)
    onClose()
  }

  return (
    <div className="wizard-overlay" role="dialog" aria-modal="true" aria-label="Add Agent">
      <div className="wizard-card">
        <div className="wizard-header">
          <h2 className="wizard-title">ADD AGENT</h2>
          <button className="btn-icon" onClick={onClose} title="Close wizard" aria-label="Close">
            <CloseIcon className="icon-btn" />
          </button>
        </div>

        <ol className="stepper">
          {STEPS.map((label, index) => (
            <li
              key={label}
              className={`stepper-step ${index === step ? 'active' : ''} ${index < step ? 'done' : ''}`}
            >
              <span className="stepper-dot">{index + 1}</span>
              <span className="stepper-label">{label}</span>
            </li>
          ))}
        </ol>

        <div className="wizard-body">
          {step === 0 && (
            <div className="setup-section">
              <h3 className="section-title">Identity</h3>
              <p className="section-desc">
                Give your coworker a name, a role and a face for the office floor.
              </p>
              <div className="field-row">
                <label className="field-label" htmlFor="wiz-name">
                  Name
                </label>
                <input
                  id="wiz-name"
                  className="text-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Jim"
                />
                <button className="btn btn-small" onClick={() => setName(randomName())}>
                  Roll
                </button>
              </div>
              <div className="field-row">
                <label className="field-label" htmlFor="wiz-role">
                  Role
                </label>
                <input
                  id="wiz-role"
                  className="text-input"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Sales Lead"
                />
              </div>
              <div className="field-row">
                <label className="field-label">Avatar</label>
                <div className="avatar-grid">
                  {CHARACTERS.map((character) => (
                    <button
                      key={character.id}
                      className={`avatar-option ${character.id === avatarId ? 'selected' : ''}`}
                      onClick={() => setAvatarId(character.id)}
                      title={character.name}
                    >
                      <MiniAvatar spec={character} scale={1} alt={character.name} />
                      <span className="avatar-name">{character.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="field-row">
                <label className="field-label">Accent</label>
                <div className="accent-row">
                  {ACCENT_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`accent-swatch ${color === accent ? 'selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setAccent(color)}
                      title={color}
                      aria-label={`Accent ${color}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="setup-section">
              <h3 className="section-title">Workspace</h3>
              <p className="section-desc">
                The project folder the coworker will operate inside.
              </p>
              <button className="btn btn-block" onClick={pickProject}>
                Choose project folder
              </button>
              {projectPath && (
                <p className="path-hint" title={projectPath}>
                  {projectPath}
                </p>
              )}
              {projects.length > 0 && (
                <>
                  <h4 className="subsection-title">Recent projects</h4>
                  <div className="project-list">
                    {projects.map((path) => (
                      <button
                        key={path}
                        className={`project-option ${path === projectPath ? 'selected' : ''}`}
                        onClick={() => setProjectPath(path)}
                        title={path}
                      >
                        {path}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="setup-section">
              <h3 className="section-title">Engine</h3>
              <p className="section-desc">
                Pick the CLI that powers this coworker, then tune how it launches.
              </p>
              <div className="engine-grid">
                {clis.map((entry) => (
                  <button
                    key={entry.id}
                    className={`engine-option ${entry.id === cliId ? 'selected' : ''}`}
                    onClick={() => {
                      setCliId(entry.id)
                      setError(null)
                    }}
                  >
                    <span className="engine-name">{entry.name}</span>
                    <span className={`cli-badge ${entry.detected ? '' : 'missing'}`}>
                      {entry.detected ? 'READY' : 'MISSING'}
                    </span>
                    {!entry.detected && <span className="tile-hint">{entry.installHint}</span>}
                  </button>
                ))}
              </div>
              {cli && (
                <div className="field-row">
                  <label className="field-label">Provider</label>
                  <input
                    className="text-input"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    placeholder={`e.g. ${cli.name.toLowerCase()}`}
                  />
                </div>
              )}
              {cli && (
                <div className="field-row">
                  <label className="field-label">Model</label>
                  <input
                    className="text-input"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="e.g. sonnet-4-5"
                  />
                </div>
              )}
              <div className="field-row">
                <label className="field-label">Command</label>
                <input
                  className="text-input mono"
                  value={customCommand}
                  onChange={(e) => setCustomCommand(e.target.value)}
                  placeholder={cli ? buildCommand(cli, '', '', '') : 'Command override'}
                />
              </div>
              <div className="command-preview" title={command}>
                <span className="command-preview-label">WILL RUN</span>
                <code className="command-line">{command || '— choose an engine —'}</code>
              </div>
              <div className="import-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={importPath !== null}
                    onChange={importConfig}
                    disabled={importing}
                  />
                  Import from local config
                </label>
                {importing && <span className="tile-checking">READING…</span>}
                {importPath && (
                  <span className="path-hint" title={importPath}>
                    {importPath}
                  </span>
                )}
                {importError && <span className="session-error">{importError}</span>}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="setup-section">
              <h3 className="section-title">Briefing</h3>
              <p className="section-desc">
                Describe what this coworker is here to do.
              </p>
              <div className="field-row">
                <label className="field-label">Role</label>
                <input
                  className="text-input"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                />
              </div>
              <div className="field-row">
                <label className="field-label" htmlFor="wiz-desc">
                  Description
                </label>
                <textarea
                  id="wiz-desc"
                  className="text-input textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What they are known for…"
                  rows={3}
                />
              </div>
              <div className="field-row">
                <label className="field-label" htmlFor="wiz-goal">
                  Goal
                </label>
                <textarea
                  id="wiz-goal"
                  className="text-input textarea"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="What they are working toward…"
                  rows={3}
                />
              </div>
            </div>
          )}

          {error && <div className="error-banner">{error}</div>}
        </div>

        <div className="wizard-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <div className="wizard-actions-right">
            {step > 0 && (
              <button className="btn" onClick={() => setStep((s) => Math.max(0, s - 1))}>
                Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button className="btn btn-primary" onClick={next}>
                Next
              </button>
            ) : (
              <>
                <button className="btn" onClick={hire} disabled={atCapacity}>
                  Hire
                </button>
                <button className="btn btn-primary" onClick={spawn} disabled={busy || atCapacity}>
                  {busy ? 'Spawning…' : atCapacity ? 'Full' : 'Spawn'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}