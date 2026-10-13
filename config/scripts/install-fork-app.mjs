/**
 * Installs the fork app built by `pnpm build:fork` without risking its data: refuses while the
 * app runs, backs the data folder up first, and keeps the app it replaces for a one-step rollback.
 *
 *   pnpm install:fork                    install dist/mac-arm64/Orca Shift.app
 *   pnpm install:fork --rollback         put the previous app back (data is left as it is)
 *   pnpm install:fork --restore-data <backup>   replace the data folder with a backup
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const APP_NAME = 'Orca Shift.app'
const BACKUPS_TO_KEEP = 10
// Chromium caches and live sockets are rebuilt on launch; everything else is the user's data.
const SKIPPED_NAMES = new Set([
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'Crashpad',
  'DevToolsActivePort',
  'daemon',
  'daemon-host'
])

export function defaultPaths(home = homedir()) {
  return {
    dataDir: join(home, 'Library', 'Application Support', 'Orca Shift'),
    backupRoot: join(home, 'Library', 'Application Support', 'Orca Shift Backups'),
    installDir: join(home, 'Applications')
  }
}

function shouldCopy(source) {
  const name = basename(source)
  if (SKIPPED_NAMES.has(name) || name.endsWith('.sock')) {
    return false
  }
  return !lstatSync(source).isSocket()
}

function timestamp(now) {
  return new Date(now).toISOString().replace(/[:.]/g, '-')
}

/** Copies the data folder to a new timestamped backup and drops all but the newest few. */
export function backupDataDir({ dataDir, backupRoot, now = Date.now(), keep = BACKUPS_TO_KEEP }) {
  if (!existsSync(dataDir)) {
    return null
  }
  const target = join(backupRoot, timestamp(now))
  mkdirSync(backupRoot, { recursive: true })
  cpSync(dataDir, target, { recursive: true, filter: shouldCopy })
  const backups = readdirSync(backupRoot).sort()
  for (const stale of backups.slice(0, Math.max(0, backups.length - keep))) {
    rmSync(join(backupRoot, stale), { recursive: true, force: true })
  }
  return target
}

/** Installs `builtApp`, moving the app it replaces to `<name>.previous`. */
export function swapInApp({ builtApp, installDir, copyApp = copyBundle }) {
  const installed = join(installDir, APP_NAME)
  const previous = `${installed}.previous`
  mkdirSync(installDir, { recursive: true })
  const staged = `${installed}.incoming`
  rmSync(staged, { recursive: true, force: true })
  // Why: copy beside the target first, so a failed copy never leaves a half-installed app.
  copyApp(builtApp, staged)
  if (existsSync(installed)) {
    rmSync(previous, { recursive: true, force: true })
    renameSync(installed, previous)
  }
  renameSync(staged, installed)
  return { installed, previous: existsSync(previous) ? previous : null }
}

export function rollbackApp({ installDir }) {
  const installed = join(installDir, APP_NAME)
  const previous = `${installed}.previous`
  if (!existsSync(previous)) {
    throw new Error(`No previous app to roll back to at ${previous}`)
  }
  const rejected = `${installed}.rolled-back`
  rmSync(rejected, { recursive: true, force: true })
  if (existsSync(installed)) {
    renameSync(installed, rejected)
  }
  renameSync(previous, installed)
  return installed
}

export function restoreDataDir({ backupDir, dataDir, backupRoot, now = Date.now() }) {
  if (!existsSync(backupDir)) {
    throw new Error(`Backup not found: ${backupDir}`)
  }
  // Why: restoring replaces newer data, so keep what is there as one more backup first.
  const safety = backupDataDir({ dataDir, backupRoot, now })
  rmSync(dataDir, { recursive: true, force: true })
  cpSync(backupDir, dataDir, { recursive: true })
  return safety
}

function copyBundle(from, to) {
  // Why: ditto keeps symlinks, extended attributes and the code signature intact.
  execFileSync('ditto', [from, to])
}

function isAppRunning(installDir) {
  try {
    execFileSync('pgrep', ['-f', join(installDir, APP_NAME, 'Contents', 'MacOS')], {
      stdio: 'ignore'
    })
    return true
  } catch {
    return false
  }
}

function main(argv) {
  const paths = defaultPaths()
  if (isAppRunning(paths.installDir)) {
    throw new Error('Orca Shift is running. Quit it first so its data is not copied mid-write.')
  }
  if (argv.includes('--rollback')) {
    console.log(`[install:fork] rolled back to ${rollbackApp(paths)}`)
    return
  }
  const restoreIndex = argv.indexOf('--restore-data')
  if (restoreIndex !== -1) {
    const backupDir = resolve(argv[restoreIndex + 1] ?? '')
    const safety = restoreDataDir({ backupDir, ...paths })
    console.log(`[install:fork] restored ${backupDir}; the data it replaced is at ${safety}`)
    return
  }
  const builtApp = resolve('dist', 'mac-arm64', APP_NAME)
  if (!existsSync(builtApp)) {
    throw new Error(`Nothing to install at ${builtApp}. Run pnpm build:fork first.`)
  }
  const backup = backupDataDir(paths)
  console.log(
    backup ? `[install:fork] data backed up to ${backup}` : '[install:fork] no data to back up yet'
  )
  const { installed, previous } = swapInApp({ builtApp, installDir: paths.installDir })
  // Why: the build output would otherwise show up as a second app in Spotlight and Launchpad.
  rmSync(builtApp, { recursive: true, force: true })
  console.log(`[install:fork] installed ${installed}`)
  if (previous) {
    console.log(`[install:fork] previous app kept at ${previous} (pnpm install:fork --rollback)`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error(`[install:fork] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
