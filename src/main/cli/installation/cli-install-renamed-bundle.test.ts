import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => tmpdir(), getAppPath: () => tmpdir() }
}))

import { getRenamedBundleCommandName } from './cli-install-constants'
import { CliInstaller } from '../cli-installer'

const execFileAsync = promisify(execFile)
const darwinLauncherAsset = new URL('../../../../resources/darwin/bin/orca', import.meta.url)

async function makeFixture(): Promise<{ root: string; userDataPath: string; appPath: string }> {
  const root = await mkdtemp(join(tmpdir(), 'orca-cli-installer-'))
  const appPath = join(root, 'app')
  await mkdir(join(appPath, 'out', 'cli'), { recursive: true })
  await writeFile(join(appPath, 'out', 'cli', 'index.js'), 'console.log("orca")\n', 'utf8')
  return { root, userDataPath: join(root, 'userData'), appPath }
}

describe('getRenamedBundleCommandName', () => {
  it('names the command after a renamed bundle and leaves upstream alone', () => {
    expect(getRenamedBundleCommandName('/Applications/Orca Shift.app/Contents/Resources')).toBe(
      'orca-shift'
    )
    expect(getRenamedBundleCommandName('/Users/me/Applications/Orca ALab Edition.app/x')).toBe(
      'orca-alab-edition'
    )
    expect(getRenamedBundleCommandName('/Applications/Orca.app/Contents/Resources')).toBeNull()
    expect(getRenamedBundleCommandName('/opt/orca/resources')).toBeNull()
    expect(getRenamedBundleCommandName('C:\\Orca Shift.app\\Contents')).toBe('orca-shift')
  })
})

async function makeRenamedBundle(root: string, bundle: string): Promise<string> {
  const resourcesPath = join(root, bundle, 'Contents', 'Resources')
  await mkdir(join(resourcesPath, 'bin'), { recursive: true })
  await writeFile(join(resourcesPath, 'bin', 'orca'), '#!/usr/bin/env bash\necho orca\n', {
    encoding: 'utf8',
    mode: 0o755
  })
  return resourcesPath
}

describe.skipIf(process.platform === 'win32')('CliInstaller for a renamed macOS bundle', () => {
  it('installs under its own command name, never as upstream orca', async () => {
    const fixture = await makeFixture()
    const resourcesPath = await makeRenamedBundle(fixture.root, 'Orca Shift.app')
    const installer = new CliInstaller({
      platform: 'darwin',
      isPackaged: true,
      resourcesPath,
      userDataPath: fixture.userDataPath,
      execPath: join(fixture.root, 'Orca Shift.app', 'Contents', 'MacOS', 'Orca Shift'),
      appPath: fixture.appPath,
      homePath: join(fixture.root, 'home'),
      processPathEnv: ''
    })

    const status = await installer.getStatus()

    expect(status.commandName).toBe('orca-shift')
    expect(basename(status.commandPath ?? '')).toBe('orca-shift')
  })

  it('keeps the orca name for upstream Orca.app', async () => {
    const fixture = await makeFixture()
    const resourcesPath = await makeRenamedBundle(fixture.root, 'Orca.app')
    const installer = new CliInstaller({
      platform: 'darwin',
      isPackaged: true,
      resourcesPath,
      userDataPath: fixture.userDataPath,
      execPath: join(fixture.root, 'Orca.app', 'Contents', 'MacOS', 'Orca'),
      appPath: fixture.appPath,
      homePath: join(fixture.root, 'home'),
      processPathEnv: ''
    })

    const status = await installer.getStatus()

    expect(status.commandName).toBe('orca')
    expect(basename(status.commandPath ?? '')).toBe('orca')
  })

  it('falls back to ~/.local/bin/<name> when /usr/local/bin is absent', async () => {
    const fixture = await makeFixture()
    const resourcesPath = await makeRenamedBundle(fixture.root, 'Orca Shift.app')
    const homePath = join(fixture.root, 'home')
    const installer = new CliInstaller({
      platform: 'darwin',
      isPackaged: true,
      resourcesPath,
      userDataPath: fixture.userDataPath,
      execPath: join(fixture.root, 'Orca Shift.app', 'Contents', 'MacOS', 'Orca Shift'),
      appPath: fixture.appPath,
      homePath,
      defaultMacCommandPath: join(fixture.root, 'absent', 'bin', 'ignored'),
      processPathEnv: join(homePath, '.local', 'bin')
    })

    const status = await installer.getStatus()

    expect(status.commandPath).toBe(join(homePath, '.local', 'bin', 'orca-shift'))
  })
})

// Why: a renamed build (a fork) cannot ship its executable as `Orca`, so the launcher reads the bundle.
describe.skipIf(process.platform !== 'darwin')('macOS launcher in a renamed bundle', () => {
  async function stageBundle(
    root: string,
    appName: string,
    plist: Record<string, string>,
    executableBody: string
  ): Promise<string> {
    const contents = join(root, `${appName}.app`, 'Contents')
    const launcherPath = join(contents, 'Resources', 'bin', 'orca')
    const electronPath = join(contents, 'MacOS', plist.CFBundleExecutable ?? 'Orca')
    const cliPath = join(contents, 'Resources', 'app.asar.unpacked', 'out', 'cli', 'index.js')
    await mkdir(dirname(launcherPath), { recursive: true })
    await mkdir(dirname(electronPath), { recursive: true })
    await mkdir(dirname(cliPath), { recursive: true })
    await copyFile(darwinLauncherAsset, launcherPath)
    await writeFile(cliPath, '', 'utf8')
    const entries = Object.entries(plist)
      .map(([key, value]) => `<key>${key}</key><string>${value}</string>`)
      .join('')
    await writeFile(
      join(contents, 'Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict>${entries}</dict></plist>\n`,
      'utf8'
    )
    await writeFile(electronPath, `#!/usr/bin/env bash\n${executableBody}\n`, {
      encoding: 'utf8',
      mode: 0o755
    })
    return launcherPath
  }

  it('runs the executable the bundle names', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-renamed-cli-'))
    try {
      const launcher = await stageBundle(
        root,
        'Orca Shift',
        { CFBundleExecutable: 'Orca Shift' },
        'echo renamed-executable-ran'
      )
      const env = { ...process.env }
      delete env.ORCA_CLI_COMMAND
      const result = await execFileAsync(launcher, ['--help'], { env })
      expect(result.stdout.trim()).toBe('renamed-executable-ran')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('points a renamed app at its own data folder unless the caller chose one', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-renamed-data-'))
    try {
      const launcher = await stageBundle(
        root,
        'Orca Shift',
        { CFBundleExecutable: 'Orca Shift', CFBundleName: 'Orca Shift' },
        'echo "data=${ORCA_USER_DATA_PATH-unset}"'
      )
      const baseEnv: NodeJS.ProcessEnv = { ...process.env, HOME: '/Users/someone' }
      delete baseEnv.ORCA_USER_DATA_PATH
      delete baseEnv.ORCA_CLI_COMMAND

      const defaulted = await execFileAsync(launcher, [], { env: baseEnv })
      const chosen = await execFileAsync(launcher, [], {
        env: { ...baseEnv, ORCA_USER_DATA_PATH: '/custom/path' }
      })

      expect(defaulted.stdout.trim()).toBe(
        'data=/Users/someone/Library/Application Support/Orca Shift'
      )
      expect(chosen.stdout.trim()).toBe('data=/custom/path')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('leaves upstream Orca on its default data folder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-upstream-data-'))
    try {
      const launcher = await stageBundle(
        root,
        'Orca',
        { CFBundleExecutable: 'Orca', CFBundleName: 'Orca' },
        'echo "data=${ORCA_USER_DATA_PATH-unset}"'
      )
      const env = { ...process.env }
      delete env.ORCA_USER_DATA_PATH
      delete env.ORCA_CLI_COMMAND

      const result = await execFileAsync(launcher, [], { env })

      expect(result.stdout.trim()).toBe('data=unset')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
