import { create } from 'zustand'
import type {
  GoalQuestion,
  GoalRecord,
  GoalReport,
  GoalRetry,
  GoalStatus,
  NewGoalInput
} from '@shared/types'

interface GoalState {
  goals: Record<string, GoalRecord>
  selectedGoalId: string | null
  hydrated: boolean
  hydrate: () => Promise<void>
  selectGoal: (id: string | null) => void
  createGoal: (input: NewGoalInput) => Promise<GoalRecord | null>
  removeGoal: (id: string) => void
  updateGoal: (id: string, changes: Partial<GoalRecord>) => void
  setStatus: (id: string, status: GoalStatus) => void
  addQuestion: (id: string, q: Omit<GoalQuestion, 'id' | 'answeredAt' | 'createdAt'>) => void
  answerQuestion: (id: string, questionId: number, answer: string) => void
  addRetry: (id: string, r: Omit<GoalRetry, 'id'>) => void
  setReport: (id: string, report: GoalReport) => void
}

let goalQuestionCounter = 0
let goalRetryCounter = 0

export const useGoalStore = create<GoalState>()((set, get) => {
  const commit = (goalId: string, mutate: (goal: GoalRecord) => GoalRecord): void => {
    const goal = get().goals[goalId]
    if (!goal) {
      return
    }
    const record = { ...mutate(goal), updatedAt: Date.now() }
    window.workspace.goalSave(record).catch(() => {
      // persistence is best-effort
    })
    set({ goals: { ...get().goals, [goalId]: record } })
  }

  return {
    goals: {},
    selectedGoalId: null,
    hydrated: false,

    hydrate: async () => {
      try {
        const goals = await window.workspace.goalList()
        const map: Record<string, GoalRecord> = {}
        for (const goal of goals) {
          map[goal.id] = goal
        }
        set({ goals: map, hydrated: true })
      } catch {
        set({ hydrated: true })
      }
    },

    selectGoal: (id) => set({ selectedGoalId: id }),

    createGoal: async (input) => {
      let created: GoalRecord | null = null
      try {
        created = await window.workspace.goalCreate(input)
      } catch {
        return null
      }
      set({ goals: { ...get().goals, [created.id]: created }, selectedGoalId: created.id })
      return created
    },

    removeGoal: (id) => {
      window.workspace.goalRemove(id).catch(() => {
        // best-effort
      })
      const goals = { ...get().goals }
      delete goals[id]
      set({
        goals,
        selectedGoalId: get().selectedGoalId === id ? null : get().selectedGoalId
      })
    },

    updateGoal: (id, changes) => {
      commit(id, (goal) => ({ ...goal, ...changes }))
    },

    setStatus: (id, status) => {
      commit(id, (goal) => ({
        ...goal,
        status,
        completedAt: status === 'completed' ? (goal.completedAt ?? Date.now()) : goal.completedAt
      }))
    },

    addQuestion: (id, q) => {
      commit(id, (goal) => ({
        ...goal,
        questions: [
          ...goal.questions,
          { ...q, id: ++goalQuestionCounter, answeredAt: null, createdAt: Date.now() }
        ]
      }))
    },

    answerQuestion: (id, questionId, answer) => {
      commit(id, (goal) => ({
        ...goal,
        questions: goal.questions.map((q) =>
          q.id === questionId ? { ...q, answer, answeredAt: Date.now() } : q
        )
      }))
    },

    addRetry: (id, r) => {
      commit(id, (goal) => ({
        ...goal,
        retries: [...goal.retries, { ...r, id: ++goalRetryCounter }]
      }))
    },

    setReport: (id, report) => {
      commit(id, (goal) => ({ ...goal, report }))
    }
  }
})