import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspacePort } from '../../../shared/workspace-ports'

const supports = vi.fn()
const assertCapability = vi.fn()
const callRuntimeRpc = vi.fn()
const addPortForward = vi.fn()
const listPortForwards = vi.fn()
const listEnvironments = vi.fn()
const openUrl = vi.fn()

vi.mock('@/runtime/runtime-rpc-client', () => ({
  assertRuntimeEnvironmentCapability: (...args: unknown[]) => assertCapability(...args),
  callRuntimeRpc: (...args: unknown[]) => callRuntimeRpc(...args),
  runtimeEnvironmentSupportsCapability: (...args: unknown[]) => supports(...args),
  RuntimeRpcCallError: class RuntimeRpcCallError extends Error {}
}))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorktree: vi.fn() }))
vi.mock('./workspace-port-scan-client', () => ({ runWorkspacePortScanForTarget: vi.fn() }))

import { openWorkspacePortInBrowser } from './workspace-port-actions'

const environmentTarget = { kind: 'environment', environmentId: 'env-1' } as const
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the fields the opener reads are populated.
const workspacePort = {
  id: 'p1',
  kind: 'workspace',
  owner: {
    worktreeId: 'repo::/home/node/app',
    repoId: 'repo',
    displayName: 'app',
    path: '/',
    confidence: 'cwd'
  },
  bindHost: '0.0.0.0',
  connectHost: 'localhost',
  port: 3000,
  protocol: 'http'
} as WorkspacePort

function open(overrides: Partial<Parameters<typeof openWorkspacePortInBrowser>[0]> = {}) {
  const createBrowserTab = vi.fn(() => ({ activePageId: 'page-1' }))
  const setRemoteBrowserPageHandle = vi.fn()
  return {
    createBrowserTab,
    setRemoteBrowserPageHandle,
    run: () =>
      openWorkspacePortInBrowser({
        port: workspacePort,
        runtimeTarget: environmentTarget,
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the opener only calls these with the shapes the mocks return.
        createBrowserTab: createBrowserTab as never,
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: see above.
        setRemoteBrowserPageHandle: setRemoteBrowserPageHandle as never,
        openInOrcaBrowser: true,
        ...overrides
      })
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the preload calls the opener makes are stubbed.
  globalThis.window = {
    api: {
      ssh: { listPortForwards, addPortForward },
      runtimeEnvironments: { list: listEnvironments },
      shell: { openUrl }
    }
  } as never
  listPortForwards.mockResolvedValue([])
  addPortForward.mockImplementation(async (args: { localPort: number; remotePort: number }) => ({
    id: 'pf-1',
    connectionId: 'runtime-ssh-orca-1',
    localPort: args.localPort,
    remoteHost: 'localhost',
    remotePort: args.remotePort
  }))
  listEnvironments.mockResolvedValue([
    { id: 'env-1', orcadDeployment: { sshTargetId: 'runtime-ssh-orca-1' } }
  ])
  assertCapability.mockRejectedValue(
    new Error(
      'Managed browser tabs are unavailable because the paired runtime does not support browser streaming.'
    )
  )
})

describe('opening a VM workspace port', () => {
  it('forwards it and opens the local end in Orca when the VM has no browser', async () => {
    supports.mockResolvedValue(false)
    const { run, createBrowserTab } = open()

    const result = await run()

    expect(result).toEqual({ ok: true })
    expect(addPortForward).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: 'runtime-ssh-orca-1', remotePort: 3000 })
    )
    expect(createBrowserTab).toHaveBeenCalledWith('repo::/home/node/app', 'http://127.0.0.1:3000', {
      activate: true
    })
    // The VM's own browser is never asked for.
    expect(callRuntimeRpc).not.toHaveBeenCalled()
  })

  it('opens the system browser instead when that is what the click asked for', async () => {
    supports.mockResolvedValue(false)
    const { run, createBrowserTab } = open({ openInOrcaBrowser: false })

    await run()

    expect(openUrl).toHaveBeenCalledWith('http://127.0.0.1:3000')
    expect(createBrowserTab).not.toHaveBeenCalled()
  })

  it('keeps using the VM browser when the VM has one', async () => {
    supports.mockResolvedValue(true)
    assertCapability.mockResolvedValue(undefined)
    callRuntimeRpc.mockResolvedValue({ browserPageId: 'remote-page' })
    const { run, createBrowserTab, setRemoteBrowserPageHandle } = open()

    const result = await run()

    expect(result).toEqual({ ok: true })
    expect(addPortForward).not.toHaveBeenCalled()
    expect(callRuntimeRpc).toHaveBeenCalledWith(
      environmentTarget,
      'browser.tabCreate',
      expect.anything(),
      expect.anything()
    )
    expect(createBrowserTab).toHaveBeenCalledWith(
      'repo::/home/node/app',
      'http://localhost:3000',
      expect.objectContaining({ browserRuntimeEnvironmentId: 'env-1' })
    )
    expect(setRemoteBrowserPageHandle).toHaveBeenCalled()
  })

  it('still explains the limit for a server that is not a recipe VM', async () => {
    supports.mockResolvedValue(false)
    listEnvironments.mockResolvedValue([
      { id: 'env-1', orcadDeployment: { sshTargetId: 'my-saved-host' } }
    ])
    const { run } = open()

    const result = await run()

    expect(result).toEqual({
      ok: false,
      reason:
        'Managed browser tabs are unavailable because the paired runtime does not support browser streaming.'
    })
    expect(addPortForward).not.toHaveBeenCalled()
  })

  it('reports a forward that could not be made instead of a browser error', async () => {
    supports.mockResolvedValue(false)
    addPortForward.mockRejectedValue(new Error('SSH connection is not established'))
    const { run, createBrowserTab } = open()

    const result = await run()

    expect(result).toEqual({
      ok: false,
      reason: 'Could not forward port 3000 from the VM: SSH connection is not established'
    })
    expect(createBrowserTab).not.toHaveBeenCalled()
  })
})
