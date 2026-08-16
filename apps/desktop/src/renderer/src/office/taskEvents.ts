import type { CompletionReport, TaskRecord } from '@shared/types'
import { useTaskStore } from './taskStore'

/**
 * Bridge between raw terminal output and the task system.
 *
 * The task system is the source of truth: the renderer validates structured
 * events reported by a coworker and applies them as controlled updates.
 * Unstructured output only bumps activity timestamps or, when the prompt
 * clearly reads as a question, raises a needs-input request.
 */

const MARKER_RE = /@pixelforge\/event\s+(\{.*?\})/g

interface StructuredEvent {
  type?: string
  task?: string
  text?: string
  need?: string
  why?: string
  consequence?: string
  choices?: string[]
  recommended?: string
  files?: string[]
  summary?: string
  commands?: string[]
  tests?: string
  concerns?: string
  next?: string[]
  reason?: string
}

function stripAnsi(data: string): string {
  // eslint-disable-next-line no-control-regex
  return data.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
}

function looksLikePrompt(data: string): boolean {
  const lines = stripAnsi(data)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
  const last = (lines[lines.length - 1] ?? '').trimEnd()
  if (!last) {
    return false
  }
  return (
    /[>?]$/.test(last) ||
    /\((y|n)\/(y|n)\)|y\/n|Y\/N|n\/y|N\/y/i.test(last) ||
    /\[[yY]\/[nN]\]/.test(last) ||
    /press enter|press return/i.test(last) ||
    /select an option|choose one|your answer/i.test(last)
  )
}

function looksLikeQuestion(data: string): boolean {
  const lines = stripAnsi(data)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
  const last = (lines[lines.length - 1] ?? '').trim()
  if (!last) {
    return false
  }
  return (
    /[?？]/.test(last) ||
    /which (one|of|approach|option)/i.test(last) ||
    /do you want|shall i|should i|can i|may i|proceed|confirm|approve|ok to/i.test(last)
  )
}

function findTask(tasks: TaskRecord[], sessionId: string, evt?: StructuredEvent): TaskRecord | null {
  if (evt?.task) {
    const direct = tasks.find((t) => t.id === evt.task && t.assignedAgentId === sessionId)
    if (direct) {
      return direct
    }
  }
  return (
    tasks.find((t) => t.status === 'ongoing' && t.assignedAgentId === sessionId) ??
    tasks.find((t) => t.status === 'needs-input' && t.assignedAgentId === sessionId) ??
    null
  )
}

function handleStructured(
  evt: StructuredEvent,
  task: TaskRecord
): void {
  const store = useTaskStore.getState()
  switch (evt.type) {
    case 'progress':
      if (evt.text) {
        store.addProgress(task.id, evt.text)
      }
      break
    case 'step':
      if (evt.text) {
        store.addProgress(task.id, evt.text)
        store.addEvent(task.id, 'note', evt.text)
      }
      break
    case 'question':
      store.raiseQuestion(task.id, {
        need: evt.need ?? evt.text ?? 'The coworker needs your input to continue.',
        why: evt.why,
        consequence: evt.consequence,
        choices: evt.choices,
        recommended: evt.recommended
      })
      break
    case 'files':
      if (Array.isArray(evt.files)) {
        store.setFiles(task.id, evt.files)
      }
      break
    case 'done': {
      const report: CompletionReport = {
        summary: evt.summary ?? evt.text ?? '',
        files: evt.files ?? [],
        commands: evt.commands ?? [],
        tests: evt.tests ?? '',
        concerns: evt.concerns ?? '',
        next: evt.next ?? []
      }
      store.completeTask(task.id, report)
      break
    }
    case 'failed':
      store.failTask(task.id, evt.reason ?? evt.text ?? 'The coworker reported a failure.')
      break
    default:
      break
  }
}

/** Process terminal output for a session and feed validated events to tasks. */
export function parseTaskOutput(sessionId: string, data: string): void {
  const state = useTaskStore.getState()
  if (!state.hydrated) {
    return
  }
  const tasks = Object.values(state.tasks).filter((t) => t.assignedAgentId === sessionId)
  if (tasks.length === 0) {
    return
  }

  const clean = stripAnsi(data)
  let matched = false
  const marker = new RegExp(MARKER_RE.source, 'g')
  let match: RegExpExecArray | null
  while ((match = marker.exec(clean)) !== null) {
    matched = true
    try {
      const parsed = JSON.parse(match[1] ?? '{}') as StructuredEvent
      if (parsed === null || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
        continue
      }
      const task = findTask(tasks, sessionId, parsed)
      if (task) {
        handleStructured(parsed, task)
      }
    } catch {
      // ignore malformed event markers
    }
  }

  if (matched) {
    return
  }

  const active =
    tasks.find((t) => t.status === 'ongoing') ??
    tasks.find((t) => t.status === 'needs-input')
  if (!active) {
    return
  }

  if (active.status === 'ongoing') {
    const hasOpen = active.questions.some((q) => q.answeredAt == null)
    if (!hasOpen && looksLikePrompt(data) && looksLikeQuestion(data)) {
      const lines = clean
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-3)
      useTaskStore
        .getState()
        .raiseQuestion(active.id, {
          need: lines.join(' ') || 'The coworker is waiting for your input.',
          consequence: 'The task stays blocked until you answer.'
        })
      return
    }
    useTaskStore.getState().touch(active.id)
  }
}