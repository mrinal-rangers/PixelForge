import { app, shell, BrowserWindow, dialog, ipcMain, nativeImage } from 'electron'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import { detectClis, detectOneCli, getCliDefinition, listCliDefinitions } from './session/cliRegistry'
import { AgentSession, SessionManager } from './session/sessionManager'
import { saveCoworker, listCoworkers, removeCoworker } from './coworkerStore'
import { worktreeAdd, worktreeRemove } from './gitWorktree'
import { createTask, listTasks, removeTask, saveTask } from './taskStore'
import type { CliInfo, CreateSessionOptions, CoworkerConfig, NewTaskInput, TaskRecord } from '../shared/types'

const sessionManager = new SessionManager()

function resolveAppIcon(): Electron.NativeImage | undefined {
  const iconPath = join(__dirname, '../../build/icon.png')
  if (!existsSync(iconPath)) {
    return undefined
  }
  const image = nativeImage.createFromPath(iconPath)
  return image.isEmpty() ? undefined : image
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    title: 'PixelForge',
    icon: resolveAppIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.pixelforge.app')

  if (process.platform === 'darwin' && app.dock) {
    const icon = resolveAppIcon()
    if (icon) {
      app.dock.setIcon(icon)
    }
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  sessionManager.dispose()
})