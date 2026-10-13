import { afterEach, describe, expect, it, vi } from 'vitest'
import { WORKTREE_HANDLERS } from './worktree'

const worktree = {
  id: 'repo-2::/home/node/web-app',
  repoId: 'repo-2',
  path: '/home/node/web-app',
  displayName: 'feature-x',
  branch: 'refs/heads/feature-x',
  isMainWorktree: true
}

function ok(result: unknown): unknown {
  return { id: 'request-1', ok: true, result, _meta: { runtimeId: 'runtime-1' } }
}

function createRun(
  flags: [string, string | boolean][],
  call: (method: string, params?: unknown, options?: { timeoutMs?: number }) => Promise<unknown>
) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler reads only the fields supplied here.
  return WORKTREE_HANDLERS['worktree create']!({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler only calls client.call.
    client: { call } as never,
    cwd: '/tmp',
    flags: new Map(flags),
    json: true,
    rawArgs: []
  } as never)
}

afterEach(() => vi.restoreAllMocks())

describe('orca worktree create --recipe', () => {
  it('asks the desktop to run the recipe and prints the workspace it made', async () => {
    const call = vi.fn(
      async (method: string, _params?: unknown, _options?: { timeoutMs?: number }) =>
        method === 'worktree.createFromRecipe' ? ok({ worktree }) : ok({})
    )
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await createRun(
      [
        ['repo', 'id:repo-1'],
        ['name', 'feature-x'],
        ['recipe', 'local-docker-ssh'],
        ['base-branch', 'origin/main']
      ],
      call
    )

    const recipeCall = call.mock.calls.find(([method]) => method === 'worktree.createFromRecipe')
    expect(recipeCall?.[1]).toEqual({
      repo: 'id:repo-1',
      recipe: 'local-docker-ssh',
      name: 'feature-x',
      baseBranch: 'origin/main'
    })
    // The VM boots inside this call, so it must outlast the default request timeout.
    expect(recipeCall?.[2]?.timeoutMs).toBeGreaterThan(15 * 60_000)
    expect(call.mock.calls.some(([method]) => method === 'worktree.create')).toBe(false)
    expect(JSON.parse(String(log.mock.calls[0]?.[0])).result.worktree.id).toBe(worktree.id)
  })

  it.each(['agent', 'prompt', 'comment', 'parent-worktree', 'activate', 'host'])(
    'refuses --%s instead of dropping it',
    async (flag) => {
      const call = vi.fn(async (_method: string) => ok({}))

      await expect(
        createRun(
          [
            ['repo', 'id:repo-1'],
            ['name', 'feature-x'],
            ['recipe', 'local-docker-ssh'],
            [flag, flag === 'activate' ? true : 'x']
          ],
          call
        )
      ).rejects.toThrow(`--recipe cannot be combined with --${flag}`)
      expect(call.mock.calls.some(([method]) => method === 'worktree.createFromRecipe')).toBe(false)
    }
  )
})
