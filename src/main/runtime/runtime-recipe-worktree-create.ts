/**
 * `worktree.createFromRecipe`: validates the source project, then hands the creation to the
 * desktop window, which owns the recipe flow (trust prompt, VM provisioning, adoption, progress).
 */
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import { isFolderRepo } from '../../shared/repo-kind'
import type {
  RecipeWorktreeCreateRequest,
  RecipeWorktreeCreateResponse
} from '../../shared/recipe-worktree-create'

export type RuntimeRecipeWorktreeCreateParams = {
  repo: string
  recipe: string
  name: string
  baseBranch?: string
}

export type RuntimeRecipeWorktreeCreatePorts = {
  resolveRepo: (selector: string) => Promise<Repo>
  /** Absent when no desktop window is attached to this runtime. */
  requestRendererCreate:
    | ((
        request: Omit<RecipeWorktreeCreateRequest, 'requestId'>
      ) => Promise<RecipeWorktreeCreateResponse>)
    | undefined
}

export async function createRuntimeWorktreeFromRecipe(
  params: RuntimeRecipeWorktreeCreateParams,
  ports: RuntimeRecipeWorktreeCreatePorts
): Promise<{ worktree: Worktree }> {
  const repo = await ports.resolveRepo(params.repo)
  if (isFolderRepo(repo) || repo.connectionId) {
    throw new Error('Recipe workspaces need a local Git project; this one is a folder or remote.')
  }
  if (!ports.requestRendererCreate) {
    throw new Error('Recipe workspaces are created by the Orca desktop window, which is not open.')
  }
  const response = await ports.requestRendererCreate({
    repoId: repo.id,
    recipeId: params.recipe,
    name: params.name,
    ...(params.baseBranch ? { baseBranch: params.baseBranch } : {})
  })
  if (response.error || !response.worktree) {
    throw new Error(response.error ?? 'The recipe workspace was not created.')
  }
  return { worktree: response.worktree }
}
