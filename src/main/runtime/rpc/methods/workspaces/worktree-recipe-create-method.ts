import { WorktreeCreateFromRecipe } from '../../../../../shared/rpc-contract/workspaces/worktree-recipe-create-params'
import { defineMethod } from '../../core'

export const WORKTREE_RECIPE_METHODS = [
  defineMethod({
    name: 'worktree.createFromRecipe',
    permission: 'workspace',
    params: WorktreeCreateFromRecipe,
    handler: (params, { runtime }) => runtime.createManagedWorktreeFromRecipe(params)
  })
]
