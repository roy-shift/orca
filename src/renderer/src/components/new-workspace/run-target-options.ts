import type { OrcaHooks } from '../../../../shared/orca-yaml-hook-types'
import type {
  NeedsSetupProjectHostOption,
  ProjectHostSetupOption,
  ReadyProjectHostSetupOption
} from '@/lib/project-host-setup-options'
import { translate } from '@/i18n/i18n'

export type EphemeralVmRecipeOption = NonNullable<OrcaHooks['environmentRecipes']>[number]

export const RUN_TARGET_ADD_HOST_KEY = 'add-host'

/** A row in the run-target list. Hosts and recipes commit; "Add host" opens a submenu. */
export type RunTargetRowModel =
  | { key: string; kind: 'ready'; option: ReadyProjectHostSetupOption }
  | { key: string; kind: 'needs-setup'; option: NeedsSetupProjectHostOption }
  | { key: string; kind: 'recipe'; recipe: EphemeralVmRecipeOption }
  | { key: typeof RUN_TARGET_ADD_HOST_KEY; kind: 'add-host' }

export function getEphemeralVmLabel(): string {
  return translate(
    'auto.components.NewWorkspaceComposerCard.ephemeralVm',
    'Per-Workspace Environment'
  )
}

export function getRecipeCommandDisplay(command: string): string {
  const trimmed = command.trim()
  const quoted = trimmed.match(/^"([^"]+)"/) ?? trimmed.match(/^'([^']+)'/)
  return quoted?.[1] ?? trimmed.split(/\s+/)[0] ?? trimmed
}

export function getRecipeDestroyLabel(recipe: EphemeralVmRecipeOption): string {
  if (recipe.destroyDisabled) {
    return translate('auto.components.NewWorkspaceComposerCard.destroyDisabled', 'destroy disabled')
  }
  if (recipe.destroy) {
    return translate(
      'auto.components.NewWorkspaceComposerCard.destroyConfigured',
      'destroy configured'
    )
  }
  return translate('auto.components.NewWorkspaceComposerCard.noDestroyConfigured', 'no destroy')
}

/** One line under a recipe name: what it runs and whether it tears down. */
export function getRecipeDetail(recipe: EphemeralVmRecipeOption): string {
  return `${getRecipeCommandDisplay(recipe.create)} · ${getRecipeDestroyLabel(recipe)}`
}

function matches(haystack: string, query: string): boolean {
  return haystack.toLowerCase().includes(query)
}

/**
 * Filters hosts and recipes by a typed query. Each recipe is its own row, listed after
 * the hosts. "Add host" always survives filtering, so it stays reachable in every
 * state including no-matches.
 */
export function buildRunTargetRows({
  hostOptions,
  recipes,
  query,
  hasAddHost
}: {
  hostOptions: readonly ProjectHostSetupOption[]
  recipes: readonly EphemeralVmRecipeOption[]
  query: string
  hasAddHost: boolean
}): { rows: RunTargetRowModel[] } {
  const trimmed = query.trim().toLowerCase()
  const hostMatches = (option: ProjectHostSetupOption): boolean =>
    trimmed === '' ||
    matches(option.label, trimmed) ||
    matches(option.detail, trimmed) ||
    (option.kind === 'ready' && matches(option.path, trimmed))

  const ready = hostOptions.filter(
    (option): option is ReadyProjectHostSetupOption =>
      option.kind === 'ready' && hostMatches(option)
  )
  const needsSetup = hostOptions.filter(
    (option): option is NeedsSetupProjectHostOption =>
      option.kind === 'needs-setup' && hostMatches(option)
  )
  const matchedRecipes = recipes.filter(
    (recipe) =>
      trimmed === '' ||
      matches(recipe.name, trimmed) ||
      matches(getEphemeralVmLabel(), trimmed) ||
      matches(recipe.description ?? '', trimmed)
  )

  const rows: RunTargetRowModel[] = [
    ...ready.map((option) => ({ key: `host:${option.id}`, kind: 'ready' as const, option })),
    ...needsSetup.map((option) => ({
      key: `needs:${option.id}`,
      kind: 'needs-setup' as const,
      option
    }))
  ]
  rows.push(
    ...matchedRecipes.map((recipe) => ({
      key: `recipe:${recipe.id}`,
      kind: 'recipe' as const,
      recipe
    }))
  )
  if (hasAddHost) {
    rows.push({ key: RUN_TARGET_ADD_HOST_KEY, kind: 'add-host' })
  }
  return { rows }
}
