import { randomUUID } from 'node:crypto'

import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import {
  RECIPE_WORKTREE_CREATE_TIMEOUT_ERROR,
  RECIPE_WORKTREE_CREATE_TIMEOUT_MS,
  type RecipeWorktreeCreateRequest,
  type RecipeWorktreeCreateResponse
} from '../../shared/recipe-worktree-create'

export async function requestRecipeWorktreeCreateFromRenderer(
  mainWindow: BrowserWindow,
  request: Omit<RecipeWorktreeCreateRequest, 'requestId'>
): Promise<RecipeWorktreeCreateResponse> {
  if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    throw new Error('renderer_unavailable')
  }
  const webContents = mainWindow.webContents
  const requestId = randomUUID()
  return new Promise<RecipeWorktreeCreateResponse>((resolve, reject) => {
    let settled = false
    const finish = (outcome: RecipeWorktreeCreateResponse | Error): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      ipcMain.removeListener('ui:recipeWorktreeCreateResponse', onResponse)
      mainWindow.removeListener('closed', onRendererUnavailable)
      webContents.removeListener('destroyed', onRendererUnavailable)
      webContents.removeListener('render-process-gone', onRendererUnavailable)
      webContents.removeListener('did-start-loading', onRendererUnavailable)
      if (outcome instanceof Error) {
        reject(outcome)
      } else {
        resolve(outcome)
      }
    }
    const onRendererUnavailable = (): void => finish(new Error('renderer_unavailable'))
    const onResponse = (
      event: Electron.IpcMainEvent,
      response: RecipeWorktreeCreateResponse
    ): void => {
      // Why: requestId is renderer-supplied, so only the targeted main window may answer.
      if (event.sender !== webContents || response.requestId !== requestId) {
        return
      }
      finish(response)
    }
    const timeout = setTimeout(
      () => finish(new Error(RECIPE_WORKTREE_CREATE_TIMEOUT_ERROR)),
      RECIPE_WORKTREE_CREATE_TIMEOUT_MS
    )
    timeout.unref?.()
    ipcMain.on('ui:recipeWorktreeCreateResponse', onResponse)
    mainWindow.once('closed', onRendererUnavailable)
    webContents.once('destroyed', onRendererUnavailable)
    webContents.once('render-process-gone', onRendererUnavailable)
    webContents.once('did-start-loading', onRendererUnavailable)
    try {
      webContents.send('ui:recipeWorktreeCreateRequest', { requestId, ...request })
    } catch {
      finish(new Error('renderer_unavailable'))
    }
  })
}
