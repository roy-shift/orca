import { useAppStore } from '@/store'
import { RECIPE_WORKTREE_CREATE_CANCELED_ERROR } from '../../../shared/recipe-worktree-create'

export type WorktreeCreationOutcome =
  | { ok: true; worktreeId: string }
  | { ok: false; error: string }

const settlers = new Map<string, (outcome: WorktreeCreationOutcome) => void>()

/** Resolves when a background creation finishes, fails, or is dismissed. */
export function waitForWorktreeCreationOutcome(
  creationId: string
): Promise<WorktreeCreationOutcome> {
  return new Promise((resolve) => {
    let unsubscribe: () => void = () => {}
    const settle = (outcome: WorktreeCreationOutcome): void => {
      if (!settlers.delete(creationId)) {
        return
      }
      unsubscribe()
      resolve(outcome)
    }
    settlers.set(creationId, settle)
    unsubscribe = useAppStore.subscribe((state) => {
      const entry = state.pendingWorktreeCreations[creationId]
      if (!entry) {
        settle({ ok: false, error: RECIPE_WORKTREE_CREATE_CANCELED_ERROR })
      } else if (entry.status === 'error') {
        settle({ ok: false, error: entry.error ?? 'The workspace could not be created.' })
      }
    })
  })
}

/** Called before the pending entry is removed, so removal is not read as a cancel. */
export function reportWorktreeCreationSucceeded(creationId: string, worktreeId: string): void {
  settlers.get(creationId)?.({ ok: true, worktreeId })
}
