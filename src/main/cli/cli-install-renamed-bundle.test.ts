import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => tmpdir(), getAppPath: () => tmpdir() }
}))

import { getRenamedBundleCommandName } from './cli-install-constants'
import { CliInstaller } from './cli-installer'
import { makeFixture } from './cli-installer-test-fixtures'

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
