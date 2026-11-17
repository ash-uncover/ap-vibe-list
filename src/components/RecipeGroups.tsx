import { useMemo } from 'react'
import { formatAmount, type AttachedRecipe, type Ingredient } from '../github/model'

interface Props {
  recipes: AttachedRecipe[]
  catalog: Ingredient[]
  /** When provided, each group shows a "Remove recipe" button. */
  onDetach?: (recipeId: string) => void
}

export function RecipeGroups({ recipes, catalog, onDetach }: Props) {
  const byId = useMemo(() => new Map(catalog.map((i) => [i.id, i] as const)), [catalog])
  if (recipes.length === 0) return null

  return (
    <div className="rgroups">
      {recipes.map((g) => (
        <details key={g.recipeId} className="rgroup">
          <summary className="rgroup__summary">
            <span className="rgroup__name">{g.name}</span>
            <span className="rows__meta">
              {g.items.length} item{g.items.length === 1 ? '' : 's'}
            </span>
          </summary>
          <ul className="rgroup__items">
            {g.items.map((it) => (
              <li key={`${it.ingredientId}|${it.unit}`} className="rgroup__item">
                <span className="rgroup__item-name">
                  {byId.get(it.ingredientId)?.name ?? 'Unknown item'}
                </span>
                <span className="rows__meta">{formatAmount(it.quantity, it.unit)}</span>
              </li>
            ))}
          </ul>
          {onDetach && (
            <button className="btn btn--sm btn--danger" onClick={() => onDetach(g.recipeId)}>
              Remove recipe
            </button>
          )}
        </details>
      ))}
    </div>
  )
}
