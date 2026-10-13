import { describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import { createRuntimeWorktreeFromRecipe } from './runtime-recipe-worktree-create'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the fields the function reads are populated.
const gitRepo = { id: 'repo-1', kind: 'git', path: '/p' } as Repo
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the function only passes the worktree through.
const worktree = { id: 'repo-2::/home/node/p', repoId: 'repo-2' } as Worktree
const params = { repo: 'id:repo-1', recipe: 'local-docker-ssh', name: 'feature-x' }

describe('createRuntimeWorktreeFromRecipe', () => {
  it('forwards the resolved project to the desktop window and returns its workspace', async () => {
    const requestRendererCreate = vi.fn().mockResolvedValue({ requestId: 'r', worktree })

    const result = await createRuntimeWorktreeFromRecipe(
      { ...params, baseBranch: 'origin/main' },
      { resolveRepo: async () => gitRepo, requestRendererCreate }
    )

    expect(result).toEqual({ worktree })
    expect(requestRendererCreate).toHaveBeenCalledWith({
      repoId: 'repo-1',
      recipeId: 'local-docker-ssh',
      name: 'feature-x',
      baseBranch: 'origin/main'
    })
  })

  it('surfaces the desktop window error', async () => {
    await expect(
      createRuntimeWorktreeFromRecipe(params, {
        resolveRepo: async () => gitRepo,
        requestRendererCreate: async () => ({ requestId: 'r', error: 'Recipe not found: x' })
      })
    ).rejects.toThrow('Recipe not found: x')
  })

  it('refuses folder and remote projects before asking the window', async () => {
    const requestRendererCreate = vi.fn()
    const unsupported: Repo[] = [
      { ...gitRepo, kind: 'folder' },
      { ...gitRepo, connectionId: 'ssh-1' }
    ]
    for (const repo of unsupported) {
      await expect(
        createRuntimeWorktreeFromRecipe(params, {
          resolveRepo: async () => repo,
          requestRendererCreate
        })
      ).rejects.toThrow('local Git project')
    }
    expect(requestRendererCreate).not.toHaveBeenCalled()
  })

  it('explains when no desktop window is attached', async () => {
    await expect(
      createRuntimeWorktreeFromRecipe(params, {
        resolveRepo: async () => gitRepo,
        requestRendererCreate: undefined
      })
    ).rejects.toThrow('desktop window')
  })
})
