import { execFileSync } from 'node:child_process'
import { chmodSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  execDockerSshHostTargetCommand,
  DOCKER_SSH_HOST_REMOTE_REPO_PATH,
  type DockerSshHostTarget
} from './docker-ssh-host-target'
import type { waitForSessionReady } from './store'
import { quotePosixShell } from '../../../src/shared/wsl-login-shell-command'

/** A source project whose `orca.yaml` recipe provisions a Docker SSH host as a provisioned root. */
export async function addRecipeRepo(
  page: Parameters<typeof waitForSessionReady>[0],
  repoPath: string
) {
  return page.evaluate(async (pathValue) => {
    const result = await window.api.repos.add({ path: pathValue })
    if ('error' in result) {
      throw new Error(result.error)
    }
    const store = window.__store!
    await store.getState().fetchRepos({ runtimeEnvironmentId: null })
    await store.getState().updateSettings({ experimentalEphemeralVms: true })
    store.getState().setActiveRepo(result.repo.id)
    return result.repo.id
  }, repoPath)
}

export function seedRecipeRepo(repoPath: string, target: DockerSshHostTarget): string {
  const createScript = path.join(repoPath, 'create.sh')
  const destroyScript = path.join(repoPath, 'destroy.sh')
  // The recipe's isolated HOME must still address the engine that owns the fixture container.
  const docker = `docker --config ${quotePosixShell(process.env.DOCKER_CONFIG ?? path.join(homedir(), '.docker'))}`
  writeFileSync(
    createScript,
    `#!/usr/bin/env bash
set -euo pipefail
[ "\${ORCA_RECIPE_RESULT_SCHEMA_VERSION:-}" = 2 ]
[ -n "\${ORCA_REPO_URL:-}" ]
[ -n "\${ORCA_REPO_REF:-}" ]
[ -n "\${ORCA_REPO_REF_HEAD:-}" ]
[ -n "\${ORCA_REPO_BRANCH:-}" ]
${docker} exec ${quotePosixShell(target.containerName)} git -C ${quotePosixShell(DOCKER_SSH_HOST_REMOTE_REPO_PATH)} cat-file -e "$ORCA_REPO_REF_HEAD^{commit}"
${docker} exec ${quotePosixShell(target.containerName)} git -C ${quotePosixShell(DOCKER_SSH_HOST_REMOTE_REPO_PATH)} checkout -B "$ORCA_REPO_BRANCH" "$ORCA_REPO_REF_HEAD" >&2
node -e 'console.log(JSON.stringify({schemaVersion:2,checkoutMode:"provisioned-root",connection:{type:"ssh",projectRoot:process.argv[1],target:{label:"Docker provisioned root",host:process.argv[2],port:Number(process.argv[3]),username:"root",identityFile:process.argv[4],identitiesOnly:true}}}))' ${quotePosixShell(DOCKER_SSH_HOST_REMOTE_REPO_PATH)} ${quotePosixShell(target.host)} ${target.port} ${quotePosixShell(target.identityFile)}
`
  )
  writeFileSync(
    destroyScript,
    `#!/usr/bin/env bash
set -euo pipefail
cat >/dev/null
${docker} rm -f ${quotePosixShell(target.containerName)} >/dev/null
`
  )
  chmodSync(createScript, 0o755)
  chmodSync(destroyScript, 0o755)
  writeFileSync(
    path.join(repoPath, 'orca.yaml'),
    `environmentRecipes:
  - id: docker-provisioned-root
    name: Docker provisioned root
    checkoutMode: provisioned-root
    create: ./create.sh
    destroy: ./destroy.sh
`
  )
  execFileSync('git', ['init'], { cwd: repoPath })
  execFileSync('git', ['config', 'user.email', 'e2e@test.local'], { cwd: repoPath })
  execFileSync('git', ['config', 'user.name', 'Orca E2E'], { cwd: repoPath })
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/stablyai/orca.git'], {
    cwd: repoPath
  })
  execFileSync('git', ['add', '.'], { cwd: repoPath })
  execFileSync('git', ['commit', '-m', 'seed recipe'], { cwd: repoPath })
  const expectedRefHead = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoPath,
    encoding: 'utf8'
  }).trim()
  execDockerSshHostTargetCommand(
    target,
    `rm -rf ${quotePosixShell(DOCKER_SSH_HOST_REMOTE_REPO_PATH)} && mkdir -p ${quotePosixShell(DOCKER_SSH_HOST_REMOTE_REPO_PATH)}`
  )
  execFileSync('docker', [
    'cp',
    `${repoPath}${path.sep}.`,
    `${target.containerName}:${DOCKER_SSH_HOST_REMOTE_REPO_PATH}`
  ])
  execDockerSshHostTargetCommand(
    target,
    `chown -R root:root ${quotePosixShell(DOCKER_SSH_HOST_REMOTE_REPO_PATH)}`
  )
  return expectedRefHead
}
