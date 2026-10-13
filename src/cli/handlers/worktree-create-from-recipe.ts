/** `worktree create --recipe <id>`: a workspace on a per-workspace environment, made by the desktop app. */
import type { CommandHandler } from '../dispatch'
import { formatWorktreeShow, printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import type { RuntimeWorktreeRecord } from '../../shared/runtime-types'
import { RECIPE_WORKTREE_CREATE_TIMEOUT_MS } from '../../shared/recipe-worktree-create'

// Why: these start work the recipe flow does not carry, so ignoring them would silently drop intent.
const UNSUPPORTED_WITH_RECIPE = [
  'agent',
  'prompt',
  'model',
  'effort',
  'retry-launch',
  'reference',
  'issue',
  'pr',
  'linear-issue',
  'gitlab-issue',
  'gitlab-mr',
  'comment',
  'setup',
  'parent-worktree',
  'no-parent',
  'run-hooks',
  'activate',
  'project',
  'host',
  'project-host-setup'
] as const

/** Run first, so a combination the recipe flow cannot honor is named before any other check. */
export function assertRecipeCreateFlags(flags: Map<string, string | boolean>): void {
  if (!flags.has('recipe')) {
    return
  }
  const unsupported = UNSUPPORTED_WITH_RECIPE.find((flag) => flags.has(flag))
  if (unsupported) {
    throw new RuntimeClientError(
      'invalid_argument',
      `--recipe cannot be combined with --${unsupported} yet. Create the workspace first, then run the follow-up command on it.`
    )
  }
}

/** Handles `--recipe`; false when the command is an ordinary create. */
export async function createWorktreeFromRecipe({
  flags,
  client,
  json,
  repo
}: {
  flags: Map<string, string | boolean>
  client: Parameters<CommandHandler>[0]['client']
  json: boolean
  repo: string
}): Promise<boolean> {
  if (!flags.has('recipe')) {
    return false
  }
  const result = await client.call<{ worktree: RuntimeWorktreeRecord }>(
    'worktree.createFromRecipe',
    {
      repo,
      recipe: getRequiredStringFlag(flags, 'recipe'),
      name: getRequiredStringFlag(flags, 'name'),
      baseBranch: getOptionalStringFlag(flags, 'base-branch')
    },
    // Why: the VM boots and bootstraps inside this call, and a trust prompt may wait on the user.
    { timeoutMs: RECIPE_WORKTREE_CREATE_TIMEOUT_MS + 30_000 }
  )
  printResult(result, json, formatWorktreeShow)
  return true
}
