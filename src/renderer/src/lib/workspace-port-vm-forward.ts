import { getRecipeVmSshTargetForHost } from '@/lib/recipe-vm-managed-host'
import { runtimeEnvironmentSupportsCapability } from '@/runtime/runtime-rpc-client'
import { browserUrlForPortForwardEntry } from '@/lib/workspace-port-urls'
import { toRuntimeExecutionHostId } from '../../../shared/execution-host'
import { BROWSER_SCREENCAST_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'
import type { PortForwardEntry } from '../../../shared/ssh-types'
import type { WorkspacePort } from '../../../shared/workspace-ports'

const LOOPBACK_REMOTE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '::', ''])

type VmPortForwardResult = { ok: true } | { ok: false; reason: string }

/** The hidden SSH target of the recipe VM behind a managed server, or null for any other host. */
export async function findRecipeVmSshTargetId(environmentId: string): Promise<string | null> {
  try {
    return getRecipeVmSshTargetForHost(
      await window.api.runtimeEnvironments.list(),
      toRuntimeExecutionHostId(environmentId)
    )
  } catch {
    // Why: an unreadable catalog just means this is not known to be a recipe VM.
    return null
  }
}

function isLoopbackRemoteHost(host: string): boolean {
  return LOOPBACK_REMOTE_HOSTS.has(host.trim().toLowerCase())
}

// Why: a wildcard or loopback listener is reached through the VM's own localhost; anything else is a specific address.
function remoteHostForPort(port: WorkspacePort): string {
  return isLoopbackRemoteHost(port.connectHost) ? 'localhost' : port.connectHost
}

async function ensureForward(
  targetId: string,
  port: WorkspacePort
): Promise<PortForwardEntry | string> {
  const existing = (await window.api.ssh.listPortForwards({ targetId })).find(
    (entry) => entry.remotePort === port.port && isLoopbackRemoteHost(entry.remoteHost)
  )
  if (existing) {
    return existing
  }
  const request = {
    targetId,
    remoteHost: remoteHostForPort(port),
    remotePort: port.port,
    label: port.processName ? `${port.processName} :${port.port}` : `VM :${port.port}`
  }
  // Why the same number first: it matches what the app prints, so URLs and cookies line up.
  // A busy port falls back to any free one rather than failing the click.
  try {
    return await window.api.ssh.addPortForward({ ...request, localPort: port.port })
  } catch {
    try {
      return await window.api.ssh.addPortForward({ ...request, localPort: 0 })
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Opens a port that listens inside a recipe VM by forwarding it through the VM's SSH connection
 * and loading the local end, for VMs whose server has no browser to stream.
 */
export async function openPortThroughVmForward(args: {
  sshTargetId: string
  port: WorkspacePort
  openUrl: (url: string) => Promise<void> | void
}): Promise<VmPortForwardResult> {
  const forward = await ensureForward(args.sshTargetId, args.port)
  if (typeof forward === 'string') {
    return {
      ok: false,
      reason: `Could not forward port ${args.port.port} from the VM: ${forward}`
    }
  }
  const advertisedUrl = args.port.kind === 'workspace' ? args.port.advertisedUrl : undefined
  const url = browserUrlForPortForwardEntry({
    ...forward,
    ...(advertisedUrl ? { advertisedUrl } : {}),
    ...(args.port.protocol !== 'unknown' ? { advertisedProtocol: args.port.protocol } : {})
  })
  try {
    await args.openUrl(url)
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: message || 'Failed to open the forwarded port.' }
  }
}

/**
 * For a server with no browser to stream, opens the port through its recipe VM's SSH connection.
 * Null when the server can stream a browser or is not a recipe VM, so the caller keeps its own path.
 */
export async function openPortThroughVmForwardWhenServerHasNoBrowser(args: {
  environmentId: string
  port: WorkspacePort
  openUrl: (url: string) => Promise<void> | void
}): Promise<VmPortForwardResult | null> {
  // Why the lookup first: it is local, so a server that is not a recipe VM costs no extra runtime call.
  const sshTargetId = await findRecipeVmSshTargetId(args.environmentId)
  if (!sshTargetId) {
    return null
  }
  if (
    await runtimeEnvironmentSupportsCapability(
      args.environmentId,
      BROWSER_SCREENCAST_RUNTIME_CAPABILITY
    )
  ) {
    return null
  }
  return openPortThroughVmForward({ sshTargetId, port: args.port, openUrl: args.openUrl })
}
