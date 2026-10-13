import { useAppStore } from '@/store'
import { buildQuickCreationRequest } from '@/hooks/composer-state/quick-creation-request'
import { runBackgroundWorktreeCreation } from '@/lib/worktree-creation-flow'
import { waitForWorktreeCreationOutcome } from '@/lib/worktree-creation-outcome'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import { getProjectIdentityKey } from '../../../shared/project-host-setup-projection'
import type {
  RecipeWorktreeCreateRequest,
  RecipeWorktreeCreateResponse
} from '../../../shared/recipe-worktree-create'

/** Runs the New Workspace dialog's recipe flow for a request the CLI sent, without taking focus. */
export async function runRecipeWorktreeCreateRequest(
  request: RecipeWorktreeCreateRequest
): Promise<RecipeWorktreeCreateResponse> {
  const { requestId } = request
  const state = useAppStore.getState()
  const repo = state.repos.find((entry) => entry.id === request.repoId)
  if (!repo) {
    return { requestId, error: `Project not found: ${request.repoId}` }
  }
  if (state.settings?.experimentalEphemeralVms !== true) {
    return {
      requestId,
      error: 'Per-workspace environments are off. Turn on Cloud VM in Settings → Experimental.'
    }
  }
  const listed = await window.api.ephemeralVm.listRecipes({ repoId: repo.id })
  const recipes = listed.recipes ?? []
  const recipe = recipes.find((entry) => entry.id === request.recipeId)
  if (!recipe) {
    const available = recipes.map((entry) => entry.id).join(', ') || 'none'
    return { requestId, error: `Recipe not found: ${request.recipeId}. Available: ${available}.` }
  }

  const creationRequest = buildQuickCreationRequest({
    repoId: repo.id,
    ephemeralVmRecipe: {
      sourceRepoId: repo.id,
      recipeId: recipe.id,
      projectId: getProjectIdentityKey(repo),
      ...(recipe.checkoutMode ? { checkoutMode: recipe.checkoutMode } : {})
    },
    indeterminateProgress: true,
    taskSourceContext: null,
    linkedWorkItem: null,
    workspaceRunContext: undefined,
    workspaceName: request.name,
    nameWasGenerated: false,
    displayName: request.name,
    displayNameKind: 'user',
    selectedRepoIsGit: true,
    baseBranch: request.baseBranch,
    compareBaseRef: undefined,
    setupDecision: 'inherit',
    sparseDirectories: null,
    sparsePresetId: null,
    telemetrySource: 'unknown',
    linkedIssue: null,
    linkedPR: null,
    pushTarget: undefined,
    agent: null,
    linkedLinearIssue: undefined,
    linkedLinearIssueWorkspaceId: undefined,
    linkedLinearIssueOrganizationUrlKey: undefined,
    branchNameOverride: undefined,
    parentWorktreeId: null,
    workspaceStatus: undefined,
    linkedGitLabMR: null,
    linkedGitLabIssue: null,
    includeGitLabLinks: false,
    startup: undefined,
    // Why: the recipe runs scripts from the repo, so the trust prompt still gates it.
    hookPreparation: { executionHostId: getRepoExecutionHostId(repo), confirmVmRecipe: true },
    pendingFirstAgentMessageRename: false,
    note: '',
    startupPlan: null,
    quickPrompt: '',
    launchDraftPrompt: undefined,
    promptDelivery: 'auto-submit',
    quickTelemetry: null,
    suppressTerminalFocusOnCompletion: true
  })

  const creationId = runBackgroundWorktreeCreation(creationRequest, { reveal: false })
  const outcome = await waitForWorktreeCreationOutcome(creationId)
  if (!outcome.ok) {
    return { requestId, error: outcome.error }
  }
  const worktree = Object.values(useAppStore.getState().worktreesByRepo)
    .flat()
    .find((entry) => entry.id === outcome.worktreeId)
  return worktree
    ? { requestId, worktree }
    : { requestId, error: 'The workspace was created but is not in the app yet.' }
}
