import { describe, expect, it } from 'vitest'
import { resolveDirectWorkItemPromptDelivery } from './launch-work-item-direct-prompt-delivery'

describe('resolveDirectWorkItemPromptDelivery', () => {
  it('leaves the task as a draft unless the user turned auto-run on', () => {
    expect(resolveDirectWorkItemPromptDelivery(undefined, undefined)).toBe('draft')
    expect(resolveDirectWorkItemPromptDelivery(undefined, {})).toBe('draft')
    expect(resolveDirectWorkItemPromptDelivery(undefined, { autoRunLinkedTaskPrompt: false })).toBe(
      'draft'
    )
  })

  it('submits once the agent is ready when auto-run is on', () => {
    expect(resolveDirectWorkItemPromptDelivery(undefined, { autoRunLinkedTaskPrompt: true })).toBe(
      'submit-after-ready'
    )
  })

  it('keeps an explicit choice over the setting', () => {
    expect(resolveDirectWorkItemPromptDelivery('draft', { autoRunLinkedTaskPrompt: true })).toBe(
      'draft'
    )
    expect(resolveDirectWorkItemPromptDelivery('submit-after-ready', null)).toBe(
      'submit-after-ready'
    )
  })
})
