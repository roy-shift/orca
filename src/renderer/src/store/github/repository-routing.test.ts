import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import { getRuntimeRepoTarget } from './repository-routing'

const sharedPath = '/home/node/repos/app'

function makeRepo(id: string, executionHostId: Repo['executionHostId']): Repo {
  return {
    id,
    path: sharedPath,
    displayName: 'app',
    badgeColor: '',
    addedAt: 0,
    connectionId: null,
    executionHostId
  }
}

const runtimeARepo = makeRepo('repo-a', 'runtime:env-a')
const runtimeBRepo = makeRepo('repo-b', 'runtime:env-b')

describe('getRuntimeRepoTarget', () => {
  it('picks the repo owned by the target runtime when runtimes share a checkout path', () => {
    const state = { repos: [runtimeARepo, runtimeBRepo] }

    expect(
      getRuntimeRepoTarget(state, sharedPath, {
        kind: 'environment',
        environmentId: 'env-b'
      })?.repo.id
    ).toBe('repo-b')
    expect(
      getRuntimeRepoTarget(state, sharedPath, {
        kind: 'environment',
        environmentId: 'env-a'
      })?.repo.id
    ).toBe('repo-a')
  })

  it('falls back to the first path match when no repo names the target runtime', () => {
    const state = { repos: [makeRepo('legacy', null)] }

    expect(
      getRuntimeRepoTarget(state, sharedPath, {
        kind: 'environment',
        environmentId: 'env-a'
      })?.repo.id
    ).toBe('legacy')
  })

  it('stays local for a local target', () => {
    expect(
      getRuntimeRepoTarget({ repos: [runtimeARepo] }, sharedPath, {
        kind: 'local'
      })
    ).toBe(null)
  })
})
