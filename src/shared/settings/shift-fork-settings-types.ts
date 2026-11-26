/** Settings only the Shift fork has, kept apart from upstream's GlobalSettings to ease merges. */
export type ShiftForkSettings = {
  /** Start the agent on a picked task's link instead of leaving it as an unsent draft. */
  autoRunLinkedTaskPrompt?: boolean
  /** Recipe id that Run on starts with in the new-workspace composer; null keeps the host default. */
  defaultEphemeralVmRecipeId?: string | null
}
