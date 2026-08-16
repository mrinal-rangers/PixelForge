export type SessionStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopped'
  | 'completed'
  | 'error'

export type InstallCommand = [file: string, args: string[]]

export interface CliInfo {
  id: string
  name: string
  command: string
  description: string
  installHint: string
  installCommand: InstallCommand
  site: string
  detected: boolean
  path?: string
  version?: string
}

export type CliInstallStatus = 'installing' | 'done' | 'error'

export interface CliInstallOutputPayload {
  cliId: string
  data: string
}

export interface CliInstallStatusPayload {
  cliId: string
  status: CliInstallStatus
  exitCode?: number
}

/** Display/profile fields that turn a raw CLI session into a named coworker. */
export interface AgentProfileFields {
  name: string
  role: string
  description?: string
  goal?: string
  avatarId?: string
  accent?: string
  autoMode?: boolean
  resumeSessionId?: string
}

export interface SessionInfo extends AgentProfileFields {
  id: string
  status: SessionStatus
  projectPath: string
  cli: CliInfo
  model?: string
  provider?: string
  startedAt?: number
  exitCode?: number | null
  error?: string | null
}

export interface CreateSessionOptions extends AgentProfileFields {
  projectPath: string
  cliId: string
  cols?: number
  rows?: number
  /** Full command line override. When set, this exact command is spawned instead
   *  of the CLI's default command (used by the Add Agent engine step). */
  command?: string
}

export interface SessionOutputPayload {
  sessionId: string
  data: string
}

/** Shape of a JSON config file imported in the Add Agent engine step. */
export interface AgentConfigFile extends AgentProfileFields {
  command?: string
  provider?: string
  model?: string
}

export interface ReadConfigResult {
  ok: boolean
  error?: string
  config?: AgentConfigFile
}

export interface SessionStatusPayload {
  session: SessionInfo
}

export interface AppInfo {
  version: string
  floorPath: string
}

/** Persisted coworker configuration. Survives an application restart. */
export interface CoworkerConfig {
  id: string
  name: string
  role: string
  description?: string
  goal?: string
  avatarId?: string
  accent?: string
  projectPath?: string
  cliId?: string
  provider?: string
  model?: string
  autoMode?: boolean
  /** Reasoning effort chosen in the engine step. */
  reasoning?: string
  /** Briefing template applied in the final step. */
  template?: string
  /** Git worktree isolation details (base repo + isolated checkout). */
  worktree?: { base: string; branch: string; path: string }
  /** Desk slot index assigned on the office floor. */
  desk?: number
  startedAt?: number
  resumeSessionId?: string
  createdAt: number
}

export interface WorktreeResult {
  ok: boolean
  path?: string
  branch?: string
  error?: string
}

export interface WorkspaceApi {
  getAppInfo(): Promise<AppInfo>
  saveCoworker(config: CoworkerConfig): Promise<void>
  listCoworkers(): Promise<CoworkerConfig[]>
  removeCoworker(id: string): Promise<void>
  worktreeAdd(basePath: string, name: string): Promise<WorktreeResult>
  worktreeRemove(basePath: string, worktreePath: string): Promise<{ ok: boolean; error?: string }>
  selectProject(): Promise<string | null>
  selectFiles(): Promise<string[] | null>
  listClis(): Promise<CliInfo[]>
  listCliDefs(): Promise<CliInfo[]>
  detectCli(cliId: string): Promise<CliInfo>
  installCli(cliId: string): Promise<void>
  createSession(options: CreateSessionOptions): Promise<{ sessionId: string }>
  sendInput(sessionId: string, data: string): void
  resizeSession(sessionId: string, cols: number, rows: number): void
  stopSession(sessionId: string): Promise<void>
  restartSession(sessionId: string, cols?: number, rows?: number): Promise<void>
  listSessions(): Promise<SessionInfo[]>
  toggleFullscreen(): void
  openInEditor(projectPath: string): Promise<boolean>
  readConfig(filePath: string): Promise<ReadConfigResult>
  onSessionOutput(cb: (payload: SessionOutputPayload) => void): () => void
  onSessionStatus(cb: (payload: SessionStatusPayload) => void): () => void
  onCliInstallOutput(cb: (payload: CliInstallOutputPayload) => void): () => void
  onCliInstallStatus(cb: (payload: CliInstallStatusPayload) => void): () => void
}