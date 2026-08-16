import { useMemo, useState } from 'react'
import { ACCENT_COLORS, CHARACTERS } from '../scene/characters'
import { useOfficeStore } from '../../application/state/officeStore'
import { MiniAvatar } from './MiniAvatar'
import { CloseIcon } from './ChromeIcon'
import type { AgentConfigFile, CliInfo, CreateSessionOptions } from '@shared/types'

interface AddAgentWizardProps {
  clis: CliInfo[]
  terminalSize: { cols: number; rows: number }
  onClose: () => void
}

const STEPS = ['Identity', 'Workspace', 'Engine', 'Briefing']

const REASONING_LEVELS = [
  { id: 'none', label: 'Balanced' },
  { id: 'low', label: 'Focused' },
  { id: 'high', label: 'Thorough' }
]

const TEMPLATES = [
  {
    id: 'developer',
    name: 'Developer',
    role: 'Developer',
    description: 'Builds and maintains features across the codebase.',
    goal: 'Ship working code that matches the team’s standards.'
  },
  {
    id: 'research',
    name: 'Research Assistant',
    role: 'Research Assistant',
    description: 'Digs into code, docs and the web to answer questions.',
    goal: 'Gather accurate, well-sourced information for the team.'
  },
  {
    id: 'docs',
    name: 'Documentation Writer',
    role: 'Documentation Writer',
    description: 'Writes clear, current documentation for code and processes.',
    goal: 'Keep documentation accurate and up to date.'
  },
  {
    id: 'bug',
    name: 'Bug Investigator',
    role: 'Bug Investigator',
    description: 'Reproduces, isolates and diagnoses bugs.',
    goal: 'Find root causes and propose reliable fixes.'
  },
  {
    id: 'reviewer',
    name: 'Code Reviewer',
    role: 'Code Reviewer',
    description: 'Reviews changes for quality, safety and style.',
    goal: 'Keep the codebase clean and free of regressions.'
  },
  {
    id: 'release',
    name: 'Release Manager',
    role: 'Release Manager',
    description: 'Prepares and verifies releases and versioning.',
    goal: 'Ship stable, well-tested releases on schedule.'
  }
]

function reasoningFlag(reasoning: string): string {
  if (!reasoning || reasoning === 'none') {
    return ''
  }
  return `--reasoning-effort ${reasoning}`
}

function resumeFlag(cliId: string, sessionId: string): string {
  if (!sessionId) {
    return ''
  }
  if (cliId === 'codex' || cliId === 'claude' || cliId === 'gemini') {
    return `--resume ${sessionId}`
  }
  return ''
}

function randomName(): string {
  return CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].name
}

function buildCommand(
  cli: CliInfo | undefined,
  provider: string,
  model: string,
  custom: string,
  reasoning: string,
  resume: string
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
  if (resume) {
    parts.push(resumeFlag(cli.id, resume))
  }
  if (reasoning) {
    parts.push(reasoningFlag(reasoning))
  }
  return parts.filter(Boolean).join(' ')
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
  const [template, setTemplate] = useState<string | null>(null)
  const [reasoning, setReasoning] = useState('none')
  const [autoMode, setAutoMode] = useState(true)
  const [worktreeEnabled, setWorktreeEnabled] = useState(false)
  const [resumeSessionId, setResumeSessionId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const projects = useOfficeStore((s) => s.projects)
  const allAgents = useOfficeStore((s) => Object.values(s.agents))
  const resumeOptions = allAgents.filter(
    (agent) => agent.id !== managerId && agent.cliId !== '' && agent.status !== 'running'
  )
  const cli = useMemo(
    () => (cliId ? (clis.find((c) => c.id === cliId) ?? undefined) : undefined),
    [cliId, clis]
  )
  const command = useMemo(
    () => buildCommand(cli, provider, model, customCommand, reasoning, resumeSessionId),
    [cli, provider, model, customCommand, reasoning, resumeSessionId]
  )

  const applyTemplate = (t: (typeof TEMPLATES)[number]): void => {
    setTemplate(t.id)
    setRole(t.role)
    setDescription(t.description)
    setGoal(t.goal)
  }

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
      const worktree = worktreeEnabled
        ? await window.workspace.worktreeAdd(projectPath, name.trim() || 'coworker')
        : { ok: true as const, path: projectPath, branch: undefined }
      if (!worktree.ok || !worktree.path) {
        throw new Error(worktree.error || 'Could not create git worktree')
      }
      const options: CreateSessionOptions = {
        projectPath: worktree.path,
        cliId,
        name,
        role,
        description,
        goal,
        avatarId,
        accent,
        autoMode,
        resumeSessionId: resumeSessionId || undefined,
        cols: terminalSize.cols,
        rows: terminalSize.rows
      }
      if (command) {
        options.command = command
      }
      const { sessionId } = await window.workspace.createSession(options)
      useOfficeStore.getState().addProject(projectPath)
      const desk = Object.keys(useOfficeStore.getState().agents).length
      window.workspace.saveCoworker({
        id: sessionId,
        name,
        role,
        description,
        goal,
        avatarId,
        accent,
        projectPath: worktree.path,
        cliId,
        provider,
        model,
        autoMode,
        reasoning,
        template: template ?? undefined,
        worktree: worktreeEnabled
          ? { base: projectPath, branch: worktree.branch ?? '', path: worktree.path }
          : undefined,
        desk,
        resumeSessionId: resumeSessionId || undefined,
        createdAt: Date.now()
      })
      useOfficeStore.getState().requestFocus(sessionId)
      onClose()
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const hire = async (): Promise<void> => {
    if (atCapacity) {
      setError('Maximum of 10 developers reached')
      return
    }
    if (!projectPath) {
      setError('Choose a project folder before hiring')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const worktree = worktreeEnabled
        ? await window.workspace.worktreeAdd(projectPath, name.trim() || 'coworker')
        : { ok: true as const, path: projectPath, branch: undefined }
      if (!worktree.ok || !worktree.path) {
        throw new Error(worktree.error || 'Could not create git worktree')
      }
      useOfficeStore.getState().hireAgent({
        name,
        role,
        description,
        goal,
        avatarId,
        accent,
        autoMode,
        reasoning,
        template: template ?? undefined,
        projectPath: worktree.path,
        worktree: worktreeEnabled
          ? { base: projectPath, branch: worktree.branch ?? '', path: worktree.path }
          : undefined,
        resumeSessionId: resumeSessionId || undefined
      })
      useOfficeStore.getState().addProject(projectPath)
      onClose()
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : String(err))
    }
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
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={worktreeEnabled}
                  onChange={(e) => setWorktreeEnabled(e.target.checked)}
                />
                Git worktree isolation
              </label>
              <span className="section-desc">
                Creates a separate git worktree so this coworker never edits the shared working
                copy.
              </span>
              {resumeOptions.length > 0 && (
                <div className="field-row">
                  <label className="field-label" htmlFor="wiz-resume">
                    Resume
                  </label>
                  <select
                    id="wiz-resume"
                    className="text-input select"
                    value={resumeSessionId}
                    onChange={(e) => setResumeSessionId(e.target.value)}
                  >
                    <option value="">New session</option>
                    {resumeOptions.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} ({agent.role})
                      </option>
                    ))}
                  </select>
                </div>
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
              {cli && (
                <div className="field-row">
                  <label className="field-label">Reasoning</label>
                  <select
                    className="text-input select"
                    value={reasoning}
                    onChange={(e) => setReasoning(e.target.value)}
                  >
                    {REASONING_LEVELS.map((level) => (
                      <option key={level.id} value={level.id}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={autoMode}
                  onChange={(e) => setAutoMode(e.target.checked)}
                />
                Auto mode
              </label>
              <span className="section-desc">Let the coworker run without prompts.</span>
              <div className="field-row">
                <label className="field-label">Command</label>
                <input
                  className="text-input mono"
                  value={customCommand}
                  onChange={(e) => setCustomCommand(e.target.value)}
                  placeholder={cli ? buildCommand(cli, '', '', '', 'none', '') : 'Command override'}
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
              <div className="template-grid">
                <button
                  className={`template-option ${template === null ? 'selected' : ''}`}
                  onClick={() => {
                    setTemplate(null)
                  }}
                >
                  <span className="template-name">None</span>
                </button>
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    className={`template-option ${template === t.id ? 'selected' : ''}`}
                    onClick={() => applyTemplate(t)}
                    title={t.description}
                  >
                    <span className="template-name">{t.name}</span>
                  </button>
                ))}
              </div>
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