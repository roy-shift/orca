export type DirectWorkItemPromptDelivery = 'draft' | 'submit-after-ready'

/** An explicit choice wins; otherwise the user's setting decides between reviewing and running. */
export function resolveDirectWorkItemPromptDelivery(
  explicit: DirectWorkItemPromptDelivery | undefined,
  settings: { autoRunLinkedTaskPrompt?: boolean } | null | undefined
): DirectWorkItemPromptDelivery {
  return explicit ?? (settings?.autoRunLinkedTaskPrompt === true ? 'submit-after-ready' : 'draft')
}
