import React from 'react'
import { Cloud } from 'lucide-react'
import { HostRowIcon } from '../../host-picker/host-row-icon'
import { RunTargetRow } from './RunTargetComboboxRow'
import {
  getRecipeDetail,
  type RunTargetHostOption,
  type RunTargetRowModel
} from './run-target-options'
import { useTranslate } from '@/i18n/use-translate'

/** The scrolling rows of the run-target picker; Add host is pinned below them. */
export default function RunTargetRowList({
  rows,
  armedKey,
  listId,
  selectedHostId,
  selectedRecipeId,
  onArm,
  onSelectHost,
  onSelectRecipe
}: {
  rows: readonly RunTargetRowModel[]
  armedKey: string | null
  listId: string
  selectedHostId: string | null
  selectedRecipeId: string | null
  onArm: (key: string) => void
  onSelectHost: (option: RunTargetHostOption) => void
  onSelectRecipe: (recipeId: string) => void
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <>
      {rows.map((row) => {
        if (row.kind === 'add-host') {
          return null
        }
        const armed = armedKey === row.key
        const optionId = armed ? `${listId}-armed` : undefined
        if (row.kind === 'host') {
          const { option } = row
          const select = () => onSelectHost(option)
          return (
            <RunTargetRow
              key={row.key}
              icon={option.icon ?? <HostRowIcon hostId={option.hostId} />}
              label={option.label}
              detail={option.detail}
              description={option.description}
              armed={armed}
              current={option.id === selectedHostId}
              dimmed={!option.available}
              disabled={!option.onSelect && !option.trailing}
              optionId={optionId}
              onArm={() => onArm(row.key)}
              onCommit={select}
              trailing={option.trailing?.(select)}
            />
          )
        }
        return (
          <RunTargetRow
            key={row.key}
            icon={<Cloud className="size-3.5 shrink-0 text-muted-foreground" />}
            label={row.recipe.name}
            detail={getRecipeDetail(row.recipe, t)}
            armed={armed}
            current={row.recipe.id === selectedRecipeId}
            optionId={optionId}
            onArm={() => onArm(row.key)}
            onCommit={() => onSelectRecipe(row.recipe.id)}
          />
        )
      })}
    </>
  )
}
