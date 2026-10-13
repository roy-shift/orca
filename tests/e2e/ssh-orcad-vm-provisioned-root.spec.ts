import { openSidebarWorkspaceComposer } from './helpers/sidebar-project-dialog'
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
import { ensureTerminalVisible, waitForSessionReady } from './helpers/store'
import { ORCAD_TEMPLATE, skipUnlessManagedDockerHost } from './helpers/orcad-managed-workspace'
import { addRecipeRepo, seedRecipeRepo } from './helpers/ephemeral-vm-provisioned-root-fixture'
import { quotePosixShell } from '../../src/shared/wsl-login-shell-command'

/** A recipe VM's SSH root, served by a managed orcad the first connect deploys. */
skipUnlessManagedDockerHost()
test.skip(process.platform === 'win32', 'The recipe scripts are POSIX shell')
test.use({
  seedTestRepo: false,
  orcaAppExtraEnv: { ORCA_ORCAD_TEMPLATE_PATH: ORCAD_TEMPLATE ?? '' }
})

test('adopts a recipe-provisioned SSH root without creating a linked worktree', async ({
  orcaPage
}, testInfo) => {
  // The first connect deploys the VM's managed server before the root is adopted.
  test.setTimeout(420_000)
  let target: DockerSshHostTarget | null = null
  const sourceRepo = mkdtempSync(path.join(tmpdir(), 'orca-provisioned-root-source-'))
  try {
    ensureDockerSshHostImage(process.cwd())
    target = startDockerSshHostTarget(testInfo)
    const expectedRefHead = seedRecipeRepo(sourceRepo, target)
    await waitForSessionReady(orcaPage)
    const sourceRepoId = await addRecipeRepo(orcaPage, sourceRepo)

    await openSidebarWorkspaceComposer(orcaPage)
    const dialog = orcaPage.getByRole('dialog', { name: /Create (Workspace|Worktree)/i })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('combobox', { name: 'Run on' }).click()
    await orcaPage.getByRole('option', { name: /Per-Workspace Environment/ }).click()
    await orcaPage
      .getByRole('listbox', { name: 'Per-Workspace Environment' })
      .getByText('Docker provisioned root', { exact: true })
      .click()

    const workspaceName = `provisioned-root-${Date.now()}`
    await dialog.getByPlaceholder(/Type a name/i).fill(workspaceName)
    await dialog.getByRole('button', { name: /Create (Workspace|Worktree)/i }).click()
    const trustDialog = orcaPage.getByRole('dialog', { name: /Run VM recipe/ })
    await expect(trustDialog).toBeVisible()
    await trustDialog.getByRole('button', { name: 'Run hooks' }).click()

    await expect(dialog).toBeHidden({ timeout: 60_000 })
    await expect(orcaPage.getByRole('option', { name: new RegExp(workspaceName) })).toBeVisible({
      timeout: 240_000
    })

    const findAdopted = () =>
      orcaPage.evaluate(
        ({ sourceRepoId, workspaceName }) =>
          Object.values(window.__store!.getState().worktreesByRepo)
            .flat()
            .find(
              (worktree) =>
                worktree.displayName === workspaceName && worktree.repoId !== sourceRepoId
            ) ?? null,
        { sourceRepoId, workspaceName }
      )
    await expect
      .poll(findAdopted, { timeout: 60_000, message: 'the provisioned root was never adopted' })
      .not.toBeNull()
    const adopted = await findAdopted()
    await ensureTerminalVisible(orcaPage)
    expect(adopted).toMatchObject({
      path: DOCKER_SSH_HOST_REMOTE_REPO_PATH,
      isMainWorktree: true,
      ephemeralVmCheckoutMode: 'provisioned-root'
    })
    // The VM's managed server holds the workspace; no relay serves it.
    expect(adopted?.hostId).toMatch(/^runtime:/)
    expect(
      execDockerSshHostTargetCommand(
        target,
        `git -C ${quotePosixShell(DOCKER_SSH_HOST_REMOTE_REPO_PATH)} worktree list --porcelain | grep -c '^worktree '`
      )
    ).toBe('1')
    expect(
      execDockerSshHostTargetCommand(
        target,
        `git -C ${quotePosixShell(DOCKER_SSH_HOST_REMOTE_REPO_PATH)} branch --show-current`
      )
    ).toBe(workspaceName)
    expect(
      execDockerSshHostTargetCommand(
        target,
        `git -C ${quotePosixShell(DOCKER_SSH_HOST_REMOTE_REPO_PATH)} rev-parse HEAD`
      )
    ).toBe(expectedRefHead)

    // The adopted root is the main worktree, so its panels must work like any linked one's.
    await orcaPage.evaluate(() => {
      const state = window.__store!.getState()
      state.setRightSidebarTab('source-control')
      state.setRightSidebarOpen(true)
    })
    await orcaPage.getByRole('button', { name: 'Explorer' }).click()
    const explorer = orcaPage.locator('[data-orca-explorer-shell]')
    const recipeRow = explorer.locator('[data-file-explorer-row]').filter({
      has: orcaPage.locator('[data-file-explorer-row-name]').getByText('orca.yaml', { exact: true })
    })
    await expect(recipeRow).toBeVisible({ timeout: 30_000 })
    await recipeRow.click()
    const editor = orcaPage.locator('.monaco-editor').first()
    await expect(editor).toBeVisible({ timeout: 25_000 })
    const sentinel = `# saved-${Date.now()}`
    await editor.click()
    await orcaPage.keyboard.press('ControlOrMeta+End')
    await orcaPage.keyboard.press('Enter')
    await orcaPage.keyboard.type(sentinel)
    await orcaPage.keyboard.press('ControlOrMeta+S')
    await expect
      .poll(
        () =>
          execDockerSshHostTargetCommand(
            target!,
            `grep -c ${quotePosixShell(sentinel)} ${quotePosixShell(`${DOCKER_SSH_HOST_REMOTE_REPO_PATH}/orca.yaml`)} || true`
          ),
        { timeout: 15_000, message: 'the save never reached the VM' }
      )
      .toBe('1')
    await expect
      .poll(
        () =>
          orcaPage.evaluate(
            (id) =>
              window.__store!.getState().gitStatusByWorktree[id]?.map((entry) => entry.path) ?? [],
            adopted!.id
          ),
        { timeout: 30_000, message: 'Source Control never listed the saved change' }
      )
      .toContain('orca.yaml')

    // A session recorded on the VM under the adopted root must list in the Agents panel.
    const sessionId = 'cccccccc-dddd-4eee-8fff-000000000001'
    const promptText = `provisioned root agent prompt ${Date.now()}`
    const transcript = `${[
      {
        type: 'user',
        sessionId,
        cwd: DOCKER_SSH_HOST_REMOTE_REPO_PATH,
        timestamp: new Date().toISOString(),
        message: { role: 'user', content: promptText }
      },
      {
        type: 'assistant',
        sessionId,
        timestamp: new Date().toISOString(),
        message: { role: 'assistant', content: 'done' }
      }
    ]
      .map((record) => JSON.stringify(record))
      .join('\n')}\n`
    execDockerSshHostTargetCommand(
      target,
      `d="$HOME/.claude/projects/-provisioned-root" && mkdir -p "$d" && echo ${quotePosixShell(
        Buffer.from(transcript).toString('base64')
      )} | base64 -d > "$d/${sessionId}.jsonl"`
    )
    await orcaPage.evaluate(() => {
      const state = window.__store!.getState()
      state.setRightSidebarTab('vault')
      state.setRightSidebarOpen(true)
    })
    await orcaPage.getByRole('button', { name: 'Agents', exact: true }).click()
    await expect(orcaPage.getByText(promptText, { exact: false }).first()).toBeVisible({
      timeout: 60_000
    })

    const removeDialog = orcaPage.getByRole('dialog', { name: 'Remove Project' })
    const removeMenuItem = orcaPage.getByRole('menuitem', { name: 'Delete Workspace' })
    await expect(async () => {
      await orcaPage
        .getByRole('option', { name: new RegExp(workspaceName) })
        .click({ button: 'right' })
      await expect(removeMenuItem).toBeVisible({ timeout: 1_000 })
      await removeMenuItem.click({ force: true, timeout: 1_000 })
      await expect(removeDialog).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 10_000 })
    await expect(removeDialog).toContainText(
      'Its VM recipe determines whether the environment and its files are permanently deleted.'
    )
    await removeDialog.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect
      .poll(
        () =>
          orcaPage.evaluate(
            (repoId) => window.__store!.getState().repos.some((repo) => repo.id === repoId),
            adopted!.repoId
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
