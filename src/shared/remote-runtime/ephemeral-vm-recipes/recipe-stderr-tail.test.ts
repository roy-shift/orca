import { describe, expect, it } from 'vitest'
import { appendRecipeStderrTail } from './ephemeral-vm-recipe-diagnostic-redaction'

describe('appendRecipeStderrTail', () => {
  it('says why a recipe script failed, without leaking credentials', () => {
    const error = appendRecipeStderrTail(
      'Recipe resume exited with code 1',
      [
        '==> Starting container orca-1',
        'sshd did not come back up in time',
        'pair orca://pair?code=SECRETCODE123',
        ''
      ].join('\n')
    )

    expect(error).toContain('exited with code 1')
    expect(error).toContain('sshd did not come back up in time')
    expect(error).toContain('orca://pair?code=[redacted]')
    expect(error).not.toContain('SECRETCODE123')
  })

  it('keeps only the last lines and leaves a quiet failure alone', () => {
    const stderr = Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n')

    expect(appendRecipeStderrTail('failed', stderr).split('\n')).toEqual([
      'failed',
      ...Array.from({ length: 8 }, (_, index) => `line ${index + 12}`)
    ])
    expect(appendRecipeStderrTail('failed', '  \n')).toBe('failed')
    expect(appendRecipeStderrTail('failed', undefined)).toBe('failed')
  })
})
