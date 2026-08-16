import { app } from 'electron'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { CoworkerConfig } from '../../shared/types'

let dir: string | null = null

function coworkerDir(): string {
  if (!dir) {
    dir = join(app.getPath('userData'), 'coworkers')
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function configPath(id: string): string {
  return join(coworkerDir(), `${id}.json`)
}

export function saveCoworker(config: CoworkerConfig): void {
  writeFileSync(configPath(config.id), JSON.stringify(config, null, 2), 'utf8')
}

export function listCoworkers(): CoworkerConfig[] {
  const files = readdirSync(coworkerDir()).filter((f) => f.endsWith('.json'))
  const configs: CoworkerConfig[] = []
  for (const file of files) {
    try {
      configs.push(JSON.parse(readFileSync(join(coworkerDir(), file), 'utf8')) as CoworkerConfig)
    } catch {
      // skip corrupt config files
    }
  }
  return configs
}

export function removeCoworker(id: string): void {
  try {
    rmSync(configPath(id), { force: true })
  } catch {
    // ignore
  }
}