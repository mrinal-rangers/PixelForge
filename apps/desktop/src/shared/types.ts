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

export interface SessionInfo {
  id: string
  status: SessionStatus
  projectPath: string
  cli: CliInfo
  startedAt?: number
  exitCode?: number | null
  error?: string | null
}

export interface CreateSessionOptions {
  projectPath: string
  cliId: string
  cols?: number
  rows?: number
}

export interface SessionOutputPayload {
  sessionId: string
  data: string
}

export interface SessionStatusPayload {
  session: SessionInfo
}

export interface WorkspaceApi {
  selectProject(): Promise<string | null>
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
  onSessionOutput(cb: (payload: SessionOutputPayload) => void): () => void
  onSessionStatus(cb: (payload: SessionStatusPayload) => void): () => void
  onCliInstallOutput(cb: (payload: CliInstallOutputPayload) => void): () => void
  onCliInstallStatus(cb: (payload: CliInstallStatusPayload) => void): () => void
}