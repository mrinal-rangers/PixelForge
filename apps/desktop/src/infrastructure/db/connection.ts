import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

/**
 * SQLite connection for the desktop app. Stores full structured records
 * (status, assignments, dependencies, questions, answers, reports, events) as
 * JSON on dedicated tables. Large terminal transcripts and project files stay
 * outside the database.
 */
let db: DatabaseSync | null = null

export function open(): DatabaseSync {
  if (db) {
    return db
  }
  const dir = app.getPath('userData')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  db = new DatabaseSync(join(dir, 'pixelforge-tasks.db'))
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      status TEXT NOT NULL,
      assigned_agent_id TEXT,
      project_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      type TEXT NOT NULL,
      project_path TEXT,
      related_agent_id TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      kind TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      recipient_id TEXT,
      status TEXT NOT NULL,
      kind TEXT NOT NULL,
      task_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
  return db
}