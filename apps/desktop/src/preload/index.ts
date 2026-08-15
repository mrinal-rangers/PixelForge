import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

import type {
  CliInstallOutputPayload,
  CliInstallStatusPayload,
  CreateSessionOptions,
  SessionOutputPayload,
  SessionStatusPayload,
  WorkspaceApi
} from '../shared/types'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: WorkspaceApi = {
  selectProject: () => ipcRenderer.invoke('dialog:selectProject'),
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
  onSessionOutput: (cb) => subscribe<SessionOutputPayload>('session:output', cb),
  onSessionStatus: (cb) => subscribe<SessionStatusPayload>('session:status', cb),
  onCliInstallOutput: (cb) => subscribe<CliInstallOutputPayload>('cli:install-output', cb),
  onCliInstallStatus: (cb) => subscribe<CliInstallStatusPayload>('cli:install-status', cb)
}

contextBridge.exposeInMainWorld('workspace', api)