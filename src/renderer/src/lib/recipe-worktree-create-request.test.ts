import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'

const runBackgroundWorktreeCreation = vi.fn()
const waitForWorktreeCreationOutcome = vi.fn()
vi.mock('@/lib/worktree-creation-flow', () => ({
  runBackgroundWorktreeCreation: (...args: unknown[]) => runBackgroundWorktreeCreation(...args)
}))
vi.mock('@/lib/worktree-creation-outcome', () => ({
  waitForWorktreeCreationOutcome: (...args: unknown[]) => waitForWorktreeCreationOutcome(...args)
}))

import { runRecipeWorktreeCreateRequest } from './recipe-worktree-create-request'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the fields the request handler reads are populated.
const repo = {
  id: 'repo-1',
  kind: 'git',
  path: '/Users/me/web-app',
  displayName: 'web-app',
  gitRemoteIdentity: { canonicalKey: 'github.com/acme/web-app' }
} as unknown as Repo
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler only passes the worktree through.
const worktree = { id: 'repo-2::/home/node/web-app', repoId: 'repo-2' } as Worktree
const request = {
  requestId: 'req-1',
  repoId: 'repo-1',
  recipeId: 'local-docker-ssh',
  name: 'feature-x'
}
const listRecipes = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the preload API the handler calls is stubbed.
  globalThis.window = { api: { ephemeralVm: { listRecipes } } } as never
  listRecipes.mockResolvedValue({
    status: 'ok',
    recipes: [{ id: 'local-docker-ssh', name: 'Local Docker', checkoutMode: 'provisioned-root' }]
  })
  runBackgroundWorktreeCreation.mockReturnValue('creation-1')
  useAppStore.setState({
    repos: [repo],
    worktreesByRepo: {},
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler reads only this setting.
    settings: { experimentalEphemeralVms: true } as never
  })
})

describe('runRecipeWorktreeCreateRequest', () => {
  it('runs the recipe creation quietly and returns the workspace it made', async () => {
    waitForWorktreeCreationOutcome.mockResolvedValue({ ok: true, worktreeId: worktree.id })
    useAppStore.setState({ worktreesByRepo: { 'repo-2': [worktree] } })

    const response = await runRecipeWorktreeCreateRequest({ ...request, baseBranch: 'origin/main' })

    expect(response).toEqual({ requestId: 'req-1', worktree })
    const [creationRequest, options] = runBackgroundWorktreeCreation.mock.calls[0]!
    expect(options).toEqual({ reveal: false })
    expect(creationRequest).toMatchObject({
      repoId: 'repo-1',
      name: 'feature-x',
      baseBranch: 'origin/main',
      agent: null,
      ephemeralVmRecipe: {
        sourceRepoId: 'repo-1',
        recipeId: 'local-docker-ssh',
        projectId: 'github:acme/web-app',
        checkoutMode: 'provisioned-root'
      },
      // The trust prompt still gates scripts from the repo.
      hookPreparation: { confirmVmRecipe: true }
    })
  })

  it('returns the failure the creation reported', async () => {
    waitForWorktreeCreationOutcome.mockResolvedValue({ ok: false, error: 'create script failed' })

    await expect(runRecipeWorktreeCreateRequest(request)).resolves.toEqual({
      requestId: 'req-1',
      error: 'create script failed'
    })
  })

  it('says how to turn per-workspace environments on when they are off', async () => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler reads only this setting.
    useAppStore.setState({ settings: { experimentalEphemeralVms: false } as never })

    const response = await runRecipeWorktreeCreateRequest(request)

    expect(response.error).toContain('Settings → Experimental')
    expect(runBackgroundWorktreeCreation).not.toHaveBeenCalled()
  })

  it('lists the recipes that exist when the requested one does not', async () => {
    const response = await runRecipeWorktreeCreateRequest({ ...request, recipeId: 'nope' })

    expect(response.error).toBe('Recipe not found: nope. Available: local-docker-ssh.')
    expect(runBackgroundWorktreeCreation).not.toHaveBeenCalled()
  })

  it('reports an unknown project', async () => {
    useAppStore.setState({ repos: [] })

    const response = await runRecipeWorktreeCreateRequest(request)

    expect(response.error).toBe('Project not found: repo-1')
  })
})
