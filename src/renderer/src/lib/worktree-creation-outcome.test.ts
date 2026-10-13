import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import {
  reportWorktreeCreationSucceeded,
  waitForWorktreeCreationOutcome
} from './worktree-creation-outcome'

function pending(creationId: string, patch: Record<string, unknown> = {}) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the tracker reads only status and error from the entry.
  return {
    creationId,
    phase: 'creating',
    status: 'creating',
    startedAt: 0,
    request: {},
    ...patch
  } as never
}

beforeEach(() => {
  useAppStore.setState({ pendingWorktreeCreations: {} })
})

describe('waitForWorktreeCreationOutcome', () => {
  it('resolves with the worktree id when the creation reports success before it is removed', async () => {
    useAppStore.setState({ pendingWorktreeCreations: { c1: pending('c1') } })
    const outcome = waitForWorktreeCreationOutcome('c1')

    reportWorktreeCreationSucceeded('c1', 'repo::/path')
    useAppStore.setState({ pendingWorktreeCreations: {} })

    await expect(outcome).resolves.toEqual({ ok: true, worktreeId: 'repo::/path' })
  })

  it('resolves with the error when the creation fails', async () => {
    useAppStore.setState({ pendingWorktreeCreations: { c2: pending('c2') } })
    const outcome = waitForWorktreeCreationOutcome('c2')

    useAppStore.setState({
      pendingWorktreeCreations: { c2: pending('c2', { status: 'error', error: 'boom' }) }
    })

    await expect(outcome).resolves.toEqual({ ok: false, error: 'boom' })
  })

  it('reports a dismissed creation as canceled', async () => {
    useAppStore.setState({ pendingWorktreeCreations: { c3: pending('c3') } })
    const outcome = waitForWorktreeCreationOutcome('c3')

    useAppStore.setState({ pendingWorktreeCreations: {} })

    await expect(outcome).resolves.toEqual({ ok: false, error: 'recipe_worktree_create_canceled' })
  })

  it('ignores a success report nobody waits for', () => {
    expect(() => reportWorktreeCreationSucceeded('nobody', 'x')).not.toThrow()
  })
})
