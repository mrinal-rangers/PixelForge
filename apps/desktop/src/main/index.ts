import { app, shell, BrowserWindow, dialog, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import { detectClis, detectOneCli, getCliDefinition, listCliDefinitions } from './session/cliRegistry'
import { AgentSession, SessionManager } from './session/sessionManager'
import type { CliInfo, CreateSessionOptions } from '../shared/types'

const sessionManager = new SessionManager()

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    title: 'Agent Workspace',
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
  electronApp.setAppUserModelId('com.agent-workspace.app')

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