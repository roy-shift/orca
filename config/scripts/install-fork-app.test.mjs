import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  backupDataDir,
  defaultPaths,
  restoreDataDir,
  rollbackApp,
  swapInApp
} from './install-fork-app.mjs'

const roots = []
function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'orca-install-fork-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function writeFile(path, content) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

/** A stand-in bundle; the real copy uses ditto, which the tests replace with a plain copy. */
function fakeApp(root, name, marker) {
  const app = join(root, name)
  writeFile(join(app, 'Contents', 'marker'), marker)
  return app
}
const plainCopy = (from, to) => cpSync(from, to, { recursive: true })

describe('defaultPaths', () => {
  it('keeps the fork apart from upstream Orca and its data', () => {
    const paths = defaultPaths('/Users/me')

    expect(paths.dataDir).toBe('/Users/me/Library/Application Support/Orca Shift')
    expect(paths.backupRoot).not.toContain('/Application Support/orca/')
    expect(paths.installDir).toBe('/Users/me/Applications')
  })
})

describe('backupDataDir', () => {
  it('copies the user data and leaves caches and the original untouched', () => {
    const root = tempRoot()
    const dataDir = join(root, 'data')
    writeFile(join(dataDir, 'profiles', 'local-default', 'profile-state.db'), 'DB')
    writeFile(join(dataDir, 'orca-devices.json'), '[]')
    writeFile(join(dataDir, 'Cache', 'big'), 'x')
    writeFile(join(dataDir, 'daemon', 'token'), 'secret')

    const backup = backupDataDir({ dataDir, backupRoot: join(root, 'backups'), now: 1 })

    expect(
      readFileSync(join(backup, 'profiles', 'local-default', 'profile-state.db'), 'utf8')
    ).toBe('DB')
    expect(existsSync(join(backup, 'orca-devices.json'))).toBe(true)
    expect(existsSync(join(backup, 'Cache'))).toBe(false)
    expect(existsSync(join(backup, 'daemon'))).toBe(false)
    expect(
      readFileSync(join(dataDir, 'profiles', 'local-default', 'profile-state.db'), 'utf8')
    ).toBe('DB')
  })

  it('skips live sockets instead of failing on them', async () => {
    const root = tempRoot()
    const dataDir = join(root, 'data')
    writeFile(join(dataDir, 'settings.json'), '{}')
    const socketPath = join(dataDir, 'o-1.sock')
    const server = createServer()
    await new Promise((resolve) => server.listen(socketPath, resolve))
    try {
      const backup = backupDataDir({ dataDir, backupRoot: join(root, 'backups'), now: 1 })

      expect(readdirSync(backup)).toEqual(['settings.json'])
    } finally {
      server.close()
    }
  })

  it('keeps only the newest backups', () => {
    const root = tempRoot()
    const dataDir = join(root, 'data')
    writeFile(join(dataDir, 'a'), '1')
    const backupRoot = join(root, 'backups')

    for (let i = 1; i <= 5; i++) {
      backupDataDir({ dataDir, backupRoot, now: i * 1000, keep: 3 })
    }

    expect(readdirSync(backupRoot)).toHaveLength(3)
  })

  it('does nothing on a first install with no data yet', () => {
    const root = tempRoot()

    expect(backupDataDir({ dataDir: join(root, 'none'), backupRoot: join(root, 'b') })).toBeNull()
  })
})

describe('swapInApp and rollbackApp', () => {
  it('keeps the replaced app and can put it back', async () => {
    const root = tempRoot()
    const installDir = join(root, 'Applications')
    const oldBuild = fakeApp(root, 'old-build', 'old')
    const newBuild = fakeApp(root, 'new-build', 'new')
    await swapInApp({ builtApp: oldBuild, installDir, copyApp: plainCopy })

    const { installed, previous } = await swapInApp({
      builtApp: newBuild,
      installDir,
      copyApp: plainCopy
    })

    expect(readFileSync(join(installed, 'Contents', 'marker'), 'utf8')).toBe('new')
    expect(readFileSync(join(previous, 'Contents', 'marker'), 'utf8')).toBe('old')

    rollbackApp({ installDir })

    expect(readFileSync(join(installed, 'Contents', 'marker'), 'utf8')).toBe('old')
  })

  it('leaves the installed app alone when the copy fails', async () => {
    const root = tempRoot()
    const installDir = join(root, 'Applications')
    await swapInApp({ builtApp: fakeApp(root, 'good', 'good'), installDir, copyApp: plainCopy })

    await expect(async () =>
      swapInApp({
        builtApp: fakeApp(root, 'bad', 'bad'),
        installDir,
        copyApp: () => {
          throw new Error('disk full')
        }
      })
    ).rejects.toThrow('disk full')

    expect(readFileSync(join(installDir, 'Orca Shift.app', 'Contents', 'marker'), 'utf8')).toBe(
      'good'
    )
  })

  it('refuses to roll back when there is nothing to roll back to', () => {
    expect(() => rollbackApp({ installDir: join(tempRoot(), 'Applications') })).toThrow(
      'No previous app'
    )
  })
})

describe('restoreDataDir', () => {
  it('restores a backup and first keeps the data it replaces', () => {
    const root = tempRoot()
    const dataDir = join(root, 'data')
    const backupRoot = join(root, 'backups')
    writeFile(join(dataDir, 'settings.json'), 'v1')
    const backup = backupDataDir({ dataDir, backupRoot, now: 1000 })
    writeFile(join(dataDir, 'settings.json'), 'v2-newer')

    const safety = restoreDataDir({ backupDir: backup, dataDir, backupRoot, now: 2000 })

    expect(readFileSync(join(dataDir, 'settings.json'), 'utf8')).toBe('v1')
    expect(readFileSync(join(safety, 'settings.json'), 'utf8')).toBe('v2-newer')
  })

  it('refuses a backup that does not exist, without touching the data', () => {
    const root = tempRoot()
    const dataDir = join(root, 'data')
    writeFile(join(dataDir, 'settings.json'), 'keep')

    expect(() =>
      restoreDataDir({ backupDir: join(root, 'nope'), dataDir, backupRoot: join(root, 'b') })
    ).toThrow('Backup not found')
    expect(readFileSync(join(dataDir, 'settings.json'), 'utf8')).toBe('keep')
  })
})
