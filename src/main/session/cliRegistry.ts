import { execFile } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import type { CliInfo, InstallCommand } from '../../shared/types'

const execFileAsync = promisify(execFile)

interface CliDefinition {
  id: string
  name: string
  command: string
  description: string
  installHint: string
  installCommand: InstallCommand
  site: string
}

export const KNOWN_CLIS: CliDefinition[] = [
  {
    id: 'codex',
    name: 'Codex',
    command: 'codex',
    description: 'OpenAI’s terminal coding agent. Great for autonomous, repo-wide work.',
    installHint: 'npm install -g @openai/codex',
    installCommand: ['npm', ['install', '-g', '@openai/codex']],
    site: 'https://developers.openai.com/codex/'
  },
  {
    id: 'claude',
    name: 'Claude Code',
    command: 'claude',
    description: 'Anthropic’s agentic coding tool. Strong at big refactors and planning.',
    installHint: 'npm install -g @anthropic-ai/claude-code',
    installCommand: ['npm', ['install', '-g', '@anthropic-ai/claude-code']],
    site: 'https://docs.anthropic.com/en/docs/claude-code'
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    description: 'Open-source coding agent you can run anywhere, in any model.',
    installHint: 'npm install -g opencode-ai',
    installCommand: ['npm', ['install', '-g', 'opencode-ai']],
    site: 'https://opencode.ai'
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    command: 'gemini',
    description: 'Google’s agentic coding CLI, tuned for large codebases.',
    installHint: 'npm install -g @google/gemini-cli',
    installCommand: ['npm', ['install', '-g', '@google/gemini-cli']],
    site: 'https://github.com/google-gemini/gemini-cli'
  },
  {
    id: 'aider',
    name: 'Aider',
    command: 'aider',
    description: 'Python-based pair-programming agent that works with git.',
    installHint: 'python3 -m pip install --user aider-chat',
    installCommand: ['python3', ['-m', 'pip', 'install', '--user', 'aider-chat']],
    site: 'https://aider.chat'
  }
]

const WHICH_CMD = process.platform === 'win32' ? 'where' : 'which'

function candidateBinDirs(): string[] {
  const home = homedir()
  const dirs = [
    join(home, '.local', 'bin'),
    join(home, '.npm-global', 'bin'),
    join(home, '.bun', 'bin'),
    join(home, '.cargo', 'bin'),
    join(home, 'go', 'bin')
  ]
  if (process.platform === 'darwin') {
    for (let minor = 9; minor <= 14; minor++) {
      dirs.push(join(home, 'Library', 'Python', `3.${minor}`, 'bin'))
    }
  }
  return dirs
}

async function resolveCommand(command: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(WHICH_CMD, [command])
    const path = stdout.trim().split(/\r?\n/)[0]
    if (path) {
      return path
    }
  } catch {
    // fall through to candidate dirs
  }
  const isFile = (p: string): boolean => {
    try {
      return existsSync(p) && statSync(p).isFile()
    } catch {
      return false
    }
  }
  for (const dir of candidateBinDirs()) {
    const candidate = join(dir, command)
    if (isFile(candidate)) {
      return candidate
    }
  }
  return undefined
}

async function probeVersion(command: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(command, ['--version'])
    return stdout.trim().split(/\r?\n/)[0]
  } catch {
    return undefined
  }
}

async function detectOne(cli: CliDefinition): Promise<CliInfo> {
  const path = await resolveCommand(cli.command)
  if (!path) {
    return { ...cli, detected: false }
  }
  const version = await probeVersion(path)
  return { ...cli, detected: true, path, version }
}

export async function detectClis(): Promise<CliInfo[]> {
  const results = await Promise.all(KNOWN_CLIS.map(detectOne))
  return results
}

export function listCliDefinitions(): CliInfo[] {
  return KNOWN_CLIS.map((cli) => ({ ...cli, detected: false }))
}

export async function detectOneCli(id: string): Promise<CliInfo | undefined> {
  const def = KNOWN_CLIS.find((c) => c.id === id)
  if (!def) {
    return undefined
  }
  return detectOne(def)
}

export function getCliDefinition(id: string): CliDefinition | undefined {
  return KNOWN_CLIS.find((c) => c.id === id)
}