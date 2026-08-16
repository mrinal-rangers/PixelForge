import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'

import * as pty from 'node-pty'

import type { CliInfo, CreateSessionOptions, SessionInfo, SessionStatus } from '../../shared/types'

export interface SessionEvents {
  output: (data: string) => void
  status: (info: SessionInfo) => void
}

export class AgentSession {
  readonly id: string
  readonly projectPath: string
  readonly cli: CliInfo
  readonly commandOverride?: string
  readonly name: string
  readonly role: string
  readonly description?: string
  readonly goal?: string
  readonly avatarId?: string
  readonly accent?: string
  readonly autoMode?: boolean
  readonly resumeSessionId?: string

  private emitter = new EventEmitter()
  private proc?: pty.IPty
  private _status: SessionStatus = 'idle'
  private _startedAt?: number
  private _exitCode: number | null = null
  private _error: string | null = null
  private stopRequested = false

  constructor(options: CreateSessionOptions, cli: CliInfo) {
    this.id = randomUUID()
    this.projectPath = options.projectPath
    this.cli = cli
    this.commandOverride = options.command
    this.name = options.name ?? cli.name
    this.role = options.role ?? 'Developer'
    this.description = options.description
    this.goal = options.goal
    this.avatarId = options.avatarId
    this.accent = options.accent
    this.autoMode = options.autoMode
    this.resumeSessionId = options.resumeSessionId
  }

  get status(): SessionStatus {
    return this._status
  }

  get info(): SessionInfo {
    return {
      id: this.id,
      status: this._status,
      projectPath: this.projectPath,
      cli: this.cli,
      name: this.name,
      role: this.role,
      description: this.description,
      goal: this.goal,
      avatarId: this.avatarId,
      accent: this.accent,
      autoMode: this.autoMode,
      resumeSessionId: this.resumeSessionId,
      startedAt: this._startedAt,
      exitCode: this._exitCode,
      error: this._error
    }
  }

  on<K extends keyof SessionEvents>(event: K, listener: SessionEvents[K]): void {
    this.emitter.on(event, listener)
  }

  onOutput(listener: (data: string) => void): void {
    this.emitter.on('output', listener)
  }

  onStatus(listener: (info: SessionInfo) => void): void {
    this.emitter.on('status', listener)
  }

  start(cols = 80, rows = 24): void {
    if (this.proc) {
      return
    }
    const command = this.commandOverride ?? this.cli.path ?? this.cli.command
    const { shell, shellArgs } = buildShellCommand(command)

    this.stopRequested = false
    this._exitCode = null
    this._error = null
    this._startedAt = Date.now()
    this.setStatus('starting')

    try {
      const proc = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: this.projectPath,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          FORCE_COLOR: '1'
        }
      })

      proc.onData((data) => {
        this.emitter.emit('output', data)
        if (this._status === 'starting') {
          this.setStatus('running')
        }
      })

      proc.onExit(({ exitCode }) => {
        if (this.proc !== proc) {
          return
        }
        this._exitCode = exitCode
        if (this.stopRequested) {
          this.setStatus('stopped')
        } else if (exitCode === 0) {
          this.setStatus('completed')
        } else {
          this._error = `Process exited with code ${exitCode}`
          this.setStatus('error')
        }
        this.proc = undefined
      })

      this.proc = proc
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err)
      this.setStatus('error')
    }
  }

  write(data: string): void {
    this.proc?.write(data)
  }

  resize(cols: number, rows: number): void {
    try {
      this.proc?.resize(cols, rows)
    } catch {
      // terminal may be gone; ignore
    }
  }

  stop(): void {
    if (!this.proc) {
      return
    }
    this.stopRequested = true
    const proc = this.proc
    try {
      proc.kill('SIGTERM')
    } catch {
      // already dead
    }
    setTimeout(() => {
      if (this.proc === proc) {
        try {
          proc.kill('SIGKILL')
        } catch {
          // process already gone
        }
      }
    }, 2000)
  }

  restart(cols?: number, rows?: number): void {
    if (this.proc) {
      this.stop()
      this.proc = undefined
    }
    this.start(cols, rows)
  }

  dispose(): void {
    this.stop()
    this.emitter.removeAllListeners()
  }

  private setStatus(status: SessionStatus): void {
    this._status = status
    this.emitter.emit('status', this.info)
  }
}

interface ShellPlan {
  shell: string
  shellArgs: string[]
}

function buildShellCommand(command: string): ShellPlan {
  const quoted = shellQuote(command)
  if (process.platform === 'win32') {
    const comSpec = process.env.COMSPEC || 'cmd.exe'
    return { shell: comSpec, shellArgs: ['/d', '/s', '/c', `"${command} "`] }
  }
  if (process.platform === 'darwin') {
    const shell = process.env.SHELL || '/bin/zsh'
    return { shell, shellArgs: ['-l', '-c', `exec ${quoted}`] }
  }
  const shell = process.env.SHELL || '/bin/bash'
  return { shell, shellArgs: ['-lc', `exec ${quoted}`] }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export class SessionManager {
  private sessions = new Map<string, AgentSession>()

  create(options: CreateSessionOptions, cli: CliInfo): AgentSession {
    const session = new AgentSession(options, cli)
    this.sessions.set(session.id, session)
    session.start(options.cols, options.rows)
    return session
  }

  get(id: string): AgentSession | undefined {
    return this.sessions.get(id)
  }

  list(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.info)
  }

  stop(id: string): void {
    this.sessions.get(id)?.stop()
  }

  restart(id: string, cols?: number, rows?: number): void {
    this.sessions.get(id)?.restart(cols, rows)
  }

  remove(id: string): void {
    const session = this.sessions.get(id)
    if (session) {
      session.dispose()
      this.sessions.delete(id)
    }
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      session.dispose()
    }
    this.sessions.clear()
  }
}