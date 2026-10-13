import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'

const ipcEmitter = new EventEmitter()
const ipcMainMock = {
  on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
    ipcEmitter.on(channel, listener)
  }),
  removeListener: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
    ipcEmitter.removeListener(channel, listener)
  })
}

vi.mock('electron', () => ({ ipcMain: ipcMainMock }))

function createMainWindow() {
  const webContents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    send: vi.fn()
  })
  const mainWindow = Object.assign(new EventEmitter(), {
    isDestroyed: (): boolean => false,
    webContents
  })
  return { mainWindow, webContents }
}

function windowFor(fixture: object): BrowserWindow {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the relay only uses the window's events, destroyed state, and webContents, which the fixture supplies.
  return fixture as unknown as BrowserWindow
}

function readRequestId(payload: unknown): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'requestId' in payload &&
    typeof payload.requestId === 'string'
  ) {
    return payload.requestId
  }
  throw new Error('request carried no requestId')
}

const REQUEST = { repoId: 'repo-1', recipeId: 'local-docker-ssh', name: 'feature-x' }

describe('requestRecipeWorktreeCreateFromRenderer', () => {
  beforeEach(() => {
    vi.useRealTimers()
    ipcEmitter.removeAllListeners()
    ipcMainMock.on.mockClear()
    ipcMainMock.removeListener.mockClear()
  })

  it('resolves with the response only the targeted renderer sent for this request', async () => {
    const { requestRecipeWorktreeCreateFromRenderer } =
      await import('./recipe-worktree-create-request-relay')
    const { mainWindow, webContents } = createMainWindow()
    const pending = requestRecipeWorktreeCreateFromRenderer(windowFor(mainWindow), REQUEST)
    const sent = webContents.send.mock.calls[0] ?? []
    expect(sent[0]).toBe('ui:recipeWorktreeCreateRequest')
    const requestId = readRequestId(sent[1])
    expect(sent[1]).toMatchObject(REQUEST)

    let settled = false
    void pending.finally(() => {
      settled = true
    })
    // A different sender, or a different request, must not settle it.
    ipcEmitter.emit('ui:recipeWorktreeCreateResponse', { sender: {} }, { requestId })
    ipcEmitter.emit(
      'ui:recipeWorktreeCreateResponse',
      { sender: webContents },
      { requestId: 'other' }
    )
    await Promise.resolve()
    expect(settled).toBe(false)

    ipcEmitter.emit(
      'ui:recipeWorktreeCreateResponse',
      { sender: webContents },
      { requestId, error: 'Recipe not found: x' }
    )
    await expect(pending).resolves.toEqual({ requestId, error: 'Recipe not found: x' })
    expect(ipcEmitter.listenerCount('ui:recipeWorktreeCreateResponse')).toBe(0)
  })

  it('rejects and releases listeners when the renderer reloads mid-create', async () => {
    const { requestRecipeWorktreeCreateFromRenderer } =
      await import('./recipe-worktree-create-request-relay')
    const { mainWindow, webContents } = createMainWindow()
    const pending = requestRecipeWorktreeCreateFromRenderer(windowFor(mainWindow), REQUEST)

    webContents.emit('did-start-loading')

    await expect(pending).rejects.toThrow('renderer_unavailable')
    expect(ipcEmitter.listenerCount('ui:recipeWorktreeCreateResponse')).toBe(0)
  })

  it('rejects when the window is already gone', async () => {
    const { requestRecipeWorktreeCreateFromRenderer } =
      await import('./recipe-worktree-create-request-relay')
    const { mainWindow } = createMainWindow()
    mainWindow.isDestroyed = () => true

    await expect(
      requestRecipeWorktreeCreateFromRenderer(windowFor(mainWindow), REQUEST)
    ).rejects.toThrow('renderer_unavailable')
  })
})
