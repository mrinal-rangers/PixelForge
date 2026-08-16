import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

import type { WorktreeResult } from '../shared/types'

const execFileAsync = promisify(execFile)

function slug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'coworker'
}

/**
 * Create an isolated git worktree checkout for a coworker so it can work on
 * the same repository without touching the shared working copy.
 */
export async function worktreeAdd(basePath: string, name: string): Promise<WorktreeResult> {
  const branch = slug(name)
  const worktreePath = join(basePath, '.pixelforge', branch)
  if (existsSync(worktreePath)) {
    return { ok: true, path: worktreePath, branch }
  }
  try {
    await execFileAsync('git', ['-C', basePath, 'worktree', 'add', '-b', branch, worktreePath])
    return { ok: true, path: worktreePath, branch }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/already exists|already checked out|fatal/i.test(message)) {
      return { ok: true, path: worktreePath, branch }
    }
    return { ok: false, error: message }
  }
}

export async function worktreeRemove(
  basePath: string,
  worktreePath: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await execFileAsync('git', ['-C', basePath, 'worktree', 'remove', '--force', worktreePath])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}