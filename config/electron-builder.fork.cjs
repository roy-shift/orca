/**
 * Shift's fork build: the stock config with its own identity, so it installs next to upstream
 * Orca (own bundle id, own data folder and Keychain key, own URL scheme) and never updates from it.
 *
 *   pnpm build:fork
 */
// Why before the base config loads: its packaging hooks read this when they verify the template.
// The fork ships the one server target its Docker VMs run; CI builds the rest (see docs/fork).
process.env.ORCA_ORCAD_TEMPLATE_TARGETS ??= 'linux-arm64-glibc'

const base = require('./electron-builder.config.cjs')

const FORK_NAME = 'orca-shift'
const FORK_PRODUCT_NAME = 'Orca Shift'

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...base,
  appId: 'com.shiftsec.orca-shift',
  productName: FORK_PRODUCT_NAME,
  protocols: [{ name: FORK_PRODUCT_NAME, schemes: [FORK_NAME] }],
  // Why: the app's data folder follows its package name, so this keeps it apart from upstream's `orca`.
  extraMetadata: { ...base.extraMetadata, name: FORK_NAME, productName: FORK_PRODUCT_NAME },
  mac: { ...base.mac, target: [{ target: 'dir', arch: ['arm64'] }] },
  // Why: an update check must look at this fork's releases, never upstream's.
  publish: { provider: 'github', owner: 'roy-shift', repo: 'orca', releaseType: 'release' }
}
