import { describe, expect, it } from 'vitest'
import {
  buildRunTargetRows,
  type EphemeralVmRecipeOption,
  type RunTargetHostOption
} from './run-target-options'

const recipes: EphemeralVmRecipeOption[] = [
  { id: 'local-docker-ssh', name: 'Local Docker (SSH)', create: './create.sh' },
  { id: 'cloud-sandbox', name: 'Cloud Sandbox', create: './sandbox.sh', description: 'Vercel' }
]

const localHost: RunTargetHostOption = {
  id: 'setup-local',
  hostId: 'local',
  label: 'Local Mac',
  detail: 'This machine',
  available: true
}

describe('buildRunTargetRows', () => {
  it('lists every recipe as its own row, after the hosts and before Add host', () => {
    const { rows } = buildRunTargetRows({
      hostOptions: [localHost],
      recipes,
      query: '',
      hasAddHost: true
    })

    expect(rows.map((row) => row.key)).toEqual([
      'host:setup-local',
      'recipe:local-docker-ssh',
      'recipe:cloud-sandbox',
      'add-host'
    ])
    expect(rows.filter((row) => row.kind === 'recipe')).toHaveLength(2)
  })

  it('filters recipes by name or description and keeps Add host', () => {
    const byName = buildRunTargetRows({
      hostOptions: [localHost],
      recipes,
      query: 'docker',
      hasAddHost: true
    })
    expect(byName.rows.map((row) => row.key)).toEqual(['recipe:local-docker-ssh', 'add-host'])

    const byDescription = buildRunTargetRows({
      hostOptions: [],
      recipes,
      query: 'vercel',
      hasAddHost: false
    })
    expect(byDescription.rows.map((row) => row.key)).toEqual(['recipe:cloud-sandbox'])
  })

  it('has no recipe rows when the project defines none', () => {
    const { rows } = buildRunTargetRows({
      hostOptions: [localHost],
      recipes: [],
      query: '',
      hasAddHost: false
    })

    expect(rows.map((row) => row.kind)).toEqual(['host'])
  })
})
