import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

import type {
  CliInstallOutputPayload,
  CliInstallStatusPayload,
  CreateSessionOptions,
  GoalRecord,
  NewGoalInput,
  NewTaskInput,
  SessionOutputPayload,
  SessionStatusPayload,
  TaskRecord,
  WorkspaceApi
} from '../shared/types'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: WorkspaceApi = {
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  saveCoworker: (config) => ipcRenderer.invoke('coworker:save', config),
  listCoworkers: () => ipcRenderer.invoke('coworker:list'),
  removeCoworker: (id) => ipcRenderer.invoke('coworker:remove', id),
  worktreeAdd: (basePath, name) => ipcRenderer.invoke('git:worktreeAdd', basePath, name),
  worktreeRemove: (basePath, worktreePath) =>
    ipcRenderer.invoke('git:worktreeRemove', basePath, worktreePath),
  taskCreate: (input: NewTaskInput) => ipcRenderer.invoke('task:create', input),
  taskSave: (task: TaskRecord) => ipcRenderer.invoke('task:save', task),
  taskList: () => ipcRenderer.invoke('task:list'),
  taskRemove: (taskId) => ipcRenderer.invoke('task:remove', taskId),
  goalCreate: (input: NewGoalInput) => ipcRenderer.invoke('goal:create', input),
  goalSave: (goal: GoalRecord) => ipcRenderer.invoke('goal:save', goal),
  goalList: () => ipcRenderer.invoke('goal:list'),
  goalRemove: (goalId) => ipcRenderer.invoke('goal:remove', goalId),
  selectProject: () => ipcRenderer.invoke('dialog:selectProject'),
  selectFiles: () => ipcRenderer.invoke('dialog:selectFiles'),
  listClis: () => ipcRenderer.invoke('cli:list'),
  listCliDefs: () => ipcRenderer.invoke('cli:defs'),
  detectCli: (cliId) => ipcRenderer.invoke('cli:detect', cliId),
  installCli: (cliId) => ipcRenderer.invoke('cli:install', cliId),
  createSession: (options: CreateSessionOptions) => ipcRenderer.invoke('session:create', options),
  sendInput: (sessionId, data) => ipcRenderer.invoke('session:input', sessionId, data),
  resizeSession: (sessionId, cols, rows) =>
    ipcRenderer.invoke('session:resize', sessionId, cols, rows),
  stopSession: (sessionId) => ipcRenderer.invoke('session:stop', sessionId),
  restartSession: (sessionId, cols, rows) =>
    ipcRenderer.invoke('session:restart', sessionId, cols, rows),
  listSessions: () => ipcRenderer.invoke('session:list'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
  openInEditor: (projectPath) => ipcRenderer.invoke('ide:open', projectPath),
  readConfig: (filePath) => ipcRenderer.invoke('config:read', filePath),
  onSessionOutput: (cb) => subscribe<SessionOutputPayload>('session:output', cb),
  onSessionStatus: (cb) => subscribe<SessionStatusPayload>('session:status', cb),
  onCliInstallOutput: (cb) => subscribe<CliInstallOutputPayload>('cli:install-output', cb),
  onCliInstallStatus: (cb) => subscribe<CliInstallStatusPayload>('cli:install-status', cb)
}

contextBridge.exposeInMainWorld('workspace', api)