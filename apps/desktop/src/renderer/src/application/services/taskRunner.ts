import type { CompletionReport, TaskRecord } from '@shared/types'
import { useTaskStore } from '../state/taskStore'
import { useOfficeStore } from '../state/officeStore'
import { memoryBlockForTask, captureTaskMemory, rememberAnswer } from './memoryEngine'

/**
 * Task orchestration. Composes the pure task store with terminal I/O and the
 * memory engine. UI and the goal engine call these instead of poking the
 * store directly, so state transitions stay pure and testable.
 */

function assignmentMessage(task: TaskRecord): string {
  const agent = useOfficeStore.getState().agents[task.assignedAgentId ?? '']
  const memory = memoryBlockForTask(
    task,
    agent
      ? { id: agent.id, role: agent.role, projectPath: agent.projectPath }
      : undefined
  )
  const lines = [
    `Task [${task.id}]: ${task.title}`,
    '',
    task.instructions,
    task.requirements ? `Completion requirements:\n${task.requirements}` : '',
    task.dependencies.length > 0 ? 'This task may wait until its dependencies are done.' : '',
    memory,
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

export function startTask(id: string): void {
  const record = useTaskStore.getState().startTask(id)
  if (!record?.assignedAgentId) {
    return
  }
  const delivered = writeToAgent(record.assignedAgentId, assignmentMessage(record))
  if (!delivered) {
    useTaskStore.getState().notify(
      'warning',
      'Coworker not running',
      id,
      `${useOfficeStore.getState().agents[record.assignedAgentId]?.name ?? 'Coworker'} has no live terminal. The task is queued until it is running.`
    )
  }
}

export function answerQuestion(id: string, questionId: number, answer: string): void {
  const task = useTaskStore.getState().tasks[id]
  if (!task) {
    return
  }
  const question = task.questions.find((q) => q.id === questionId)
  const agentId = task.assignedAgentId
  useTaskStore.getState().answerQuestion(id, questionId, answer)
  if (agentId) {
    writeToAgent(agentId, answer)
  }
  if (question) {
    rememberAnswer(question, answer, task)
  }
}

export function answerQuestionForAgent(agentId: string, answer: string): void {
  const open = Object.values(useTaskStore.getState().tasks).find(
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
    answerQuestion(open.id, question.id, answer)
  }
}

export function completeTask(id: string, report?: CompletionReport): void {
  const record = useTaskStore.getState().completeTask(id, report)
  if (record) {
    void captureTaskMemory(record)
  }
}

export function sendInstructions(id: string, text: string): void {
  const task = useTaskStore.getState().sendInstructions(id, text)
  if (task?.assignedAgentId) {
    writeToAgent(task.assignedAgentId, text.trim())
  }
}