import { useEffect } from 'react'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '../../../../../shared/execution-host/execution-host'
import { isGitRepoKind } from '../../../../../shared/repository/repo-kind'
import type { Repo } from '../../../../../shared/repository/repo-types'
import {
  getProjectHostSetupSelectionKey,
  type ProjectHostSetupOption,
  type ReadyProjectHostSetupOption
} from '@/lib/workspace/creation/project-host-setup-options'

type RecipeCheckout = {
  repoId: string | null
  repoIsGit: boolean
  repoConnectionId: string | null
  repoExecutionHostId: ExecutionHostId | null
  /** The local checkout to switch Run on to, while another host is selected. */
  localSetupKey: string | null
}

function recipeCheckout(repo: Repo | undefined, localSetupKey: string | null): RecipeCheckout {
  return {
    repoId: repo?.id ?? null,
    repoIsGit: repo ? isGitRepoKind(repo) : false,
    repoConnectionId: repo?.connectionId ?? null,
    repoExecutionHostId: repo ? getRepoExecutionHostId(repo) : null,
    localSetupKey
  }
}

/** Recipes run from this computer's checkout, so they list even while another host is selected. */
export function resolveRecipeCheckout(
  selectedRepo: Repo | undefined,
  setupOptions: readonly ProjectHostSetupOption[],
  eligibleRepos: readonly Repo[]
): RecipeCheckout {
  if (!selectedRepo || getRepoExecutionHostId(selectedRepo) === LOCAL_EXECUTION_HOST_ID) {
    return recipeCheckout(selectedRepo, null)
  }
  const localSetup = setupOptions.find(
    (option): option is ReadyProjectHostSetupOption =>
      option.kind === 'ready' && option.hostId === LOCAL_EXECUTION_HOST_ID
  )
  const localRepo = localSetup
    ? eligibleRepos.find(
        (repo) =>
          repo.id === localSetup.repoId && getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID
      )
    : undefined
  return localSetup && localRepo
    ? recipeCheckout(localRepo, getProjectHostSetupSelectionKey(localSetup))
    : recipeCheckout(selectedRepo, null)
}

/** Choosing a recipe (or starting on the default one) moves Run on to the project's local checkout. */
export function useRecipeLocalHostSync(
  target: {
    ephemeralVmsEnabled: boolean
    selectedEphemeralVmRecipeId: string | null
    ephemeralVmRecipeLocalSetupKey: string | null
  },
  onProjectHostSetupChange: (setupKey: string) => void
): void {
  const recipeId = target.ephemeralVmsEnabled ? target.selectedEphemeralVmRecipeId : null
  const setupKey = target.ephemeralVmRecipeLocalSetupKey
  useEffect(() => {
    if (recipeId && setupKey) {
      onProjectHostSetupChange(setupKey)
    }
  }, [onProjectHostSetupChange, recipeId, setupKey])
}
