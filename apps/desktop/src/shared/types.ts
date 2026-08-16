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

export type TaskStatus = 'todo' | 'ongoing' | 'needs-input' | 'done' | 'failed'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface TaskAttachment {
  id: string
  name: string
  path?: string
  ts: number
}

export type TaskEventType =
  | 'created'
  | 'assigned'
  | 'started'
  | 'paused'
  | 'resumed'
  | 'progress'
  | 'question'
  | 'answer'
  | 'files'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'reassigned'
  | 'instruction'
  | 'note'

export interface TaskEvent {
  id: number
  type: TaskEventType
  text: string
  ts: number
}

export interface TaskQuestion {
  id: number
  /** What the coworker needs to continue. */
  need: string
  /** Why it is needed. */
  why?: string
  /** What happens if the user does nothing. */
  consequence?: string
  /** Available choices. */
  choices?: string[]
  /** The option the coworker recommends. */
  recommended?: string
  answer?: string
  answeredAt?: number | null
}

export interface CompletionReport {
  summary: string
  files: string[]
  commands: string[]
  tests: string
  concerns: string
  next: string[]
}

export interface TaskSubtask {
  id: string
  text: string
  done: boolean
}

export interface TaskRecord {
  id: string
  title: string
  instructions: string
  projectPath?: string
  assignedAgentId?: string
  priority: TaskPriority
  deadline?: number
  attachments: TaskAttachment[]
  /** Task ids this task depends on (must be done before this starts). */
  dependencies: string[]
  /** Task ids that depend on this task (derived, kept in sync). */
  dependents: string[]
  requirements?: string
  status: TaskStatus
  subtasks: TaskSubtask[]
  /** Readable progress lines from real agent reports. */
  progress: string[]
  events: TaskEvent[]
  questions: TaskQuestion[]
  report?: CompletionReport
  filesChanged: string[]
  createdAt: number
  startedAt?: number
  pausedAt?: number
  updatedAt: number
  completedAt?: number
}

export interface NewTaskInput {
  title: string
  instructions: string
  projectPath?: string
  assignedAgentId?: string
  priority: TaskPriority
  deadline?: number
  attachments: TaskAttachment[]
  dependencies: string[]
  requirements?: string
}

export type GoalStatus =
  | 'planning'
  | 'awaiting-approval'
  | 'running'
  | 'needs-input'
  | 'partially-completed'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type GoalApprovalMode = 'supervised' | 'auto'

export interface GoalTaskDraft {
  id: string
  title: string
  instructions: string
  /** Recommended coworker (name or agent id). Left empty for Michael to pick. */
  assignee?: string
  assigneeReason?: string
  /** Draft ids (or draft titles) this task depends on. */
  dependencies: string[]
  priority: TaskPriority
}

export interface GoalPlan {
  understanding: string
  tasks: GoalTaskDraft[]
  risks: string[]
  completionCriteria: string
  /** Free-form note (e.g. replan explanation). */
  note?: string
}

export interface GoalQuestion {
  id: number
  ask: string
  why: string
  taskId?: string
  options: string[]
  recommendation: string
  consequences: string
  urgency: 'normal' | 'high'
  answer?: string
  answeredAt?: number | null
  createdAt: number
}

export interface GoalRetry {
  id: number
  taskId: string
  attempt: number
  action: string
  note: string
  ts: number
}

export interface GoalReport {
  summary: string
  workers: string[]
  tasks: string[]
  files: string[]
  verification: string
  decisions: string[]
  approvals: string[]
  limitations: string
  risks: string[]
  next: string[]
}

export interface GoalRecord {
  id: string
  title: string
  request: string
  projectPath?: string
  expectedOutcome?: string
  constraints: string[]
  priority: TaskPriority
  deadline?: number
  budget?: number
  attachments: TaskAttachment[]
  preferredCoworkers?: string[]
  completionRequirements?: string
  approvalMode: GoalApprovalMode
  status: GoalStatus
  plan?: GoalPlan
  /** Child task ids on the shared task board. */
  taskIds: string[]
  questions: GoalQuestion[]
  retries: GoalRetry[]
  report?: GoalReport
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export interface NewGoalInput {
  title: string
  request: string
  projectPath?: string
  expectedOutcome?: string
  constraints: string[]
  priority: TaskPriority
  deadline?: number
  budget?: number
  attachments: TaskAttachment[]
  preferredCoworkers?: string[]
  completionRequirements?: string
  approvalMode: GoalApprovalMode
}

export type MemoryType = 'user' | 'project' | 'decision' | 'task' | 'coworker' | 'temporary'
export type MemoryVisibility = 'public' | 'team' | 'private'
export type MemoryConfidence = 'high' | 'medium' | 'low'
export type MemoryApproval = 'auto' | 'approved' | 'pending' | 'temporary' | 'rejected'

export interface MemoryExpiration {
  rule: 'none' | 'goal' | 'date'
  date?: number
  goalId?: string
}

export type MemorySource =
  | { kind: 'user' }
  | { kind: 'task-report'; taskId: string }
  | { kind: 'ask-me'; goalId?: string; taskId?: string }
  | { kind: 'file-inspection'; path?: string }
  | { kind: 'terminal'; sessionId?: string }
  | { kind: 'memory' }
  | { kind: 'manual' }

export interface MemoryRevision {
  id: number
  title: string
  content: string
  ts: number
  reason: string
}

export interface MemoryUsage {
  taskId: string
  agentId?: string
  ts: number
}

export interface MemoryRecord {
  id: string
  title: string
  /** Markdown body. Human-readable and exportable. */
  content: string
  type: MemoryType
  projectPath?: string
  relatedAgentId?: string
  relatedTaskId?: string
  relatedGoalId?: string
  source: MemorySource
  createdBy: string
  createdAt: number
  updatedAt: number
  confidence: MemoryConfidence
  tags: string[]
  visibility: MemoryVisibility
  expiration?: MemoryExpiration
  archived: boolean
  pinned: boolean
  unreliable: boolean
  approval: MemoryApproval
  lastUsedAt?: number
  usage: MemoryUsage[]
  revisions: MemoryRevision[]
  /** Pending conflict: id of an existing memory this one disagrees with. */
  conflictOf?: string
  /** This memory superseded the memory with this id. */
  resolvedWith?: string
}

export interface NewMemoryInput {
  title: string
  content: string
  type: MemoryType
  projectPath?: string
  relatedAgentId?: string
  relatedTaskId?: string
  relatedGoalId?: string
  source: MemorySource
  createdBy: string
  confidence: MemoryConfidence
  tags: string[]
  visibility: MemoryVisibility
  expiration?: MemoryExpiration
  approval: MemoryApproval
  pinned?: boolean
  /** Pending conflict: id of an existing memory this one disagrees with. */
  conflictOf?: string
}

export interface WorkspaceApi {
  getAppInfo(): Promise<AppInfo>
  saveCoworker(config: CoworkerConfig): Promise<void>
  listCoworkers(): Promise<CoworkerConfig[]>
  removeCoworker(id: string): Promise<void>
  worktreeAdd(basePath: string, name: string): Promise<WorktreeResult>
  worktreeRemove(basePath: string, worktreePath: string): Promise<{ ok: boolean; error?: string }>
  taskCreate(input: NewTaskInput): Promise<TaskRecord>
  taskSave(task: TaskRecord): Promise<TaskRecord>
  taskList(): Promise<TaskRecord[]>
  taskRemove(taskId: string): Promise<void>
  goalCreate(input: NewGoalInput): Promise<GoalRecord>
  goalSave(goal: GoalRecord): Promise<GoalRecord>
  goalList(): Promise<GoalRecord[]>
  goalRemove(goalId: string): Promise<void>
  memoryCreate(input: NewMemoryInput): Promise<MemoryRecord>
  memorySave(memory: MemoryRecord): Promise<MemoryRecord>
  memoryList(): Promise<MemoryRecord[]>
  memoryRemove(memoryId: string): Promise<void>
  memoryClear(): Promise<void>
  memoryExport(): Promise<string | null>
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