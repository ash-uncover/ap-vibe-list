import { Link } from 'react-router'
import { useMemo } from 'react'
import { DATA_PATHS } from '../github/data'
import { ingredientLabelNames, normalizeUnit, unitLabel, type Ingredient, type Label } from '../github/model'
import { useCollection } from '../hooks/useCollection'
import { Chip, EmptyState, ErrorNote, Loading, PageHead, ReadOnlyBanner } from '../components/ui'

export function IngredientsList() {
  const { data, loading, error, reload } = useCollection<Ingredient>(DATA_PATHS.ingredients)
  const labels = useCollection<Label>(DATA_PATHS.labels)

  const byId = useMemo(
    () => new Map((labels.data ?? []).map((l) => [l.id, l] as const)),
    [labels.data],
  )

  const sorted = data
    ? [...data].sort((a, b) => a.name.localeCompare(b.name))
    : []

  return (
    <div className="stack">
      <PageHead
        title="Ingredients"
        action={
          <div className="row">
            <Link to="/ingredients/labels" className="btn btn--sm">
              Manage labels
            </Link>
            <Link to="/ingredients/new" className="btn btn--primary btn--sm">
              New
            </Link>
          </div>
        }
      />
      <ReadOnlyBanner />

      {loading && <Loading />}
      {error && <ErrorNote error={error} onRetry={reload} />}

      {data && !loading && !error && (
        sorted.length === 0 ? (
          <EmptyState
            title="No ingredients yet"
            hint="Add the things you buy — they become the building blocks for recipes and lists."
            action={
              <Link to="/ingredients/new" className="btn btn--primary">
                Add your first ingredient
              </Link>
            }
          />
        ) : (
          <ul className="rows">
            {sorted.map((i) => {
              const names = ingredientLabelNames(i, byId)
              const warning =
                names.length === 0
                  ? 'No label — add one so it groups correctly while shopping.'
                  : names.length > 1
                    ? 'Multiple labels — it will group under only one while shopping.'
                    : null
              return (
                <li key={i.id}>
                  <Link to={`/ingredients/${i.id}`} className="rows__item">
                    <span className="rows__main">{i.name}</span>
                    {warning && (
                      <span className="rows__warn" role="img" aria-label={warning} title={warning}>
                        ⚠️
                      </span>
                    )}
                    {names.length > 0 && (
                      <span className="rows__chips">
                        {names.map((l) => (
                          <Chip key={l}>{l}</Chip>
                        ))}
                      </span>
                    )}
                    <span className="rows__unit">{unitLabel(normalizeUnit(i.defaultUnit))}</span>
                    <span className="rows__chevron" aria-hidden>
                      ›
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )
      )}
    </div>
  )
}
