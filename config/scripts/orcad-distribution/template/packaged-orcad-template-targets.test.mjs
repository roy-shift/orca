import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { packagedOrcadTemplateTargets } = require('./verify-packaged-orcad-template.cjs')

describe('packagedOrcadTemplateTargets', () => {
  it('ships every target unless a local build names a narrower set', () => {
    expect(packagedOrcadTemplateTargets({})).toBeUndefined()
    expect(packagedOrcadTemplateTargets({ ORCA_ORCAD_TEMPLATE_TARGETS: ' , ' })).toBeUndefined()
    expect(
      packagedOrcadTemplateTargets({
        ORCA_ORCAD_TEMPLATE_TARGETS: 'linux-arm64-glibc, darwin-arm64'
      })
    ).toEqual(['linux-arm64-glibc', 'darwin-arm64'])
  })
})
