import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { spawn, spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'

import { detectClis, detectOneCli, getCliDefinition, listCliDefinitions } from '../session/cliRegistry'
import { AgentSession, SessionManager } from '../session/sessionManager'
import { saveCoworker, listCoworkers, removeCoworker } from '../coworker/coworkerRepo'
import { worktreeAdd, worktreeRemove } from '../git/worktree'
import { createTask, listTasks, removeTask, saveTask } from '../db/taskRepo'
import { createGoal, listGoals, removeGoal, saveGoal } from '../db/goalRepo'
import {
  clearMemories,
  createMemory,
  listMemories,
  removeMemory,
  saveMemory
} from '../db/memoryRepo'
import {
  createConversation,
  createMessage,
  listConversations,
  listMessages,
  removeMessage,
  saveConversation,
  saveMessage
} from '../db/messageRepo'
import type {
  CliInfo,
  ConversationRecord,
  CreateSessionOptions,
  CoworkerConfig,
  GoalRecord,
  MemoryRecord,
  MessageRecord,
  NewGoalInput,
  NewMemoryInput,
  NewMessageInput,
  NewTaskInput,
  TaskRecord
} from '../../shared/types'

function sendToAll(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload)
  }
}

function wireSession(session: AgentSession): void {
  session.onOutput((data) => {
    sendToAll('session:output', { sessionId: session.id, data })
  })
  session.onStatus((info) => {
    sendToAll('session:status', { session: info })
  })
}

/** Register every IPC handler the renderer needs. Call once at startup. */
export function registerIpcHandlers(deps: { sessionManager: SessionManager }): void {
  const { sessionManager } = deps

  ipcMain.handle('app:info', () => {
    const base = is.dev ? process.cwd() : process.resourcesPath
    return {
      version: app.getVersion(),
      floorPath: join(base, 'resources', 'pixel-office')
    }
  })

  ipcMain.handle('coworker:save', (_event, config: CoworkerConfig) => {
    saveCoworker(config)
  })

  ipcMain.handle('coworker:list', () => listCoworkers())

  ipcMain.handle('coworker:remove', (_event, id: string) => {
    removeCoworker(id)
  })

  ipcMain.handle('git:worktreeAdd', (_event, basePath: string, name: string) =>
    worktreeAdd(basePath, name)
  )

  ipcMain.handle('git:worktreeRemove', (_event, basePath: string, worktreePath: string) =>
    worktreeRemove(basePath, worktreePath)
  )

  ipcMain.handle('task:create', (_event, input: NewTaskInput) => createTask(input))

  ipcMain.handle('task:save', (_event, task: TaskRecord) => saveTask(task))

  ipcMain.handle('task:list', () => listTasks())

  ipcMain.handle('task:remove', (_event, taskId: string) => {
    removeTask(taskId)
  })

  ipcMain.handle('goal:create', (_event, input: NewGoalInput) => createGoal(input))

  ipcMain.handle('goal:save', (_event, goal: GoalRecord) => saveGoal(goal))

  ipcMain.handle('goal:list', () => listGoals())

  ipcMain.handle('goal:remove', (_event, goalId: string) => {
    removeGoal(goalId)
  })

  ipcMain.handle('memory:create', (_event, input: NewMemoryInput) => createMemory(input))

  ipcMain.handle('memory:save', (_event, memory: MemoryRecord) => saveMemory(memory))

  ipcMain.handle('memory:list', () => listMemories())

  ipcMain.handle('memory:remove', (_event, memoryId: string) => {
    removeMemory(memoryId)
  })

  ipcMain.handle('memory:clear', () => {
    clearMemories()
  })

  ipcMain.handle('memory:export', async () => {
    const memories = listMemories()
    if (memories.length === 0) {
      return null
    }
    const result = await dialog.showSaveDialog({
      title: 'Export memories',
      defaultPath: 'pixelforge-memories.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (result.canceled || !result.filePath) {
      return null
    }
    const lines: string[] = ['# PixelForge Memory Export', '']
    for (const memory of memories) {
      if (memory.archived) {
        continue
      }
      lines.push(`## ${memory.title}`)
      lines.push('')
      lines.push(`- Type: ${memory.type}`)
      lines.push(`- Confidence: ${memory.confidence}`)
      lines.push(`- Tags: ${memory.tags.join(', ') || '—'}`)
      lines.push(`- Created: ${new Date(memory.createdAt).toISOString()}`)
      if (memory.projectPath) {
        lines.push(`- Project: ${memory.projectPath}`)
      }
      lines.push('')
      lines.push(memory.content)
      lines.push('')
      lines.push('---')
      lines.push('')
    }
    await writeFile(result.filePath, lines.join('\n'), 'utf8')
    return result.filePath
  })

  ipcMain.handle('message:create', (_event, input: NewMessageInput) => createMessage(input))

  ipcMain.handle('message:save', (_event, message: MessageRecord) => saveMessage(message))

  ipcMain.handle('message:list', () => listMessages())

  ipcMain.handle('message:remove', (_event, messageId: string) => {
    removeMessage(messageId)
  })

  ipcMain.handle('conversation:create', (_event, conversation: ConversationRecord) =>
    createConversation(conversation)
  )

  ipcMain.handle('conversation:save', (_event, conversation: ConversationRecord) =>
    saveConversation(conversation)
  )

  ipcMain.handle('conversation:list', () => listConversations())

  ipcMain.handle('dialog:selectProject', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose a project folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:selectFiles', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose files to attach',
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths
  })

  ipcMain.handle('window:toggleFullscreen', () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    win?.setFullScreen(!win.isFullScreen())
  })

  ipcMain.handle('ide:open', (_event, projectPath: string) => {
    const candidates = ['code', 'cursor', 'codium']
    for (const editor of candidates) {
      const result = spawnSync(editor, [projectPath], { stdio: 'ignore' })
      if (result.status === 0 || result.error === undefined) {
        return true
      }
      const errno = result.error as NodeJS.ErrnoException
      if (errno && errno.code !== 'ENOENT') {
        return false
      }
    }
    if (process.platform === 'darwin') {
      const result = spawnSync('open', [projectPath], { stdio: 'ignore' })
      return result.status === 0
    }
    return false
  })

  ipcMain.handle('config:read', async (_event, filePath: string) => {
    try {
      const raw = await readFile(filePath, 'utf8')
      const parsed = JSON.parse(raw) as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, error: 'Config file must contain a JSON object' }
      }
      return { ok: true, config: parsed }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('cli:list', async () => {
    return detectClis()
  })

  ipcMain.handle('cli:defs', () => {
    return listCliDefinitions()
  })

  ipcMain.handle('cli:detect', async (_event, cliId: string) => {
    const cli = await detectOneCli(cliId)
    if (!cli) {
      throw new Error(`Unknown CLI: ${cliId}`)
    }
    return cli
  })

  ipcMain.handle('cli:install', async (_event, cliId: string) => {
    const def = getCliDefinition(cliId)
    if (!def) {
      throw new Error(`Unknown CLI: ${cliId}`)
    }
    const [file, args] = def.installCommand
    const child = spawn(file, args, {
      env: { ...process.env, FORCE_COLOR: '1' }
    })

    child.stdout.on('data', (data: Buffer) => {
      sendToAll('cli:install-output', { cliId, data: data.toString() })
    })
    child.stderr.on('data', (data: Buffer) => {
      sendToAll('cli:install-output', { cliId, data: data.toString() })
    })

    child.on('error', (err) => {
      sendToAll('cli:install-output', {
        cliId,
        data: `Failed to start installer: ${err.message}\n`
      })
      sendToAll('cli:install-status', {
        cliId,
        status: 'error',
        exitCode: -1
      })
    })

    child.on('close', (code) => {
      sendToAll('cli:install-status', {
        cliId,
        status: code === 0 ? 'done' : 'error',
        exitCode: code ?? -1
      })
    })
  })

  ipcMain.handle('session:create', async (_event, options: CreateSessionOptions) => {
    const clis = await detectClis()
    const cli = clis.find((c) => c.id === options.cliId) as CliInfo | undefined
    if (!cli) {
      throw new Error(`Unknown CLI: ${options.cliId}`)
    }
    if (!cli.detected) {
      throw new Error(`CLI "${cli.name}" is not installed on this machine`)
    }
    const session = sessionManager.create(options, cli)
    wireSession(session)
    return { sessionId: session.id }
  })

  ipcMain.handle('session:input', (_event, sessionId: string, data: string) => {
    sessionManager.get(sessionId)?.write(data)
  })

  ipcMain.handle('session:resize', (_event, sessionId: string, cols: number, rows: number) => {
    sessionManager.get(sessionId)?.resize(cols, rows)
  })

  ipcMain.handle('session:stop', (_event, sessionId: string) => {
    sessionManager.stop(sessionId)
  })

  ipcMain.handle('session:restart', (_event, sessionId: string, cols: number, rows: number) => {
    sessionManager.restart(sessionId, cols, rows)
  })

  ipcMain.handle('session:list', () => {
    return sessionManager.list()
  })
}