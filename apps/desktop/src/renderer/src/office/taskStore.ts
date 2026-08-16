import { create } from 'zustand'
import type {
  CompletionReport,
  NewTaskInput,
  TaskEventType,
  TaskQuestion,
  TaskRecord,
  TaskStatus
} from '@shared/types'
import { useOfficeStore } from './store'

export type TaskNotificationKind = 'info' | 'warning' | 'danger' | 'success'

export interface TaskNotification {
  id: number
  kind: TaskNotificationKind
  title: string
  detail?: string
  taskId?: string
  ts: number
}

interface TaskState {
  tasks: Record<string, TaskRecord>
  selectedTaskId: string | null
  notifications: TaskNotification[]
  hydrated: boolean
  hydrate: () => Promise<void>
  selectTask: (id: string | null) => void
  dismissNotification: (id: number) => void
  createTask: (input: NewTaskInput) => Promise<TaskRecord | null>
  removeTask: (id: string) => void
  updateTask: (id: string, changes: Partial<TaskRecord>) => void
  addEvent: (id: string, type: TaskEventType, text: string) => void
  addProgress: (id: string, text: string) => void
  touch: (id: string) => void
  raiseQuestion: (id: string, question: Omit<TaskQuestion, 'id' | 'answeredAt'>) => void
  answerQuestion: (id: string, questionId: number, answer: string) => void
  answerQuestionForAgent: (agentId: string, answer: string) => void
  setStatus: (id: string, status: TaskStatus) => void
  setReport: (id: string, report: CompletionReport) => void
  setFiles: (id: string, files: string[]) => void
  assignTask: (id: string, agentId: string | undefined) => void
  startTask: (id: string) => void
  pauseTask: (id: string) => void
  cancelTask: (id: string) => void
  completeTask: (id: string, report?: CompletionReport) => void
  failTask: (id: string, reason: string) => void
  returnToTodo: (id: string) => void
  sendInstructions: (id: string, text: string) => void
}

let notifyCounter = 0
let eventCounter = 0

function recomputeDependents(tasks: Record<string, TaskRecord>): Record<string, TaskRecord> {
  const dependents = new Map<string, string[]>()
  for (const task of Object.values(tasks)) {
    for (const dep of task.dependencies) {
      const list = dependents.get(dep) ?? []
      if (!list.includes(task.id)) {
        list.push(task.id)
      }
      dependents.set(dep, list)
    }
  }
  const next: Record<string, TaskRecord> = {}
  for (const [id, task] of Object.entries(tasks)) {
    next[id] = { ...task, dependents: dependents.get(id) ?? [] }
  }
  return next
}

export function dependenciesMet(task: TaskRecord, tasks: Record<string, TaskRecord>): boolean {
  return task.dependencies.every((id) => tasks[id]?.status === 'done')
}

export interface AgentTaskLoad {
  active: TaskRecord[]
  needsInput: TaskRecord[]
  queue: TaskRecord[]
  history: TaskRecord[]
}

export function taskLoadFor(
  tasks: Record<string, TaskRecord>,
  agentId: string
): AgentTaskLoad {
  const list = Object.values(tasks).filter((t) => t.assignedAgentId === agentId)
  return {
    active: list.filter((t) => t.status === 'ongoing'),
    needsInput: list.filter((t) => t.status === 'needs-input'),
    queue: list.filter((t) => t.status === 'todo'),
    history: list.filter((t) => t.status === 'done' || t.status === 'failed')
  }
}

/** True when the coworker already has an active task (and it is not this one). */
export function agentIsBusy(
  tasks: Record<string, TaskRecord>,
  agentId: string,
  excludeTaskId?: string
): boolean {
  return Object.values(tasks).some(
    (t) =>
      t.id !== excludeTaskId &&
      t.assignedAgentId === agentId &&
      (t.status === 'ongoing' || t.status === 'needs-input')
  )
}

function assignmentMessage(task: TaskRecord): string {
  const lines = [
    `Task [${task.id}]: ${task.title}`,
    '',
    task.instructions,
    task.requirements ? `Completion requirements:\n${task.requirements}` : '',
    task.dependencies.length > 0 ? 'This task may wait until its dependencies are done.' : '',
    '',
    'If you hit a question or need a decision, wait for the user to answer instead of guessing.'
  ]
  return lines.filter((line) => line.length > 0).join('\n')
}

/** Write a line into a coworker's live terminal. Returns false when unreachable. */
function writeToAgent(agentId: string, text: string): boolean {
  const agent = useOfficeStore.getState().agents[agentId]
  if (!agent || agent.cliId === '') {
    return false
  }
  if (
    agent.status === 'idle' ||
    agent.status === 'stopped' ||
    agent.status === 'completed' ||
    agent.status === 'error'
  ) {
    return false
  }
  window.workspace.sendInput(agentId, text + '\r')
  useOfficeStore.getState().recordInput(agentId)
  return true
}

const touchPersist = new Map<string, number>()

export const useTaskStore = create<TaskState>()((set, get) => {
  const commit = (taskId: string, mutate: (task: TaskRecord) => TaskRecord): TaskRecord | null => {
    const task = get().tasks[taskId]
    if (!task) {
      return null
    }
    const record = { ...mutate(task), updatedAt: Date.now() }
    const tasks = recomputeDependents({ ...get().tasks, [taskId]: record })
    window.workspace.taskSave(record).catch(() => {
      // persistence is best-effort
    })
    set({ tasks })
    return record
  }

  const notify = (kind: TaskNotificationKind, title: string, taskId?: string, detail?: string): void => {
    const id = ++notifyCounter
    set({
      notifications: [
        ...get().notifications,
        { id, kind, title, taskId, detail, ts: Date.now() }
      ].slice(-6)
    })
    setTimeout(() => {
      set({ notifications: get().notifications.filter((n) => n.id !== id) })
    }, 6500)
  }

  return {
    tasks: {},
    selectedTaskId: null,
    notifications: [],
    hydrated: false,

    hydrate: async () => {
      try {
        const tasks = await window.workspace.taskList()
        const map: Record<string, TaskRecord> = {}
        for (const task of tasks) {
          map[task.id] = task
        }
        set({ tasks: recomputeDependents(map), hydrated: true })
      } catch {
        set({ hydrated: true })
      }
    },

    selectTask: (id) => set({ selectedTaskId: id }),

    dismissNotification: (id) =>
      set({ notifications: get().notifications.filter((n) => n.id !== id) }),

    createTask: async (input) => {
      let created: TaskRecord | null = null
      try {
        created = await window.workspace.taskCreate(input)
      } catch {
        return null
      }
      const tasks = recomputeDependents({ ...get().tasks, [created.id]: created })
      set({ tasks, selectedTaskId: created.id })
      notify('info', 'Task created', created.id, created.title)
      return created
    },

    removeTask: (id) => {
      window.workspace.taskRemove(id).catch(() => {
        // best-effort
      })
      const tasks = { ...get().tasks }
      delete tasks[id]
      set({
        tasks: recomputeDependents(tasks),
        selectedTaskId: get().selectedTaskId === id ? null : get().selectedTaskId
      })
    },

    updateTask: (id, changes) => {
      commit(id, (task) => ({ ...task, ...changes }))
    },

    addEvent: (id, type, text) => {
      commit(id, (task) => ({
        ...task,
        events: [...task.events, { id: ++eventCounter, type, text, ts: Date.now() }]
      }))
    },

    addProgress: (id, text) => {
      commit(id, (task) => ({
        ...task,
        progress: [...task.progress, text].slice(-80)
      }))
    },

    touch: (id) => {
      const task = get().tasks[id]
      if (!task) {
        return
      }
      const now = Date.now()
      const lastPersist = touchPersist.get(id) ?? 0
      const record = { ...task, updatedAt: now }
      if (now - lastPersist > 5000) {
        touchPersist.set(id, now)
        window.workspace.taskSave(record).catch(() => {
          // best-effort
        })
      }
      set({ tasks: { ...get().tasks, [id]: record } })
    },

    raiseQuestion: (id, question) => {
      commit(id, (task) => {
        const q: TaskQuestion = { ...question, id: ++eventCounter, answeredAt: null }
        return {
          ...task,
          status: 'needs-input',
          questions: [...task.questions, q]
        }
      })
      notify(
        'warning',
        'Needs input',
        id,
        `${get().tasks[id]?.title} is waiting for an answer.`
      )
    },

    answerQuestion: (id, questionId, answer) => {
      const task = get().tasks[id]
      if (!task) {
        return
      }
      const question = task.questions.find((q) => q.id === questionId)
      const agentId = task.assignedAgentId
      const status = question ? 'ongoing' : task.status
      commit(id, (current) => ({
        ...current,
        status,
        questions: current.questions.map((q) =>
          q.id === questionId ? { ...q, answer, answeredAt: Date.now() } : q
        )
      }))
      if (agentId) {
        writeToAgent(agentId, answer)
      }
      notify('info', 'Answer sent', id, answer)
    },

    answerQuestionForAgent: (agentId, answer) => {
      const open = Object.values(get().tasks).find(
        (t) =>
          t.assignedAgentId === agentId &&
          t.status === 'needs-input' &&
          t.questions.some((q) => q.answeredAt == null)
      )
      if (!open) {
        return
      }
      const question = open.questions.find((q) => q.answeredAt == null)
      if (question) {
        get().answerQuestion(open.id, question.id, answer)
      }
    },

    setStatus: (id, status) => {
      commit(id, (task) => ({ ...task, status }))
    },

    setReport: (id, report) => {
      commit(id, (task) => ({ ...task, report }))
    },

    setFiles: (id, files) => {
      commit(id, (task) => ({ ...task, filesChanged: files }))
    },

    assignTask: (id, agentId) => {
      const task = get().tasks[id]
      if (!task) {
        return
      }
      const previous = task.assignedAgentId
      commit(id, (t) => ({
        ...t,
        assignedAgentId: agentId,
        status: agentId ? t.status : t.status,
        events: [
          ...t.events,
          {
            id: ++eventCounter,
            type: agentId ? 'assigned' : 'note',
            text: agentId ? 'Assigned to coworker' : 'Unassigned',
            ts: Date.now()
          }
        ]
      }))
      if (agentId && agentId !== previous) {
        notify('info', 'Task assigned', id, task.title)
      }
    },

    startTask: (id) => {
      const task = get().tasks[id]
      if (!task) {
        return
      }
      if (!dependenciesMet(task, get().tasks)) {
        notify(
          'warning',
          'Waiting for dependencies',
          id,
          `${task.title} cannot start until its dependencies are done.`
        )
        return
      }
      const already = task.status === 'ongoing'
      const record = commit(id, (t) => ({
        ...t,
        status: 'ongoing',
        startedAt: t.startedAt ?? Date.now(),
        pausedAt: undefined,
        events: [
          ...t.events,
          { id: ++eventCounter, type: 'started', text: 'Work started', ts: Date.now() }
        ]
      }))
      if (record?.assignedAgentId) {
        const delivered = writeToAgent(record.assignedAgentId, assignmentMessage(record))
        if (!delivered) {
          notify(
            'warning',
            'Coworker not running',
            id,
            `${useOfficeStore.getState().agents[record.assignedAgentId]?.name ?? 'Coworker'} has no live terminal. The task is queued until it is running.`
          )
        }
      }
      if (!already) {
        notify('success', 'Task started', id, task.title)
      }
    },

    pauseTask: (id) => {
      commit(id, (t) => ({
        ...t,
        status: 'todo',
        pausedAt: Date.now(),
        events: [
          ...t.events,
          { id: ++eventCounter, type: 'paused', text: 'Work paused', ts: Date.now() }
        ]
      }))
      notify('info', 'Task paused', id)
    },

    cancelTask: (id) => {
      commit(id, (t) => ({
        ...t,
        status: 'failed',
        events: [
          ...t.events,
          { id: ++eventCounter, type: 'cancelled', text: 'Task cancelled', ts: Date.now() }
        ]
      }))
      notify('danger', 'Task cancelled', id)
    },

    completeTask: (id, report) => {
      const now = Date.now()
      commit(id, (t) => ({
        ...t,
        status: 'done',
        report: report ?? t.report,
        filesChanged: report?.files ? [...new Set([...t.filesChanged, ...report.files])] : t.filesChanged,
        completedAt: now,
        events: [
          ...t.events,
          { id: ++eventCounter, type: 'completed', text: 'Task completed', ts: now }
        ]
      }))
      notify('success', 'Task completed', id, get().tasks[id]?.title)
    },

    failTask: (id, reason) => {
      commit(id, (t) => ({
        ...t,
        status: 'failed',
        events: [
          ...t.events,
          { id: ++eventCounter, type: 'failed', text: reason, ts: Date.now() }
        ]
      }))
      notify('danger', 'Task failed', id, reason)
    },

    returnToTodo: (id) => {
      commit(id, (t) => ({
        ...t,
        status: 'todo',
        startedAt: undefined,
        pausedAt: undefined,
        events: [
          ...t.events,
          { id: ++eventCounter, type: 'note', text: 'Returned to Todo', ts: Date.now() }
        ]
      }))
    },

    sendInstructions: (id, text) => {
      const task = get().tasks[id]
      if (!task || !text.trim()) {
        return
      }
      commit(id, (t) => ({
        ...t,
        events: [
          ...t.events,
          { id: ++eventCounter, type: 'instruction', text: text.trim(), ts: Date.now() }
        ]
      }))
      if (task.assignedAgentId) {
        writeToAgent(task.assignedAgentId, text.trim())
      }
      notify('info', 'Instructions sent', id)
    }
  }
})