import type { Worktree } from './worktree/types'

/** Longest a CLI create waits: the VM boots, bootstraps, and may wait on a trust prompt. */
export const RECIPE_WORKTREE_CREATE_TIMEOUT_MS = 20 * 60_000

export const RECIPE_WORKTREE_CREATE_TIMEOUT_ERROR = 'recipe_worktree_create_timeout'
export const RECIPE_WORKTREE_CREATE_CANCELED_ERROR = 'recipe_worktree_create_canceled'

/** Sent from the runtime to the desktop window that runs the recipe creation flow. */
export type RecipeWorktreeCreateRequest = {
  requestId: string
  repoId: string
  recipeId: string
  name: string
  baseBranch?: string
}

export type RecipeWorktreeCreateResponse = {
  requestId: string
  worktree?: Worktree
  error?: string
}
