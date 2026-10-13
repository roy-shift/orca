import { runRecipeWorktreeCreateRequest } from '@/lib/recipe-worktree-create-request'

export function registerRecipeWorktreeCreateIpcBridge(unsubs: (() => void)[]): void {
  unsubs.push(
    window.api.ui.onRecipeWorktreeCreateRequest((request) => {
      void runRecipeWorktreeCreateRequest(request)
        .catch((error: unknown) => ({
          requestId: request.requestId,
          error: error instanceof Error ? error.message : String(error)
        }))
        .then((response) => window.api.ui.respondRecipeWorktreeCreate(response))
    })
  )
}
