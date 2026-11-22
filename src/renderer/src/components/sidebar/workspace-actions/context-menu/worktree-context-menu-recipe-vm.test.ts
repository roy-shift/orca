import { describe, expect, it } from 'vitest'
import { isRecipeVmWorkspaceRow } from './worktree-context-menu-policy'

describe('recipe VM workspace rows', () => {
  it('treats only a provisioned-root primary row as a deletable VM workspace', () => {
    expect(
      isRecipeVmWorkspaceRow({ isMainWorktree: true, ephemeralVmCheckoutMode: 'provisioned-root' })
    ).toBe(true)
    expect(
      isRecipeVmWorkspaceRow({ isMainWorktree: true, ephemeralVmCheckoutMode: 'orca-worktree' })
    ).toBe(false)
    expect(isRecipeVmWorkspaceRow({ isMainWorktree: true })).toBe(false)
    expect(
      isRecipeVmWorkspaceRow({ isMainWorktree: false, ephemeralVmCheckoutMode: 'provisioned-root' })
    ).toBe(false)
  })
})
