import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PortForwardEntry } from '../../../shared/ssh-types'
import type { WorkspacePort } from '../../../shared/workspace-ports'
import { findRecipeVmSshTargetId, openPortThroughVmForward } from './workspace-port-vm-forward'

const listPortForwards = vi.fn()
const addPortForward = vi.fn()
const listEnvironments = vi.fn()

const TARGET = 'runtime-ssh-orca-1234'

function port(overrides: Partial<WorkspacePort> = {}): WorkspacePort {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the fields the forwarder reads are populated.
  return {
    id: 'p1',
    kind: 'external',
    bindHost: '0.0.0.0',
    connectHost: 'localhost',
    port: 3000,
    protocol: 'http',
    ...overrides
  } as WorkspacePort
}

function entry(overrides: Partial<PortForwardEntry> = {}): PortForwardEntry {
  return {
    id: 'pf-1',
    connectionId: TARGET,
    localPort: 3000,
    remoteHost: 'localhost',
    remotePort: 3000,
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the preload calls the forwarder makes are stubbed.
  globalThis.window = {
    api: {
      ssh: { listPortForwards, addPortForward },
      runtimeEnvironments: { list: listEnvironments }
    }
  } as never
  listPortForwards.mockResolvedValue([])
  addPortForward.mockImplementation(async (args: { localPort: number; remotePort: number }) =>
    entry({ localPort: args.localPort || 49321, remotePort: args.remotePort })
  )
})

describe('findRecipeVmSshTargetId', () => {
  it('maps a managed server to the hidden SSH target of its recipe VM', async () => {
    listEnvironments.mockResolvedValue([
      { id: 'env-1', orcadDeployment: { sshTargetId: TARGET } },
      { id: 'env-2', orcadDeployment: { sshTargetId: 'my-saved-host' } },
      { id: 'env-3' }
    ])

    await expect(findRecipeVmSshTargetId('env-1')).resolves.toBe(TARGET)
    // A server on a host you added yourself is not a recipe VM.
    await expect(findRecipeVmSshTargetId('env-2')).resolves.toBeNull()
    await expect(findRecipeVmSshTargetId('env-3')).resolves.toBeNull()
  })
})

describe('openPortThroughVmForward', () => {
  it('forwards the same port number and opens the local end', async () => {
    const openUrl = vi.fn()

    const result = await openPortThroughVmForward({ sshTargetId: TARGET, port: port(), openUrl })

    expect(result).toEqual({ ok: true })
    expect(addPortForward).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: TARGET,
        localPort: 3000,
        remoteHost: 'localhost',
        remotePort: 3000
      })
    )
    expect(openUrl).toHaveBeenCalledWith('http://127.0.0.1:3000')
  })

  it('reuses a forward that already exists instead of adding another', async () => {
    listPortForwards.mockResolvedValue([entry({ localPort: 4555 })])
    const openUrl = vi.fn()

    await openPortThroughVmForward({ sshTargetId: TARGET, port: port(), openUrl })

    expect(addPortForward).not.toHaveBeenCalled()
    expect(openUrl).toHaveBeenCalledWith('http://127.0.0.1:4555')
  })

  it('takes any free local port when the same number is busy', async () => {
    addPortForward.mockImplementation(async (args: { localPort: number; remotePort: number }) => {
      if (args.localPort === 3000) {
        throw new Error('EADDRINUSE')
      }
      return entry({ localPort: 52000, remotePort: args.remotePort })
    })
    const openUrl = vi.fn()

    const result = await openPortThroughVmForward({ sshTargetId: TARGET, port: port(), openUrl })

    expect(result).toEqual({ ok: true })
    expect(addPortForward.mock.calls.map(([args]) => args.localPort)).toEqual([3000, 0])
    expect(openUrl).toHaveBeenCalledWith('http://127.0.0.1:52000')
  })

  it('uses https for a port the scanner identified as https', async () => {
    const openUrl = vi.fn()

    await openPortThroughVmForward({
      sshTargetId: TARGET,
      port: port({ port: 8443, protocol: 'https' }),
      openUrl
    })

    expect(openUrl).toHaveBeenCalledWith('https://127.0.0.1:8443')
  })

  it('targets a specific address when the app is not on the VM loopback', async () => {
    await openPortThroughVmForward({
      sshTargetId: TARGET,
      port: port({ bindHost: '172.19.0.5', connectHost: '172.19.0.5' }),
      openUrl: vi.fn()
    })

    expect(addPortForward).toHaveBeenCalledWith(
      expect.objectContaining({ remoteHost: '172.19.0.5' })
    )
  })

  it('says why when the port cannot be forwarded, and opens nothing', async () => {
    addPortForward.mockRejectedValue(new Error('SSH connection is not established'))
    const openUrl = vi.fn()

    const result = await openPortThroughVmForward({ sshTargetId: TARGET, port: port(), openUrl })

    expect(result).toEqual({
      ok: false,
      reason: 'Could not forward port 3000 from the VM: SSH connection is not established'
    })
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('reports a failure to open the forwarded page', async () => {
    const result = await openPortThroughVmForward({
      sshTargetId: TARGET,
      port: port(),
      openUrl: () => {
        throw new Error('no handler for url')
      }
    })

    expect(result).toEqual({ ok: false, reason: 'no handler for url' })
  })
})
