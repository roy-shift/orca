import { WorktreeCreateFromRecipe } from '../../../../shared/rpc-contract/worktree-recipe-create-params'
import { defineMethod } from '../core'

export const WORKTREE_CREATE_FROM_RECIPE_METHOD = defineMethod({
  name: 'worktree.createFromRecipe',
  permission: 'workspace',
  params: WorktreeCreateFromRecipe,
  handler: (params, { runtime }) => runtime.createManagedWorktreeFromRecipe(params)
})
