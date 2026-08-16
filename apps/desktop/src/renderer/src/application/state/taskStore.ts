import { create } from 'zustand'
import type {
  CompletionReport,
  NewTaskInput,
  TaskEventType,
  TaskQuestion,
  TaskRecord,
  TaskStatus
} from '@shared/types'
import { recomputeDependents, dependenciesMet } from '@shared/rules/task'

/**
 * Task state (renderer side). Pure CRUD, persistence and notifications.
 *
 * Orchestration that touches terminals, the office store or the memory engine
 * lives in application/services/taskRunner so this store stays dependency-free.
 */

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
  notify: (kind: TaskNotificationKind, title: string, taskId?: string, detail?: string) => void
  createTask: (input: NewTaskInput) => Promise<TaskRecord | null>
  removeTask: (id: string) => void
  updateTask: (id: string, changes: Partial<TaskRecord>) => void
  addEvent: (id: string, type: TaskEventType, text: string) => void
  addProgress: (id: string, text: string) => void
  touch: (id: string) => void
  raiseQuestion: (id: string, question: Omit<TaskQuestion, 'id' | 'answeredAt'>) => void
  answerQuestion: (id: string, questionId: number, answer: string) => void
  setStatus: (id: string, status: TaskStatus) => void
  setReport: (id: string, report: CompletionReport) => void
  setFiles: (id: string, files: string[]) => void
  assignTask: (id: string, agentId: string | undefined) => void
  startTask: (id: string) => TaskRecord | null
  pauseTask: (id: string) => void
  cancelTask: (id: string) => void
  completeTask: (id: string, report?: CompletionReport) => TaskRecord | null
  failTask: (id: string, reason: string) => void
  returnToTodo: (id: string) => void
  sendInstructions: (id: string, text: string) => TaskRecord | null
}

let notifyCounter = 0
let eventCounter = 0

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

    notify: (kind, title, taskId, detail) => {
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
    },

    createTask: async (input) => {
      let created: TaskRecord | null = null
      try {
        created = await window.workspace.taskCreate(input)
      } catch {
        return null
      }
      const tasks = recomputeDependents({ ...get().tasks, [created.id]: created })
      set({ tasks, selectedTaskId: created.id })
      get().notify('info', 'Task created', created.id, created.title)
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
      get().notify(
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
      const status = question ? 'ongoing' : task.status
      commit(id, (current) => ({
        ...current,
        status,
        questions: current.questions.map((q) =>
          q.id === questionId ? { ...q, answer, answeredAt: Date.now() } : q
        )
      }))
      get().notify('info', 'Answer sent', id, answer)
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
        get().notify('info', 'Task assigned', id, task.title)
      }
    },

    startTask: (id) => {
      const task = get().tasks[id]
      if (!task) {
        return null
      }
      if (!dependenciesMet(task, get().tasks)) {
        get().notify(
          'warning',
          'Waiting for dependencies',
          id,
          `${task.title} cannot start until its dependencies are done.`
        )
        return null
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
      if (!already) {
        get().notify('success', 'Task started', id, task.title)
      }
      return record
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
      get().notify('info', 'Task paused', id)
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
      get().notify('danger', 'Task cancelled', id)
    },

    completeTask: (id, report) => {
      const now = Date.now()
      const record = commit(id, (t) => ({
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
      get().notify('success', 'Task completed', id, get().tasks[id]?.title)
      return record
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
      get().notify('danger', 'Task failed', id, reason)
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
        return null
      }
      commit(id, (t) => ({
        ...t,
        events: [
          ...t.events,
          { id: ++eventCounter, type: 'instruction', text: text.trim(), ts: Date.now() }
        ]
      }))
      get().notify('info', 'Instructions sent', id)
      return get().tasks[id] ?? null
    }
  }
})