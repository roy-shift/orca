export const DEFAULT_MAC_COMMAND_PATH = '/usr/local/bin/orca'
export const DEV_COMMAND_NAME = 'orca-dev'
export const LEGACY_LINUX_COMMAND_NAME = 'orca'
export const DEV_LAUNCHER_DIR = ['cli', 'bin'] as const
export const WINDOWS_PATH_WRITE_TIMEOUT_MS = 5_000

/**
 * The shell command a renamed bundle installs, e.g. `Orca Shift.app` -> `orca-shift`, so a fork
 * never claims upstream's `orca`. Null for upstream's own `Orca.app` and for anything off macOS.
 */
export function getRenamedBundleCommandName(resourcesPath: string): string | null {
  const bundle = resourcesPath
    .split(/[\\/]/)
    .find((segment) => segment.toLowerCase().endsWith('.app'))
  const appName = bundle?.slice(0, -'.app'.length)
  if (!appName || appName === 'Orca') {
    return null
  }
  const slug = appName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || null
}
