import { useOfficeStore } from './state/officeStore'
import { useTaskStore } from './state/taskStore'
import { useGoalStore } from './state/goalStore'
import { useMemoryStore } from './state/memoryStore'
import { parseTaskOutput } from './events/taskEvents'
import { parseGoalOutput } from './events/goalEvents'
import { parseMemoryOutput } from './events/memoryEvents'
import { startGoalEngine } from './services/goalEngine'

export interface ApplicationBootstrapOptions {
  onSessionsLoaded?: () => void
}

export function initApplication(options: ApplicationBootstrapOptions = {}): void {
  window.workspace.onSessionStatus(({ session }) => {
    useOfficeStore.getState().upsertAgent(session)
    const tasks = Object.values(useTaskStore.getState().tasks).filter(
      (t) => t.assignedAgentId === session.id && t.status === 'ongoing'
    )
    if (session.status === 'error') {
      for (const task of tasks) {
        useTaskStore.getState().failTask(task.id, 'The terminal process failed.')
      }
    } else if (session.status === 'stopped' || session.status === 'completed') {
      for (const task of tasks) {
        useTaskStore.getState().setStatus(task.id, 'todo')
        useTaskStore.getState().addEvent(
          task.id,
          'note',
          session.status === 'completed'
            ? 'Session ended before the task reported completion'
            : 'Terminal stopped; task paused'
        )
      }
    }
  })

  window.workspace.onSessionOutput(({ sessionId, data }) => {
    useOfficeStore.getState().recordOutput(sessionId, data)
    parseTaskOutput(sessionId, data)
    parseGoalOutput(sessionId, data)
    parseMemoryOutput(sessionId, data)
  })

  void useTaskStore.getState().hydrate()
  void useGoalStore.getState().hydrate()
  void useMemoryStore.getState().hydrate()

  startGoalEngine()

  window.workspace
    .listSessions()
    .then((sessions) => {
      for (const session of sessions) {
        useOfficeStore.getState().upsertAgent(session)
      }
    })
    .catch(() => {
      // sessions list is best-effort on startup
    })
    .finally(() => {
      options.onSessionsLoaded?.()
    })

  window.workspace
    .listCoworkers()
    .then((configs) => {
      useOfficeStore.getState().hydrateCoworkers(configs)
    })
    .catch(() => {
      // coworker configs are best-effort on startup
    })
}