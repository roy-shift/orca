import { describe, expect, it } from 'vitest'
import { resolveQuickCreateLinkedWorkItemPrompt } from './linked-work-item-context'

const LINEAR_ITEM = {
  provider: 'linear' as const,
  number: 0,
  url: 'https://linear.app/acme/issue/ENG-123/test',
  title: 'Fix launch context handoff',
  linearIdentifier: 'ENG-123'
}

const JIRA_ITEM = {
  provider: 'jira' as const,
  number: 0,
  url: 'https://acme.atlassian.net/browse/ENG-9'
}

describe('resolveQuickCreateLinkedWorkItemPrompt with autoRun', () => {
  it('hands a Jira link to the agent as its prompt instead of an unsent draft', () => {
    expect(
      resolveQuickCreateLinkedWorkItemPrompt(JIRA_ITEM, '  fix this  ', { autoRun: true })
    ).toEqual({
      prompt: 'fix this\n\nhttps://acme.atlassian.net/browse/ENG-9',
      draftPrompt: null
    })
    expect(resolveQuickCreateLinkedWorkItemPrompt(JIRA_ITEM, 'fix this')).toEqual({
      prompt: '',
      draftPrompt: 'fix this\n\nhttps://acme.atlassian.net/browse/ENG-9'
    })
  })

  it('sends the labeled Linear reference without its trailing newline', () => {
    const result = resolveQuickCreateLinkedWorkItemPrompt(LINEAR_ITEM, '', { autoRun: true })

    expect(result.draftPrompt).toBeNull()
    expect(result.prompt).toBe(
      'Linked Linear issue: ENG-123\nhttps://linear.app/acme/issue/ENG-123/test'
    )
  })

  it('has nothing to run when there is no link and no note', () => {
    expect(resolveQuickCreateLinkedWorkItemPrompt(null, '', { autoRun: true })).toEqual({
      prompt: '',
      draftPrompt: null
    })
  })
})
