import type { WorkspaceApi } from '../shared/types'

declare global {
  interface Window {
    workspace: WorkspaceApi
  }
}

export {}