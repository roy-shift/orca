import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from './helpers/orca-app'
import { ensureDockerSshHostImage } from './helpers/docker-ssh-host-image'
import {
  cleanupDockerSshHostTarget,
  execDockerSshHostTargetCommand,
  startDockerSshHostTarget,
  DOCKER_SSH_HOST_REMOTE_REPO_PATH,
  type DockerSshHostTarget
} from './helpers/docker-ssh-host-target'
import { waitForSessionReady } from './helpers/store'
import { ORCAD_TEMPLATE, skipUnlessManagedDockerHost } from './helpers/orcad-managed-workspace'
import { addRecipeRepo, seedRecipeRepo } from './helpers/ephemeral-vm-provisioned-root-fixture'
import { orcaCliResult } from './helpers/compiled-orca-cli'
import { quotePosixShell } from '../../src/shared/wsl-login-shell-command'

/** `orca worktree create --recipe`: the CLI makes the same VM workspace the New Workspace dialog does. */
skipUnlessManagedDockerHost()
test.skip(process.platform === 'win32', 'The recipe scripts are POSIX shell')
test.use({
  seedTestRepo: false,
  orcaAppExtraEnv: { ORCA_ORCAD_TEMPLATE_PATH: ORCAD_TEMPLATE ?? '' }
})

test('creates a provisioned-root workspace from the CLI without taking over the window', async ({
  electronApp,
  orcaPage
}, testInfo) => {
  test.setTimeout(420_000)
  let target: DockerSshHostTarget | null = null
  const sourceRepo = mkdtempSync(path.join(tmpdir(), 'orca-recipe-cli-source-'))
  try {
    ensureDockerSshHostImage(process.cwd())
    target = startDockerSshHostTarget(testInfo)
    seedRecipeRepo(sourceRepo, target)
    await waitForSessionReady(orcaPage)
    const sourceRepoId = await addRecipeRepo(orcaPage, sourceRepo)
    const userDataDir = await electronApp.evaluate(({ app }) => app.getPath('userData'))
    const viewBefore = await orcaPage.evaluate(() => {
      const state = window.__store!.getState()
      return { activeView: state.activeView, activeWorktreeId: state.activeWorktreeId }
    })

    const workspaceName = `cli-recipe-${Date.now()}`
    const created = orcaCliResult<{
      worktree: {
        id: string
        repoId: string
        path: string
        displayName: string
        isMainWorktree: boolean
        hostId?: string
        ephemeralVmCheckoutMode?: string
      }
    }>(
      userDataDir,
      [
        'worktree',
        'create',
        '--repo',
        `id:${sourceRepoId}`,
        '--name',
        workspaceName,
        '--recipe',
        'docker-provisioned-root'
      ],
      360_000
    )
    // The recipe runs repo scripts, so the desktop still asks before running them.
    const trustDialog = orcaPage.getByRole('dialog', { name: /Run VM recipe/ })
    await expect(trustDialog).toBeVisible({ timeout: 60_000 })
    await trustDialog.getByRole('button', { name: 'Run hooks' }).click()

    const { worktree } = await created
    expect(worktree).toMatchObject({
      path: DOCKER_SSH_HOST_REMOTE_REPO_PATH,
      displayName: workspaceName,
      isMainWorktree: true,
      ephemeralVmCheckoutMode: 'provisioned-root'
    })
    expect(worktree.repoId).not.toBe(sourceRepoId)
    expect(worktree.hostId).toMatch(/^runtime:/)
    expect(
      execDockerSshHostTargetCommand(
        target,
        `git -C ${quotePosixShell(DOCKER_SSH_HOST_REMOTE_REPO_PATH)} branch --show-current`
      )
    ).toBe(workspaceName)

    // The workspace is in the sidebar and the user was never moved off what they were viewing.
    await expect(orcaPage.getByRole('option', { name: new RegExp(workspaceName) })).toBeVisible({
      timeout: 60_000
    })
    const viewAfter = await orcaPage.evaluate(() => {
      const state = window.__store!.getState()
      return {
        activeView: state.activeView,
        activeWorktreeId: state.activeWorktreeId,
        activePendingCreationId: state.activePendingCreationId
      }
    })
    expect(viewAfter).toEqual({ ...viewBefore, activePendingCreationId: null })

    // A server inside the VM is reachable from the Mac through Orca's own SSH forward, which is
    // how "Open in browser" works for a VM whose server has no browser of its own.
    const vmNode = execDockerSshHostTargetCommand(
      target,
      'ls /root/.orca-remote/runtimes/*/bin/node | head -1'
    )
    execDockerSshHostTargetCommand(
      target,
      `nohup ${quotePosixShell(vmNode)} -e "require('http').createServer((q,r)=>r.end('vm-ok')).listen(8123,'127.0.0.1')" >/tmp/vm-http.log 2>&1 &`
    )
    const sshTargetId = await orcaPage.evaluate(async (hostId) => {
      const environmentId = hostId.replace(/^runtime:/, '')
      const environments = await window.api.runtimeEnvironments.list()
      return environments.find((entry) => entry.id === environmentId)?.orcadDeployment?.sshTargetId
    }, worktree.hostId ?? '')
    expect(sshTargetId, 'the recipe VM has a hidden SSH target').toMatch(/^runtime-ssh-/)
    const forward = await orcaPage.evaluate(
      (targetId) =>
        window.api.ssh.addPortForward({
          targetId,
          localPort: 0,
          remoteHost: 'localhost',
          remotePort: 8123
        }),
      sshTargetId!
    )
    try {
      await expect
        .poll(
          async () => {
            try {
              return await (await fetch(`http://127.0.0.1:${forward.localPort}`)).text()
            } catch {
              return 'unreachable'
            }
          },
          { timeout: 20_000, message: 'the VM server was not reachable through the forward' }
        )
        .toBe('vm-ok')
    } finally {
      await orcaPage.evaluate((id) => window.api.ssh.removePortForward({ id }), forward.id)
    }

    // A recipe VM workspace is deleted from its own menu, which destroys the VM.
    const deleteItem = orcaPage.getByRole('menuitem', { name: 'Delete Workspace' })
    await expect(async () => {
      await orcaPage
        .getByRole('option', { name: new RegExp(workspaceName) })
        .click({ button: 'right' })
      await expect(deleteItem).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 10_000 })
    await expect(orcaPage.getByRole('menuitem', { name: 'Delete Worktree' })).toHaveCount(0)
    await deleteItem.click({ force: true, timeout: 1_000 })
    const removeDialog = orcaPage.getByRole('dialog', { name: 'Remove Project' })
    await expect(removeDialog).toBeVisible({ timeout: 5_000 })
    await removeDialog.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect
      .poll(
        () =>
          orcaPage.evaluate(
            (repoId) => window.__store!.getState().repos.some((repo) => repo.id === repoId),
            worktree.repoId
          ),
        { timeout: 30_000 }
      )
      .toBe(false)
    const destroyed = target
    expect(() => execDockerSshHostTargetCommand(destroyed, 'true')).toThrow()
  } finally {
    cleanupDockerSshHostTarget(target)
    rmSync(sourceRepo, { recursive: true, force: true })
  }
})
