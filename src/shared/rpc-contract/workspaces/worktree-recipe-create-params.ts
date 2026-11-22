import { z } from 'zod'
import { WorktreePrefetchCreateBase } from './worktree-create-params'

const base = WorktreePrefetchCreateBase.shape

/** Creates a workspace from a project's `environmentRecipes` entry, as the New Workspace dialog does. */
export const WorktreeCreateFromRecipe = z.object({
  repo: base.repo,
  recipe: z.string().min(1, 'Missing recipe id'),
  name: z.string().min(1, 'Missing workspace name'),
  baseBranch: base.baseBranch
})
